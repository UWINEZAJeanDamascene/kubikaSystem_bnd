const EBMCodeSyncService = require('./ebmCodeSyncService');

let intervalHandle = null;
let running = false;

async function runCodeSync(reason = 'scheduled') {
  if (running) return;
  running = true;
  try {
    console.log(`[EBMCodeSync] Starting ${reason} code sync`);
    const summary = await EBMCodeSyncService.syncDueCompanies();
    console.log(`[EBMCodeSync] Completed ${reason} code sync`, summary);
  } catch (error) {
    console.error('[EBMCodeSync] Scheduled sync failed:', error);
  } finally {
    running = false;
  }
}

function startCodeSyncScheduler() {
  if (intervalHandle) return intervalHandle;

  const intervalHours = Math.max(1, Number(process.env.EBM_CODE_SYNC_INTERVAL_HOURS || 24));
  const intervalMs = intervalHours * 60 * 60 * 1000;

  setTimeout(() => runCodeSync('startup'), 0);
  intervalHandle = setInterval(() => runCodeSync('scheduled'), intervalMs);
  if (typeof intervalHandle.unref === 'function') intervalHandle.unref();

  console.log(`[EBMCodeSync] Scheduler started. Interval: ${intervalHours} hour(s)`);
  return intervalHandle;
}

function stopCodeSyncScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  startCodeSyncScheduler,
  stopCodeSyncScheduler,
  runCodeSync,
};
