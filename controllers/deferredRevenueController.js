const DeferredRevenueService = require('../services/deferredRevenueService');

exports.getAll = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { status, search } = req.query;
    const data = await DeferredRevenueService.getAll(companyId, { status, search });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const item = await DeferredRevenueService.getById(companyId, req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Deferred revenue item not found' });
    }
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const userId = req.user._id;
    const item = await DeferredRevenueService.create(companyId, userId, req.body);
    res.status(201).json({
      success: true,
      data: item,
      message: 'Deferred revenue recorded successfully'
    });
  } catch (error) {
    next(error);
  }
};

exports.postRecognition = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const userId = req.user._id;
    const item = await DeferredRevenueService.postRecognition(
      companyId,
      userId,
      req.params.id,
      req.params.recognitionId
    );
    res.status(200).json({
      success: true,
      data: item,
      message: 'Revenue recognition posted successfully'
    });
  } catch (error) {
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Deferred revenue item not found' });
    }
    if (error.message === 'RECOGNITION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Recognition entry not found' });
    }
    if (error.message === 'ALREADY_POSTED') {
      return res.status(400).json({ success: false, message: 'Recognition already posted' });
    }
    next(error);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const result = await DeferredRevenueService.delete(companyId, req.params.id);
    res.status(200).json({ success: true, message: 'Deferred revenue item deleted', data: result });
  } catch (error) {
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Deferred revenue item not found' });
    }
    if (error.message === 'CANNOT_DELETE_RECOGNIZED') {
      return res.status(400).json({ success: false, message: 'Cannot delete — revenue has already been recognized' });
    }
    next(error);
  }
};
