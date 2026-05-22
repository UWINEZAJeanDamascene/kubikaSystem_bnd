const EBM_STOCK_TYPE_CODES = Object.freeze({
  // RRA Stock In/Out Type 01: imported goods confirmed into stock.
  IMPORT_CONFIRMED_STOCK_IN: '01',

  // RRA Stock In/Out Type 02: purchase receipt / GRN stock-in.
  GRN_PURCHASE_RECEIPT: '02',

  // RRA Stock In/Out Type 03: goods returned by customer.
  CUSTOMER_RETURN_IN: '03',

  // RRA Stock In/Out Type 04: branch transfer stock-in at destination.
  BRANCH_TRANSFER_IN: '04',

  // RRA Stock In/Out Type 06: adjustment stock-in.
  STOCK_ADJUSTMENT_IN: '06',

  // RRA Stock In/Out Type 11: stock-out due to sale.
  SALE_OUT: '11',

  // RRA Stock In/Out Type 12: stock-out due to supplier return.
  SUPPLIER_RETURN_OUT: '12',

  // RRA Stock In/Out Type 13: branch transfer stock-out from source.
  BRANCH_TRANSFER_OUT: '13',

  // RRA Stock In/Out Type 16: adjustment stock-out.
  STOCK_ADJUSTMENT_OUT: '16',

  // The VSDC code table has no dedicated opening-stock code in section 4.15.
  // Opening balances are reported as adjustment stock-in when they are created.
  OPENING_STOCK: '06',
});

function getAdjustmentCode(direction) {
  return direction === 'in'
    ? EBM_STOCK_TYPE_CODES.STOCK_ADJUSTMENT_IN
    : EBM_STOCK_TYPE_CODES.STOCK_ADJUSTMENT_OUT;
}

module.exports = {
  EBM_STOCK_TYPE_CODES,
  getAdjustmentCode,
};
