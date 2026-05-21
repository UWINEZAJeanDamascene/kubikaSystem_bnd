const EBMDeviceService = require('../services/ebmDeviceService');
const EBMCodeSyncService = require('../services/ebmCodeSyncService');
const EBMCode = require('../models/EBMCode');
const EBMItemClass = require('../models/EBMItemClass');
const EBMTIN = require('../models/EBMTIN');
const EBMNotice = require('../models/EBMNotice');
const EBMBranchService = require('../services/ebmBranchService');
const EBMImportedItemService = require('../services/ebmImportedItemService');

function getCompanyId(req) {
  return req.companyId || req.company?._id || req.user?.company?._id || req.user?.company;
}

exports.getDeviceStatus = async (req, res, next) => {
  try {
    const companyId = getCompanyId(req);
    const status = await EBMDeviceService.getInitializationStatus(companyId);
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

exports.initializeDevice = async (req, res, next) => {
  try {
    const companyId = getCompanyId(req);
    const result = await EBMDeviceService.initializeDevice(
      companyId,
      {
        branchId: req.body.branchId,
        bhfId: req.body.bhfId,
        deviceSerialNo: req.body.deviceSerialNo,
        dvcSrlNo: req.body.dvcSrlNo,
        tin: req.body.tin,
      },
      req.user?._id || req.user?.id || null,
    );

    res.json({
      success: true,
      data: result.device,
      vsdc: {
        resultCd: result.response.resultCd,
        resultMsg: result.response.resultMsg,
        resultDt: result.response.resultDt,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.syncCodes = async (req, res, next) => {
  try {
    const companyId = getCompanyId(req);
    const result = await EBMCodeSyncService.syncAll(companyId, {
      branchId: req.body.branchId || req.body.bhfId || '00',
      full: req.body.full === true,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.getCodeSyncStatus = async (req, res, next) => {
  try {
    const companyId = getCompanyId(req);
    const states = await EBMCodeSyncService.getSyncStates(companyId);
    res.json({ success: true, data: states });
  } catch (error) {
    next(error);
  }
};

exports.getCodes = async (req, res, next) => {
  try {
    const companyId = getCompanyId(req);
    const query = { company: companyId, active: { $ne: false } };
    if (req.query.codeClass) query.codeClass = String(req.query.codeClass);

    const codes = await EBMCode.find(query).sort({ codeClass: 1, sortOrder: 1, code: 1 }).lean();
    const grouped = codes.reduce((acc, code) => {
      if (!acc[code.codeClass]) {
        acc[code.codeClass] = {
          codeClass: code.codeClass,
          codeClassName: code.codeClassName,
          codes: [],
        };
      }
      acc[code.codeClass].codes.push({
        code: code.code,
        name: code.name,
        description: code.description,
        active: code.active,
        source: code.source,
      });
      return acc;
    }, {});

    res.json({ success: true, data: grouped });
  } catch (error) {
    next(error);
  }
};

exports.getItemClasses = async (req, res, next) => {
  try {
    const companyId = getCompanyId(req);
    const search = String(req.query.search || '').trim();
    const query = { company: companyId, active: { $ne: false } };
    if (search) {
      query.$or = [
        { itemClassCode: { $regex: search, $options: 'i' } },
        { itemClassName: { $regex: search, $options: 'i' } },
      ];
    }

    const itemClasses = await EBMItemClass.find(query)
      .sort({ itemClassCode: 1 })
      .limit(Math.min(Number(req.query.limit || 1000), 5000))
      .lean();

    res.json({ success: true, data: itemClasses });
  } catch (error) {
    next(error);
  }
};

exports.searchTINs = async (req, res, next) => {
  try {
    const search = String(req.query.search || req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const query = { active: { $ne: false } };
    if (search) {
      query.$or = [
        { tin: { $regex: `^${search}`, $options: 'i' } },
        { taxpayerName: { $regex: search, $options: 'i' } },
      ];
    }
    const tins = await EBMTIN.find(query)
      .sort({ tin: 1 })
      .limit(limit)
      .lean();
    res.json({ success: true, data: tins });
  } catch (error) {
    next(error);
  }
};

exports.getNotices = async (req, res, next) => {
  try {
    const companyId = getCompanyId(req);
    const notices = await EBMNotice.find({ company: companyId, active: { $ne: false } })
      .sort({ noticeDate: -1, createdAt: -1 })
      .limit(Math.min(Number(req.query.limit || 50), 200))
      .lean();
    res.json({ success: true, data: notices });
  } catch (error) {
    next(error);
  }
};

exports.registerBranch = async (req, res, next) => {
  try {
    const companyId = getCompanyId(req);
    const branchId = String(req.body.branchId || req.body.bhfId || '').padStart(2, '0').slice(-2);
    const branch = await EBMBranchService.registerBranchById(companyId, branchId, req.user?._id || req.user?.id || null);
    res.json({ success: true, data: branch });
  } catch (error) {
    next(error);
  }
};

exports.syncImportedItems = async (req, res, next) => {
  try {
    const companyId = getCompanyId(req);
    const result = await EBMImportedItemService.syncImports(companyId, {
      branchId: req.body.branchId || req.body.bhfId || '00',
      full: req.body.full === true,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.listImportedItems = async (req, res, next) => {
  try {
    const companyId = getCompanyId(req);
    const imports = await EBMImportedItemService.listImports(companyId, req.query);
    res.json({ success: true, data: imports });
  } catch (error) {
    next(error);
  }
};

exports.confirmImportedItem = async (req, res, next) => {
  try {
    const companyId = getCompanyId(req);
    const imported = await EBMImportedItemService.confirmImport(
      companyId,
      req.params.id,
      req.body,
      req.user,
    );
    res.json({ success: true, data: imported });
  } catch (error) {
    next(error);
  }
};

exports.rejectImportedItem = async (req, res, next) => {
  try {
    const companyId = getCompanyId(req);
    const imported = await EBMImportedItemService.rejectImport(
      companyId,
      req.params.id,
      req.body.reason,
      req.user,
    );
    res.json({ success: true, data: imported });
  } catch (error) {
    next(error);
  }
};

exports.retryImportedItemStock = async (req, res, next) => {
  try {
    const companyId = getCompanyId(req);
    const imported = await EBMImportedItemService.retryStockUpdate(
      companyId,
      req.params.id,
      req.body,
      req.user,
    );
    res.json({ success: true, data: imported });
  } catch (error) {
    next(error);
  }
};
