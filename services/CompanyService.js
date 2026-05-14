const mongoose = require('mongoose');
const Company = require('../models/Company');
const Role = require('../models/Role');
const User = require('../models/User');
const AuditLogService = require('./AuditLogService');
const ChartOfAccount = require('../models/ChartOfAccount');
const SubscriptionPlanService = require('./SubscriptionPlanService');
const { CHART_OF_ACCOUNTS } = require('../constants/chartOfAccounts');

let PLAN_FEATURES = {
  trial: ['inventory', 'sales', 'purchases', 'reports'],
  starter: ['inventory', 'sales', 'purchases', 'reports'],
  professional: ['inventory', 'sales', 'purchases', 'finance', 'reports', 'projects', 'fixed_assets'],
  enterprise: ['inventory', 'sales', 'purchases', 'finance', 'payroll', 'reports', 'projects', 'fixed_assets', 'ai_assistant', 'integrations']
};

let PLAN_MODULES = {
  trial: ['Dashboards', 'Products and categories', 'Warehouses', 'Stock levels and movements', 'Suppliers', 'Purchase orders', 'GRN', 'Clients', 'Quotations', 'Invoices', 'POS'],
  starter: ['Dashboards', 'Products and categories', 'Warehouses', 'Stock levels and movements', 'Suppliers', 'Purchase orders', 'GRN', 'Clients', 'Quotations', 'Invoices', 'POS'],
  professional: ['Everything in Core', 'Sales orders', 'Pick and pack', 'Delivery notes', 'Credit notes', 'Recurring invoices', 'AR and AP', 'Bank accounts', 'Petty cash', 'Expenses', 'Reports hub', 'Batches', 'Serial numbers'],
  enterprise: ['Everything in Business', 'Chart of accounts', 'Journal entries', 'Fixed assets', 'Liabilities', 'Budgets', 'Projects', 'Employees', 'Payroll runs', 'Financial reports', 'Security, roles and audit trail', 'Backups and bulk data', 'Batches', 'Serial numbers']
};

const FEATURE_KEYS = [
  'inventory',
  'sales',
  'purchases',
  'finance',
  'payroll',
  'reports',
  'projects',
  'fixed_assets',
  'ai_assistant',
  'integrations'
];

async function loadPlanFeatures() {
  try {
    await SubscriptionPlanService.seedDefaultPlans();
    const plans = await SubscriptionPlanService.getAllPlans(true);
    const dynamic = {};
    const dynamicModules = {};
    for (const p of plans) {
      dynamic[p.key] = p.features || [];
      dynamicModules[p.key] = p.modules || [];
    }
    if (Object.keys(dynamic).length > 0) {
      PLAN_FEATURES = dynamic;
      PLAN_MODULES = dynamicModules;
    }
  } catch (e) {
    console.error('Failed to load subscription plans, using defaults:', e);
  }
}

function buildFeatureAccess(plan, overrides = {}) {
  const included = new Set(PLAN_FEATURES[plan] || PLAN_FEATURES.trial || []);
  return FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = Object.prototype.hasOwnProperty.call(overrides, key)
      ? Boolean(overrides[key])
      : included.has(key);
    return acc;
  }, {});
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function serializeCompany(row) {
  const featureAccess = buildFeatureAccess(row.subscription_plan || 'trial', row.feature_access || {});
  const enabledModules = FEATURE_KEYS.filter((key) => featureAccess[key]);
  const subscriptionModules = PLAN_MODULES[row.subscription_plan || 'trial'] || PLAN_MODULES.trial || [];
  return {
    _id: row._id,
    name: row.name,
    code: row.code,
    legal_name: row.legal_name || null,
    email: row.email,
    phone: row.phone || '',
    website: row.website || '',
    registration_number: row.registration_number || '',
    tax_identification_number: row.tax_identification_number || '',
    industry: row.industry || '',
    logo_url: row.logo_url || '',
    address: row.address || {},
    base_currency: row.base_currency || 'RWF',
    tin: row.tax_identification_number || row.registration_number || '',
    approvalStatus: row.approvalStatus,
    status: row.approvalStatus,
    isActive: row.isActive,
    subscription_plan: row.subscription_plan || 'trial',
    subscription_status: row.subscription_status || 'trialing',
    billing_cycle: row.billing_cycle || 'monthly',
    billing_amount: row.billing_amount || 0,
    next_billing_date: row.next_billing_date || null,
    feature_access: featureAccess,
    enabledModuleCount: enabledModules.length,
    enabledModules,
    subscription_modules: subscriptionModules,
    platform_notes: row.platform_notes || '',
    trial_ends_at: row.trial_ends_at || null,
    last_payment_reminder_at: row.last_payment_reminder_at || null,
    last_platform_message_at: row.last_platform_message_at || null,
    registration_rejection_reason: row.registration_rejection_reason || null,
    setup_completed: Boolean(row.setup_completed),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

class CompanyService {

  /**
   * Create a new company
   * @param {object} data - Company data
   * @param {string} createdByUserId - ID of user creating the company
   */
  static async create(data, createdByUserId) {
    // code must be uppercase alphanumeric only
    if (!/^[A-Z0-9]{2,10}$/.test(data.code?.toUpperCase())) {
      throw new Error('INVALID_COMPANY_CODE: must be 2-10 uppercase alphanumeric characters');
    }

    const existing = await Company.findOne({ code: data.code.toUpperCase() });
    if (existing) throw new Error('COMPANY_CODE_TAKEN');

    const company = await Company.create({
      ...data,
      code: data.code.toUpperCase(),
      created_by: createdByUserId
    });

    // Log the creation
    await AuditLogService.log({
      companyId: company._id,
      userId: createdByUserId,
      action: 'company.create',
      entityType: 'company',
      entityId: company._id,
      changes: data
    });

    // Seed chart of accounts for the new company
    try {
      const accounts = Object.entries(CHART_OF_ACCOUNTS).map(([code, account]) => ({
        company: company._id,
        code,
        name: account.name,
        type: account.type,
        subtype: account.subtype,
        normal_balance: account.normalBalance,
        allow_direct_posting: account.allowDirectPosting,
        isActive: true,
        createdBy: createdByUserId,
      }));
      await ChartOfAccount.insertMany(accounts);
      console.log(`Seeded ${accounts.length} chart of accounts for company ${company._id}`);
    } catch (seedError) {
      console.error('Error seeding chart of accounts:', seedError);
      // Don't fail company creation if seeding fails
    }

    return company;
  }

  /**
   * Public self-service registration (pending platform approval)
   */
  static async registerPublicCompany({ company: c, admin: a }) {
    const User = require('../models/User');

    const emailCompany = (c.email || '').toLowerCase().trim();
    const emailAdmin = (a.email || '').toLowerCase().trim();

    if (!emailCompany || !c.name || !emailAdmin || !a.name || !a.password) {
      throw new Error('MISSING_REQUIRED_FIELDS');
    }
    if (a.password.length < 8) {
      const err = new Error('PASSWORD_TOO_SHORT');
      err.code = 'PASSWORD_TOO_SHORT';
      throw err;
    }

    const dupCompany = await Company.findOne({ email: emailCompany });
    if (dupCompany) {
      const err = new Error('COMPANY_EMAIL_ALREADY_REGISTERED');
      err.code = 'COMPANY_EMAIL_ALREADY_REGISTERED';
      throw err;
    }

    const platformAdminEmail = await User.findOne({ email: emailAdmin, role: 'platform_admin' });
    if (platformAdminEmail) {
      const err = new Error('EMAIL_NOT_AVAILABLE');
      err.code = 'EMAIL_NOT_AVAILABLE';
      throw err;
    }

    const selectedPlan = (c.subscription_plan || 'trial').toString().trim();
    const company = await Company.create({
      name: c.name.trim(),
      email: emailCompany,
      phone: c.phone || null,
      tax_identification_number: c.tin || null,
      approvalStatus: 'pending',
      isActive: false,
      subscription_plan: selectedPlan,
      subscription_status: 'trialing',
      feature_access: buildFeatureAccess(selectedPlan),
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      registration_rejection_reason: null
    });

    // Seed chart of accounts for the new company
    try {
      const accounts = Object.entries(CHART_OF_ACCOUNTS).map(([code, account]) => ({
        company: company._id,
        code,
        name: account.name,
        type: account.type,
        subtype: account.subtype,
        normal_balance: account.normalBalance,
        allow_direct_posting: account.allowDirectPosting,
        isActive: true,
        createdBy: null,
      }));
      await ChartOfAccount.insertMany(accounts);
      console.log(`Seeded ${accounts.length} chart of accounts for registered company ${company._id}`);
    } catch (seedError) {
      console.error('Error seeding chart of accounts for registered company:', seedError);
    }

    try {
      // Look up the admin Role document to link it to the user
      const adminRole = await Role.findOne({ name: 'admin', is_system_role: true });

      const user = await User.create({
        name: a.name.trim(),
        email: emailAdmin,
        password: a.password,
        company: company._id,
        role: 'admin',
        roles: adminRole ? [adminRole._id] : [],
        isActive: true
      });
      return { company, user };
    } catch (e) {
      await Company.deleteOne({ _id: company._id });
      if (e.code === 11000) {
        const err = new Error('DUPLICATE_USER_EMAIL_FOR_COMPANY');
        err.code = 'DUPLICATE_USER_EMAIL_FOR_COMPANY';
        throw err;
      }
      throw e;
    }
  }

  static async listCompaniesByApprovalStatus(status) {
    const list = await Company.find({ approvalStatus: status })
      .sort({ createdAt: -1 })
      .lean();
    return list.map(serializeCompany);
  }

  static async getPlatformDashboard() {
    const now = new Date();
    const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [companies, usersByCompany] = await Promise.all([
      Company.find({}).sort({ createdAt: -1 }).lean(),
      User.aggregate([
        { $match: { company: { $ne: null } } },
        { $group: { _id: '$company', users: { $sum: 1 }, activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } } } }
      ])
    ]);

    const userMap = new Map(usersByCompany.map((row) => [String(row._id), row]));
    const normalized = companies.map((company) => {
      const usage = userMap.get(String(company._id)) || { users: 0, activeUsers: 0 };
      return {
        ...serializeCompany(company),
        users: usage.users,
        activeUsers: usage.activeUsers
      };
    });

    const stats = normalized.reduce((acc, company) => {
      acc.total += 1;
      acc[company.approvalStatus] = (acc[company.approvalStatus] || 0) + 1;
      if (company.subscription_status === 'past_due') acc.pastDue += 1;
      if (company.next_billing_date) {
        const billingDate = new Date(company.next_billing_date);
        if (billingDate >= now && billingDate <= soon) acc.upcomingPayments += 1;
      }
      acc.monthlyRecurringRevenue += company.billing_cycle === 'annual'
        ? company.billing_amount / 12
        : company.billing_cycle === 'quarterly'
          ? company.billing_amount / 3
          : company.billing_amount;
      return acc;
    }, {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      pastDue: 0,
      upcomingPayments: 0,
      monthlyRecurringRevenue: 0
    });

    const plansFromDb = await SubscriptionPlanService.getAllPlans(true);
    const planMetaMap = new Map(plansFromDb.map((p) => [p.key, { name: p.name, modules: p.modules || [] }]));

    return {
      stats,
      companies: normalized,
      packageMatrix: Object.entries(PLAN_FEATURES).map(([plan, features]) => ({
        plan,
        name: planMetaMap.get(plan)?.name || plan,
        modules: planMetaMap.get(plan)?.modules || [],
        features
      }))
    };
  }

  static async updatePlatformAccess(companyId, payload, reviewerUserId) {
    const company = await Company.findById(companyId);
    if (!company) throw new Error('COMPANY_NOT_FOUND');

    const plan = payload.subscription_plan || company.subscription_plan || 'trial';
    const hasNextBillingDate = Object.prototype.hasOwnProperty.call(payload, 'next_billing_date');
    const billingAmount = payload.billing_amount === undefined ? company.billing_amount : Number(payload.billing_amount);
    const update = {
      subscription_plan: plan,
      subscription_status: payload.subscription_status || company.subscription_status,
      billing_cycle: payload.billing_cycle || company.billing_cycle,
      billing_amount: Number.isFinite(billingAmount) && billingAmount >= 0 ? billingAmount : company.billing_amount,
      next_billing_date: hasNextBillingDate ? payload.next_billing_date : company.next_billing_date,
      feature_access: buildFeatureAccess(plan, payload.feature_access || company.feature_access || {}),
      platform_notes: payload.platform_notes === undefined ? company.platform_notes : payload.platform_notes
    };

    if (['suspended', 'cancelled'].includes(update.subscription_status)) {
      update.isActive = false;
    } else if (['trialing', 'active'].includes(update.subscription_status) && company.approvalStatus === 'approved') {
      update.isActive = true;
    }

    Object.assign(company, update);
    await company.save();

    await AuditLogService.log({
      companyId: company._id,
      userId: reviewerUserId,
      action: 'company.platform_access_update',
      entityType: 'company',
      entityId: company._id,
      changes: update
    });

    return serializeCompany(company.toObject());
  }

  static async sendPaymentReminder(companyId, payload, reviewerUserId) {
    const company = await Company.findById(companyId);
    if (!company) throw new Error('COMPANY_NOT_FOUND');

    const subject = payload.subject || `Payment reminder for ${company.name}`;
    const message = payload.message || 'Your subscription payment is coming due. Please arrange payment to keep your platform access active.';
    const emailService = require('./emailService');
    const sent = await emailService.sendEmail(
      company.email,
      subject,
      `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:24px;">
        <h2 style="color:#0f172a;">${escapeHtml(subject)}</h2>
        <p>${escapeHtml(message)}</p>
        <p><strong>Company:</strong> ${escapeHtml(company.name)}</p>
        ${company.next_billing_date ? `<p><strong>Next payment:</strong> ${new Date(company.next_billing_date).toLocaleDateString()}</p>` : ''}
      </div>`
    );

    company.last_payment_reminder_at = new Date();
    await company.save();

    await AuditLogService.log({
      companyId: company._id,
      userId: reviewerUserId,
      action: 'company.payment_reminder_sent',
      entityType: 'company',
      entityId: company._id,
      changes: { subject, sent }
    });

    return { sent, company: serializeCompany(company.toObject()) };
  }

  static async broadcastPlatformUpdate(payload, reviewerUserId) {
    const filter = payload.companyIds?.length ? { _id: { $in: payload.companyIds } } : { approvalStatus: 'approved', isActive: true };
    const companies = await Company.find(filter).select('name email last_platform_message_at').lean();
    const recipients = companies.map((company) => company.email).filter(Boolean);
    if (!recipients.length) return { sent: false, recipients: 0, failed: 0 };

    const subject = payload.subject || 'Important platform update';
    const message = payload.message || 'We have an update to share about your StockManager platform.';
    const emailService = require('./emailService');

    const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:24px;">
      <h2 style="color:#0f172a;">${escapeHtml(subject)}</h2>
      <p>${escapeHtml(message)}</p>
    </div>`;

    // Send individually to protect recipient privacy
    let sentCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const company of companies) {
      if (!company.email) continue;
      try {
        await emailService.sendEmail(company.email, subject, html);
        sentCount += 1;
      } catch (err) {
        failedCount += 1;
        errors.push({ company: company.name, email: company.email, error: err.message });
        console.error(`[Broadcast] Failed to send to ${company.email}:`, err.message);
      }
    }

    // Update last_platform_message_at only for successfully notified companies
    const notifiedIds = companies
      .filter((c) => c.email && !errors.some((e) => e.email === c.email))
      .map((c) => c._id);
    if (notifiedIds.length) {
      await Company.updateMany({ _id: { $in: notifiedIds } }, { $set: { last_platform_message_at: new Date() } });
    }

    await AuditLogService.log({
      companyId: null,
      userId: reviewerUserId,
      action: 'company.platform_broadcast_sent',
      entityType: 'company',
      entityId: 'broadcast',
      changes: { subject, message, recipients: recipients.length, sent: sentCount, failed: failedCount }
    });

    return { sent: sentCount, failed: failedCount, recipients: recipients.length };
  }

  static async approveCompanyById(companyId, reviewerUserId) {
    const company = await Company.findById(companyId);
    if (!company) throw new Error('COMPANY_NOT_FOUND');
    if (company.approvalStatus !== 'pending') {
      throw new Error('COMPANY_NOT_PENDING');
    }
    company.approvalStatus = 'approved';
    company.isActive = true;
    company.registration_rejection_reason = null;
    company.feature_access = buildFeatureAccess(company.subscription_plan || 'trial');
    await company.save();

    await AuditLogService.log({
      companyId: company._id,
      userId: reviewerUserId,
      action: 'company.registration_approved',
      entityType: 'company',
      entityId: company._id,
      changes: { approvalStatus: 'approved', feature_access: company.feature_access }
    });

    // Send approval email
    try {
      const config = require('../src/config/environment').getConfig();
      console.log('[CompanyApproval] Checking config:', { emailNotif: config.features?.emailNotifications, gmailUser: !!config.email?.gmailUser });
      if (config.features?.emailNotifications && config.email?.gmailUser) {
        const emailService = require('./emailService');
        const adminUser = await User.findOne({ company: companyId, role: 'admin' });
        console.log('[CompanyApproval] Sending to:', company.email, 'Admin:', adminUser?.name);
        await emailService.sendApprovalEmail(
          company.email,
          company.name,
          adminUser?.name || 'Administrator'
        );
        console.log('[CompanyApproval] Approval email sent to:', company.email);
      } else {
        console.log('[CompanyApproval] Email NOT sent - config check failed');
      }
    } catch (emailErr) {
      console.error('[CompanyApproval] Failed to send approval email:', emailErr.message);
    }

    return company;
  }

  static async rejectCompanyById(companyId, reason, reviewerUserId) {
    const company = await Company.findById(companyId);
    if (!company) throw new Error('COMPANY_NOT_FOUND');
    if (company.approvalStatus !== 'pending') {
      throw new Error('COMPANY_NOT_PENDING');
    }
    company.approvalStatus = 'rejected';
    company.isActive = false;
    company.registration_rejection_reason = (reason || 'No reason provided').trim();
    await company.save();

    await AuditLogService.log({
      companyId: company._id,
      userId: reviewerUserId,
      action: 'company.registration_rejected',
      entityType: 'company',
      entityId: company._id,
      changes: { approvalStatus: 'rejected', reason: company.registration_rejection_reason }
    });

    // Send rejection email
    try {
      const config = require('../src/config/environment').getConfig();
      if (config.features?.emailNotifications && config.email?.gmailUser) {
        const emailService = require('./emailService');
        const adminUser = await User.findOne({ company: companyId, role: 'admin' });
        await emailService.sendRejectionEmail(
          company.email,
          company.name,
          adminUser?.name || 'Administrator',
          reason
        );
        console.log('[CompanyRejection] Rejection email sent to:', company.email);
      }
    } catch (emailErr) {
      console.error('[CompanyRejection] Failed to send rejection email:', emailErr.message);
    }

    return company;
  }

  /**
   * Get company by ID
   */
  static async getById(companyId) {
    const company = await Company.findById(companyId);
    if (!company) throw new Error('COMPANY_NOT_FOUND');
    return company;
  }

  static async getProfileById(companyId) {
    const company = await Company.findById(companyId).lean();
    if (!company) throw new Error('COMPANY_NOT_FOUND');
    return serializeCompany(company);
  }

  /**
   * Get all companies (for platform admin)
   */
  static async getAll(options = {}) {
    const { page = 1, limit = 20, isActive } = options;
    const query = {};
    
    if (isActive !== undefined) {
      query.is_active = isActive;
    }

    const skip = (page - 1) * limit;
    
    const [companies, total] = await Promise.all([
      Company.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Company.countDocuments(query)
    ]);

    return {
      companies,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Update company
   */
  static async update(companyId, data, userId) {
    // base_currency cannot be changed once any transaction exists
    if (data.base_currency) {
      const hasTransactions = await CompanyService._hasAnyTransactions(companyId);
      if (hasTransactions) {
        throw new Error('BASE_CURRENCY_LOCKED: cannot change currency after transactions exist');
      }
    }

    // fiscal_year_start_month cannot be changed once any period exists
    if (data.fiscal_year_start_month) {
      try {
        const AccountingPeriod = require('../models/AccountingPeriod');
        if (AccountingPeriod && AccountingPeriod.countDocuments) {
          const periodCount = await AccountingPeriod.countDocuments({ company: companyId });
          if (periodCount > 0) {
            throw new Error('FISCAL_YEAR_LOCKED: cannot change fiscal year after periods exist');
          }
        }
      } catch (e) {
        // AccountingPeriod may not exist yet, continue
      }
    }

    // Get old data for audit
    const oldCompany = await Company.findById(companyId);
    if (!oldCompany) throw new Error('COMPANY_NOT_FOUND');

    const company = await Company.findByIdAndUpdate(
      companyId,
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!company) throw new Error('COMPANY_NOT_FOUND');

    // Log the update
    await AuditLogService.log({
      companyId,
      userId,
      action: 'company.update',
      entityType: 'company',
      entityId: companyId,
      changes: data
    });

    return company;
  }

  /**
   * Upload/update company logo
   */
  static async uploadLogo(companyId, logoUrl, userId) {
    const company = await Company.findByIdAndUpdate(
      companyId,
      { $set: { logo_url: logoUrl } },
      { new: true }
    ).lean();

    if (!company) throw new Error('COMPANY_NOT_FOUND');

    await AuditLogService.log({
      companyId,
      userId,
      action: 'company.logo_upload',
      entityType: 'company',
      entityId: companyId,
      changes: { logo_url: logoUrl }
    });

    return company;
  }

  /**
   * Get setup status
   */
  static async getSetupStatus(companyId) {
    const company = await Company.findById(companyId);
    if (!company) throw new Error('COMPANY_NOT_FOUND');

    return {
      setup_completed: company.setup_completed,
      setup_steps_completed: company.setup_steps_completed,
      subscription_plan: company.subscription_plan,
      trial_ends_at: company.trial_ends_at
    };
  }

  /**
   * Mark a setup step as complete
   */
  static async markSetupStepComplete(companyId, step) {
    const validSteps = [
      'company_profile',
      'chart_of_accounts',
      'opening_balances',
      'first_user',
      'first_period'
    ];

    if (!validSteps.includes(step)) {
      throw new Error('INVALID_SETUP_STEP');
    }

    const update = { [`setup_steps_completed.${step}`]: true };
    const company = await Company.findByIdAndUpdate(
      companyId,
      { $set: update },
      { new: true }
    );

    if (!company) throw new Error('COMPANY_NOT_FOUND');

    // Check if all steps done
    const allDone = Object.values(company.setup_steps_completed).every(v => v === true);
    if (allDone) {
      await Company.findByIdAndUpdate(companyId, { $set: { setup_completed: true } });
      company.setup_completed = true;
    }

    return company;
  }

  /**
   * Platform-wide analytics: MRR, growth, churn, and tenant trends
   */
  static async getPlatformAnalytics() {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    // Aggregate companies
    const companies = await Company.find({ approvalStatus: 'approved' }).lean();

    // MRR calculation — normalize to monthly
    const monthlyAmount = (amount, cycle) => {
      if (!amount || amount < 0) return 0;
      if (cycle === 'annual') return amount / 12;
      if (cycle === 'quarterly') return amount / 3;
      return amount;
    };

    const mrr = companies
      .filter((c) => c.subscription_status === 'active' || c.subscription_status === 'trialing')
      .reduce((sum, c) => sum + monthlyAmount(c.billing_amount, c.billing_cycle), 0);

    const mrrByPlan = {};
    companies.forEach((c) => {
      const plan = c.subscription_plan || 'trial';
      if (!mrrByPlan[plan]) mrrByPlan[plan] = 0;
      if (c.subscription_status === 'active' || c.subscription_status === 'trialing') {
        mrrByPlan[plan] += monthlyAmount(c.billing_amount, c.billing_cycle);
      }
    });

    // Plan distribution
    const planDistribution = {};
    companies.forEach((c) => {
      const plan = c.subscription_plan || 'trial';
      planDistribution[plan] = (planDistribution[plan] || 0) + 1;
    });

    // Status distribution
    const statusDistribution = {};
    companies.forEach((c) => {
      const status = c.subscription_status || 'trialing';
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;
    });

    // Growth trend: new companies per month (last 6 months)
    const allCompanies = await Company.find({ createdAt: { $gte: sixMonthsAgo } }).sort({ createdAt: 1 }).lean();
    const growthTrend = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      growthTrend[key] = 0;
    }
    allCompanies.forEach((c) => {
      const d = new Date(c.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (growthTrend.hasOwnProperty(key)) {
        growthTrend[key] = (growthTrend[key] || 0) + 1;
      }
    });

    // Churn trend: companies that moved to suspended/cancelled in last 6 months (from audit logs)
    const churnLogs = await mongoose.model('AuditLog').find({
      action: { $in: ['company.update', 'company.platform_access_updated'] },
      createdAt: { $gte: sixMonthsAgo },
      'changes.subscription_status': { $in: ['suspended', 'cancelled'] }
    }).sort({ createdAt: 1 }).lean();

    const churnTrend = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      churnTrend[key] = 0;
    }
    churnLogs.forEach((log) => {
      const d = new Date(log.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (churnTrend.hasOwnProperty(key)) {
        churnTrend[key] = (churnTrend[key] || 0) + 1;
      }
    });

    // Active tenant count over time (cumulative approved up to each month)
    const activeTenantTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const count = await Company.countDocuments({
        approvalStatus: 'approved',
        createdAt: { $lt: d }
      });
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      activeTenantTrend.push({ month: key, count });
    }

    return {
      mrr: Math.round(mrr * 100) / 100,
      mrrByPlan,
      totalTenants: companies.length,
      activeTenants: companies.filter((c) => c.isActive && c.subscription_status !== 'cancelled').length,
      planDistribution,
      statusDistribution,
      growthTrend: Object.entries(growthTrend).sort().map(([month, count]) => ({ month, count })),
      churnTrend: Object.entries(churnTrend).sort().map(([month, count]) => ({ month, count })),
      activeTenantTrend
    };
  }

  /**
   * Check if company has any transactions
   * @private
   */
  static async _hasAnyTransactions(companyId) {
    const JournalEntry = require('../models/JournalEntry');
    const count = await JournalEntry.countDocuments({ company: companyId });
    return count > 0;
  }

  /**
   * Delete company (soft delete)
   */
  static async delete(companyId, userId) {
    const company = await Company.findByIdAndUpdate(
      companyId,
      { $set: { is_active: false } },
      { new: true }
    ).lean();

    if (!company) throw new Error('COMPANY_NOT_FOUND');

    await AuditLogService.log({
      companyId,
      userId,
      action: 'company.delete',
      entityType: 'company',
      entityId: companyId
    });

    return company;
  }
}

// Load plans from database on startup
(async () => {
  await loadPlanFeatures();
})();

CompanyService.loadPlanFeatures = loadPlanFeatures;
module.exports = CompanyService;
