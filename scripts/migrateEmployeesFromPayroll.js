#!/usr/bin/env node
/**
 * Migration: Extract distinct employees from historical Payroll records
 * and create Employee master + SalaryHistory rows.
 *
 * Usage:
 *   node scripts/migrateEmployeesFromPayroll.js --dry-run
 *   node scripts/migrateEmployeesFromPayroll.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../config/database');

async function runMigration(dryRun = false) {
  console.log(`[MigrateEmployees] Starting migration (dryRun=${dryRun})...`);

  await connectDB();

  const Payroll = require('../models/Payroll');
  const Employee = require('../models/Employee');
  const SalaryHistory = require('../models/SalaryHistory');

  // Aggregate distinct employees per company from payroll history
  const pipeline = [
    {
      $group: {
        _id: {
          company: '$company',
          employeeId: '$employee.employeeId',
        },
        // Take the latest payroll record as source of truth
        latestRecord: { $last: '$$ROOT' },
        // Collect all unique salary snapshots to deduce history
        salarySnapshots: {
          $addToSet: {
            basicSalary: '$salary.basicSalary',
            transportAllowance: '$salary.transportAllowance',
            housingAllowance: '$salary.housingAllowance',
            otherAllowances: '$salary.otherAllowances',
            periodMonth: '$period.month',
            periodYear: '$period.year',
          },
        },
      },
    },
  ];

  const distinctEmployees = await Payroll.aggregate(pipeline);
  console.log(`[MigrateEmployees] Found ${distinctEmployees.length} distinct employees across all companies`);

  let createdEmployees = 0;
  let updatedPayrolls = 0;
  let skippedDuplicates = 0;
  let errors = 0;

  for (const group of distinctEmployees) {
    const companyId = group._id.company;
    const employeeId = (group._id.employeeId || '').trim().toUpperCase();
    const record = group.latestRecord;

    if (!employeeId) {
      console.warn(`[MigrateEmployees] Skipping record with empty employeeId (company=${companyId})`);
      continue;
    }

    try {
      // Check if Employee master already exists
      const existing = await Employee.findOne({
        company: companyId,
        employeeId,
      }).lean();

      if (existing) {
        console.log(`[MigrateEmployees] Employee ${employeeId} already exists in company ${companyId}. Linking payrolls...`);
        // Just update payroll records to point to existing employee
        if (!dryRun) {
          const payrollUpdate = await Payroll.updateMany(
            {
              company: companyId,
              'employee.employeeId': { $regex: new RegExp(`^${employeeId}$`, 'i') },
              $or: [{ employee_id: null }, { employee_id: { $exists: false } }],
            },
            { $set: { employee_id: existing._id } }
          );
          updatedPayrolls += payrollUpdate.modifiedCount || 0;
        }
        skippedDuplicates++;
        continue;
      }

      // Extract details from the latest payroll record
      const empData = record.employee || {};
      const salData = record.salary || {};

      // Create Employee master
      const employeeDoc = {
        company: companyId,
        employeeId,
        status: 'active',
        firstName: empData.firstName || 'Unknown',
        lastName: empData.lastName || 'Employee',
        email: empData.email || null,
        phone: empData.phone || null,
        nationalId: empData.nationalId || null,
        hireDate: empData.startDate || null,
        employmentType: empData.employmentType || 'full-time',
        department: empData.department || null,
        position: empData.position || null,
        bankName: empData.bankName || null,
        bankAccount: empData.bankAccount || null,
        taxStatus: 'resident',
        currentSalary: {
          basicSalary: salData.basicSalary || 0,
          transportAllowance: salData.transportAllowance || 0,
          housingAllowance: salData.housingAllowance || 0,
          otherAllowances: salData.otherAllowances || 0,
          effectiveDate: new Date('2024-01-01'),
          currency: 'RWF',
        },
        createdBy: record.createdBy || null,
      };

      let newEmployee;
      if (!dryRun) {
        newEmployee = await Employee.create(employeeDoc);

        // Create initial SalaryHistory row
        await SalaryHistory.create({
          company: companyId,
          employee: newEmployee._id,
          basicSalary: salData.basicSalary || 0,
          transportAllowance: salData.transportAllowance || 0,
          housingAllowance: salData.housingAllowance || 0,
          otherAllowances: salData.otherAllowances || 0,
          currency: 'RWF',
          effectiveDate: new Date('2024-01-01'),
          endDate: null,
          reason: 'Migrated from payroll history',
          changedBy: record.createdBy || null,
        });

        // Update all payroll records for this employee to link to the new master
        const payrollUpdate = await Payroll.updateMany(
          {
            company: companyId,
            'employee.employeeId': { $regex: new RegExp(`^${employeeId}$`, 'i') },
            $or: [{ employee_id: null }, { employee_id: { $exists: false } }],
          },
          { $set: { employee_id: newEmployee._id } }
        );
        updatedPayrolls += payrollUpdate.modifiedCount || 0;
      }

      createdEmployees++;
      console.log(`[MigrateEmployees] ${dryRun ? '[DRY-RUN] Would create' : 'Created'} Employee ${employeeId} (${empData.firstName} ${empData.lastName})`);
    } catch (err) {
      errors++;
      console.error(`[MigrateEmployees] Error processing employee ${employeeId} in company ${companyId}:`, err.message);
    }
  }

  console.log('\n[MigrateEmployees] Summary:');
  console.log(`  Distinct employees found: ${distinctEmployees.length}`);
  console.log(`  Employees ${dryRun ? 'would be' : ''} created: ${createdEmployees}`);
  console.log(`  Skipped (already exist): ${skippedDuplicates}`);
  console.log(`  Payroll records ${dryRun ? 'would be' : ''} linked: ${updatedPayrolls}`);
  console.log(`  Errors: ${errors}`);

  await mongoose.connection.close();
  process.exit(0);
}

// Parse CLI args
const dryRun = process.argv.includes('--dry-run');
runMigration(dryRun).catch((err) => {
  console.error('[MigrateEmployees] Fatal error:', err);
  process.exit(1);
});
