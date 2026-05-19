const SubscriptionPlan = require('../models/SubscriptionPlan');

class SubscriptionPlanService {
  static async getAllPlans(activeOnly = false) {
    const query = activeOnly ? { is_active: true } : {};
    return SubscriptionPlan.find(query).sort({ sort_order: 1, createdAt: 1 }).lean();
  }

  static async getPlanByKey(key) {
    return SubscriptionPlan.findOne({ key }).lean();
  }

  static async createPlan(data) {
    const existing = await SubscriptionPlan.findOne({ key: data.key.toLowerCase() });
    if (existing) {
      const error = new Error('PLAN_KEY_EXISTS');
      error.code = 'PLAN_KEY_EXISTS';
      throw error;
    }
    return SubscriptionPlan.create(data);
  }

  static async updatePlan(key, data) {
    const plan = await SubscriptionPlan.findOneAndUpdate(
      { key },
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!plan) {
      const error = new Error('PLAN_NOT_FOUND');
      error.code = 'PLAN_NOT_FOUND';
      throw error;
    }
    return plan;
  }

  static async deletePlan(key) {
    const plan = await SubscriptionPlan.findOneAndDelete({ key });
    if (!plan) {
      const error = new Error('PLAN_NOT_FOUND');
      error.code = 'PLAN_NOT_FOUND';
      throw error;
    }
    return plan;
  }

  static async seedDefaultPlans() {
    const defaults = [
      {
        key: 'starter',
        name: 'Starter',
        description: 'Core operations for small businesses',
        features: ['inventory', 'sales', 'finance'],
        modules: [
          'Inventory Core|Products & Categories',
          'Inventory Core|Warehouses',
          'Inventory Core|Stock Levels',
          'Inventory Core|Stock Movements',
          'Revenue Flow|POS',
          'Revenue Flow|Quotations & Sales Orders',
          'Revenue Flow|Invoices',
          'Revenue Flow|Delivery Notes',
          'Finance Control|Bank Accounts',
          'Finance Control|Journal Entries',
          'Finance Control|Petty Cash',
          'Finance Control|Expenses'
        ],
        outcomes: ['included|control|Control Room included'],
        badge: 'Entry tier',
        icon: 'Boxes',
        featured: false,
        button_label: 'Learn more',
        default_billing_amount: 10000,
        default_billing_cycle: 'monthly',
        sort_order: 1
      },
      {
        key: 'professional',
        name: 'Growth',
        description: 'Full operations + supply chain',
        features: ['inventory', 'sales', 'purchases', 'finance', 'reports'],
        modules: [
          'Everything in Starter, plus|Inventory Core (Full)',
          'Inventory Core (Full)|Batches & Serial Numbers',
          'Revenue Flow (Full)|Clients',
          'Revenue Flow (Full)|Pick Packs',
          'Revenue Flow (Full)|Credit Notes',
          'Revenue Flow (Full)|Recurring Invoices',
          'Revenue Flow (Full)|Accounts Receivable & Payable',
          'Supply Chain|Suppliers',
          'Supply Chain|Purchase Orders',
          'Supply Chain|Goods Received',
          'Supply Chain|Purchase Returns & Purchases',
          'Finance Control|Chart of Accounts',
          'Finance Control|Liabilities & Fixed Assets',
          'Finance Control|Budgets & Budget Settings',
          'Intelligence|Reports Hub',
          'Intelligence|Profit & Loss',
          'Intelligence|Cash Flow'
        ],
        outcomes: ['included|control|Control Room included'],
        badge: 'Most popular',
        icon: 'BarChart3',
        featured: true,
        button_label: 'Get started',
        default_billing_amount: 15000,
        default_billing_cycle: 'monthly',
        sort_order: 2
      },
      {
        key: 'enterprise',
        name: 'Enterprise',
        description: 'Full suite + AI-powered intelligence',
        features: ['inventory', 'sales', 'purchases', 'finance', 'payroll', 'reports', 'projects', 'fixed_assets', 'ai_assistant', 'integrations'],
        modules: [
          'Everything in Growth, plus|Finance Control (Full)',
          'Finance Control (Full)|Employees & Departments',
          'Finance Control (Full)|Payroll & Payroll Runs',
          'Finance Control (Full)|Accounting Periods',
          'Finance Control (Full)|Projects',
          'Intelligence|Balance Sheet',
          'Intelligence|Financial Ratios',
          'Intelligence|Debt Maturity'
        ],
        outcomes: [
          'included|ai|Stacy AI Assistant included',
          'included|control|Control Room included'
        ],
        badge: 'Full access',
        icon: 'ShieldCheck',
        featured: false,
        button_label: 'Learn more',
        default_billing_amount: 30000,
        default_billing_cycle: 'monthly',
        sort_order: 3
      }
    ];

    for (const plan of defaults) {
      await SubscriptionPlan.findOneAndUpdate(
        { key: plan.key },
        { $set: plan },
        { upsert: true, new: true }
      );
    }
  }
}

module.exports = SubscriptionPlanService;
