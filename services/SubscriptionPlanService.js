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
        key: 'trial',
        name: 'Trial',
        description: 'Free trial with limited features. No credit card required.',
        features: ['inventory', 'sales', 'purchases', 'reports'],
        modules: ['Dashboards', 'Products and categories', 'Warehouses', 'Stock levels and movements', 'Suppliers', 'Purchase orders', 'GRN', 'Clients', 'Quotations', 'Invoices', 'POS', 'Batches', 'Serial numbers'],
        outcomes: ['Track stock across warehouses', 'Manage suppliers and customers', 'Create quotes and invoices', 'View operational metrics'],
        badge: 'ENTRY TIER',
        icon: 'Boxes',
        featured: false,
        button_label: 'Start free trial',
        default_billing_amount: 0,
        default_billing_cycle: 'monthly',
        sort_order: 0
      },
      {
        key: 'starter',
        name: 'Core Operations',
        description: 'Product records, stock tracking, sales documents and purchase orders. No finance modules included.',
        features: ['inventory', 'sales', 'purchases', 'reports'],
        modules: ['Dashboards', 'Products and categories', 'Warehouses', 'Stock levels and movements', 'Suppliers', 'Purchase orders', 'GRN', 'Clients', 'Quotations', 'Invoices', 'POS', 'Batches', 'Serial numbers'],
        outcomes: ['Track stock across warehouses', 'Manage suppliers and customers', 'Create quotes and invoices', 'View operational metrics'],
        badge: 'ENTRY TIER',
        icon: 'Boxes',
        featured: false,
        button_label: 'Choose 10k',
        default_billing_amount: 10000,
        default_billing_cycle: 'monthly',
        sort_order: 1
      },
      {
        key: 'professional',
        name: 'Business Command',
        description: 'Everything in Core plus banking, accounts receivable, accounts payable, expenses and reporting.',
        features: ['inventory', 'sales', 'purchases', 'finance', 'reports', 'projects', 'fixed_assets'],
        modules: ['Everything in Core', 'Sales orders', 'Pick and pack', 'Delivery notes', 'Credit notes', 'Recurring invoices', 'AR and AP', 'Bank accounts', 'Petty cash', 'Expenses', 'Reports hub', 'Batches', 'Serial numbers'],
        outcomes: ['Track cash and bank balances', 'Manage what you owe and are owed', 'Recurring billing setup', 'Standard business reports'],
        badge: 'MID-TIER',
        icon: 'BarChart3',
        featured: true,
        button_label: 'Choose 15k',
        default_billing_amount: 15000,
        default_billing_cycle: 'monthly',
        sort_order: 2
      },
      {
        key: 'enterprise',
        name: 'Enterprise Control',
        description: 'All modules including accounting, payroll, budgets, projects and system administration.',
        features: ['inventory', 'sales', 'purchases', 'finance', 'payroll', 'reports', 'projects', 'fixed_assets', 'ai_assistant', 'integrations'],
        modules: ['Everything in Business', 'Chart of accounts', 'Journal entries', 'Fixed assets', 'Liabilities', 'Budgets', 'Projects', 'Employees', 'Payroll runs', 'Financial reports', 'Security, roles and audit trail', 'Backups and bulk data', 'Batches', 'Serial numbers'],
        outcomes: ['Full general ledger and journals', 'Run payroll and manage staff', 'Project and budget tracking', 'Role-based access and audit logs'],
        badge: 'FULL ACCESS',
        icon: 'ShieldCheck',
        featured: false,
        button_label: 'Choose 30k',
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
