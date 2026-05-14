const mongoose = require('mongoose');
const Product = require('../models/Product');
const PurchaseOrder = require('../models/PurchaseOrder');
const StockLevel = require('../models/StockLevel');
const StockMovement = require('../models/StockMovement');
const { notifyAutoPurchaseOrderCreated } = require('./notificationHelper');

function toNumber(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value.toString) {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toObjectId(value) {
  if (!value) return null;
  return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value));
}

function shouldCheckMovement(movement) {
  if (!movement || movement.__skipAutoReorder) return false;
  if (!movement.product && !movement.product_id) return false;
  if (!movement.company && !movement.company_id) return false;

  if (movement.type === 'out') return true;
  if (movement.type === 'adjustment') return true;

  const reorderReasons = new Set([
    'sale',
    'damage',
    'loss',
    'theft',
    'expired',
    'correction',
    'audit_shortage',
    'dispatch',
    'transfer_out'
  ]);
  return reorderReasons.has(movement.reason);
}

class AutoPurchaseOrderService {
  static async handleStockMovementSaved(movement) {
    if (!shouldCheckMovement(movement)) return null;

    try {
      return await this.checkAndCreateForItem({
        companyId: movement.company || movement.company_id,
        productId: movement.product || movement.product_id,
        performedBy: movement.performedBy || null
      });
    } catch (error) {
      console.error('[AutoPO] Reorder check failed:', error.message);
      return null;
    }
  }

  static async getCurrentStock(companyId, productId) {
    const companyObjectId = toObjectId(companyId);
    const productObjectId = toObjectId(productId);

    const totals = await StockLevel.aggregate([
      {
        $match: {
          company_id: companyObjectId,
          product_id: productObjectId
        }
      },
      {
        $group: {
          _id: '$product_id',
          qty_on_hand: { $sum: '$qty_on_hand' }
        }
      }
    ]);

    if (totals.length > 0) {
      return toNumber(totals[0].qty_on_hand);
    }

    const product = await Product.findOne({ _id: productObjectId, company: companyObjectId })
      .select('currentStock')
      .lean();
    return toNumber(product?.currentStock);
  }

  static async getLastPurchaseCost(companyId, productId, product) {
    const latestPurchase = await StockMovement.findOne({
      $and: [
        { $or: [{ company: companyId }, { company_id: companyId }] },
        { $or: [{ product: productId }, { product_id: productId }] }
      ],
      type: 'in',
      reason: 'purchase'
    })
      .sort({ movementDate: -1, createdAt: -1 })
      .select('unitCost')
      .lean();

    const latestCost = toNumber(latestPurchase?.unitCost);
    if (latestCost > 0) return latestCost;

    const averageCost = toNumber(product.averageCost);
    if (averageCost > 0) return averageCost;

    return toNumber(product.costPrice);
  }

  static async checkAndCreateForItem({ companyId, productId, performedBy = null }) {
    const companyObjectId = toObjectId(companyId);
    const productObjectId = toObjectId(productId);

    const product = await Product.findOne({
      _id: productObjectId,
      company: companyObjectId,
      isArchived: { $ne: true },
      isActive: { $ne: false }
    }).lean();

    if (!product || product.isStockable === false) return null;

    const reorderPoint = toNumber(product.reorderPoint);
    if (reorderPoint <= 0) return null;

    const currentStock = await this.getCurrentStock(companyObjectId, productObjectId);
    if (currentStock > reorderPoint) return null;

    const preferredSupplierId = product.preferredSupplier || product.preferredSupplierId || product.supplier;
    if (!preferredSupplierId) {
      console.warn(`[AutoPO] Skipping ${product.name || productObjectId}: no preferred supplier set`);
      return null;
    }

    const existingDraft = await PurchaseOrder.findOne({
      company: companyObjectId,
      source: 'AUTO',
      status: 'draft',
      autoReorderProduct: productObjectId,
      'lines.product': productObjectId
    }).lean();

    if (existingDraft) return existingDraft;

    const reorderQty = toNumber(product.reorderQuantity) || Math.max(reorderPoint - currentStock, reorderPoint);
    if (reorderQty <= 0) return null;

    const unitCost = await this.getLastPurchaseCost(companyObjectId, productObjectId, product);

    const purchaseOrder = await PurchaseOrder.create({
      company: companyObjectId,
      supplier: preferredSupplierId,
      warehouse: product.defaultWarehouse || undefined,
      status: 'draft',
      source: 'AUTO',
      autoReorderProduct: productObjectId,
      orderDate: new Date(),
      createdBy: performedBy || undefined,
      notes: `Auto reorder draft for ${product.name}. Current stock ${currentStock}, reorder point ${reorderPoint}.`,
      lines: [{
        product: productObjectId,
        qtyOrdered: reorderQty,
        unitCost,
        taxRate: 0
      }]
    });

    await notifyAutoPurchaseOrderCreated(companyObjectId, product, purchaseOrder, currentStock);
    return purchaseOrder;
  }
}

module.exports = AutoPurchaseOrderService;
