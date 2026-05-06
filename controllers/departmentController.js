const Department = require('../models/Department');
const User = require('../models/User');

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private
exports.getDepartments = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { search, isActive } = req.query;
    const query = { company: companyId };

    // Filter by active status - include docs without isActive field (treat as active by default)
    const conditions = [];

    if (isActive !== undefined) {
      const isActiveBool = isActive === 'true';
      if (isActiveBool) {
        // For active=true, include both explicitly true AND missing isActive (default to true)
        conditions.push({
          $or: [
            { isActive: true },
            { isActive: { $exists: false } }
          ]
        });
      } else {
        // For active=false, only get explicitly false
        conditions.push({ isActive: false });
      }
    }

    if (search) {
      conditions.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      });
    }

    // Combine all conditions with $and if there are multiple
    if (conditions.length > 0) {
      query.$and = conditions;
    }

    const departments = await Department.find(query)
      .populate('manager', 'name email')
      .sort({ code: 1 });

    // Get user counts per department
    const userCounts = await User.aggregate([
      { $match: { company: companyId, department: { $ne: null } } },
      { $group: { _id: '$department', count: { $sum: 1 } } }
    ]);

    const countMap = {};
    userCounts.forEach(uc => { countMap[uc._id.toString()] = uc.count; });

    const data = departments.map(d => ({
      ...d.toObject(),
      userCount: countMap[d._id.toString()] || 0
    }));

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single department
// @route   GET /api/departments/:id
// @access  Private
exports.getDepartment = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const department = await Department.findOne({ _id: req.params.id, company: companyId });

    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    // Get users in this department
    const users = await User.find({ company: companyId, department: department._id })
      .select('name email role isActive')
      .sort({ name: 1 });

    res.json({ success: true, data: { ...department.toObject(), users } });
  } catch (error) {
    next(error);
  }
};

// @desc    Create department
// @route   POST /api/departments
// @access  Private (admin)
exports.createDepartment = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { code, name, description, manager, budgetLimit } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Department code is required' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Department name is required' });
    }

    // Check for duplicate code
    const existingCode = await Department.findOne({ company: companyId, code: code.trim().toUpperCase() });
    if (existingCode) {
      return res.status(400).json({ success: false, message: 'A department with this code already exists' });
    }

    const department = await Department.create({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description?.trim() || '',
      manager: manager || null,
      budgetLimit: budgetLimit || 0,
      company: companyId
    });

    const populatedDept = await Department.findById(department._id).populate('manager', 'name email');

    res.status(201).json({ success: true, data: { ...populatedDept.toObject(), userCount: 0 } });
  } catch (error) {
    next(error);
  }
};

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Private (admin)
exports.updateDepartment = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { code, name, description, manager, budgetLimit, isActive } = req.body;

    const department = await Department.findOne({ _id: req.params.id, company: companyId });
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    // Update code
    if (code && code.trim()) {
      // Check for duplicate code (excluding current)
      const existingCode = await Department.findOne({
        company: companyId,
        code: code.trim().toUpperCase(),
        _id: { $ne: department._id }
      });
      if (existingCode) {
        return res.status(400).json({ success: false, message: 'A department with this code already exists' });
      }
      department.code = code.trim().toUpperCase();
    }

    // Update name
    if (name && name.trim()) {
      department.name = name.trim();
    }

    // Update description
    if (description !== undefined) {
      department.description = description?.trim() || '';
    }

    // Update manager
    if (manager !== undefined) {
      department.manager = manager || null;
    }

    // Update budget limit
    if (budgetLimit !== undefined) {
      department.budgetLimit = budgetLimit || 0;
    }

    // Update active status
    if (isActive !== undefined) {
      department.isActive = isActive;
    }

    await department.save();

    const populatedDept = await Department.findById(department._id).populate('manager', 'name email');
    const userCount = await User.countDocuments({ company: companyId, department: department._id });

    res.json({ success: true, data: { ...populatedDept.toObject(), userCount } });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private (admin)
exports.deleteDepartment = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const department = await Department.findOne({ _id: req.params.id, company: companyId });

    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    // Remove department reference from all users in this department
    await User.updateMany(
      { company: companyId, department: department._id },
      { $unset: { department: '' } }
    );

    await department.deleteOne();

    res.json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Assign users to department
// @route   PUT /api/departments/:id/assign-users
// @access  Private (admin)
exports.assignUsers = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { userIds } = req.body;

    const department = await Department.findOne({ _id: req.params.id, company: companyId });
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide user IDs' });
    }

    await User.updateMany(
      { _id: { $in: userIds }, company: companyId },
      { department: department._id }
    );

    const userCount = await User.countDocuments({ company: companyId, department: department._id });

    res.json({ success: true, message: `${userIds.length} user(s) assigned to ${department.name}`, data: { ...department.toObject(), userCount } });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove user from department
// @route   PUT /api/departments/:id/remove-user/:userId
// @access  Private (admin)
exports.removeUser = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const department = await Department.findOne({ _id: req.params.id, company: companyId });

    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    await User.updateOne(
      { _id: req.params.userId, company: companyId, department: department._id },
      { $unset: { department: '' } }
    );

    res.json({ success: true, message: 'User removed from department' });
  } catch (error) {
    next(error);
  }
};
