const EBMImportedItemService = require('./ebmImportedItemService');

let intervalHandle = null;
let running = false;

async function runImportSync(reason = 'scheduled') {
  if (running) return;
  running = true;
  try {
    console.log(`[EBMImportSync] Starting ${reason} imported item sync`);
    const summary = await EBMImportedItemService.syncDueCompanies();
    console.log(`[EBMImportSync] Completed ${reason} imported item sync`, summary);
  } catch (error) {
    console.error('[EBMImportSync] Scheduled sync failed:', error);
  } finally {
    running = false;
  }
}

function startImportSyncScheduler() {
  if (intervalHandle) return intervalHandle;

  const intervalHours = Math.max(1, Number(process.env.EBM_IMPORT_SYNC_INTERVAL_HOURS || 24));
  const intervalMs = intervalHours * 60 * 60 * 1000;

  setTimeout(() => runImportSync('startup'), 0);
  intervalHandle = setInterval(() => runImportSync('scheduled'), intervalMs);
  if (typeof intervalHandle.unref === 'function') intervalHandle.unref();

  console.log(`[EBMImportSync] Scheduler started. Interval: ${intervalHours} hour(s)`);
  return intervalHandle;
}

function stopImportSyncScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  startImportSyncScheduler,
  stopImportSyncScheduler,
  runImportSync,
};
