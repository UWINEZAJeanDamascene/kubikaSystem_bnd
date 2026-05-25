const EBMPurchaseService = require('./ebmPurchaseService');

let intervalHandle = null;
let running = false;

async function runPurchaseSync(reason = 'scheduled') {
  if (running) return;
  running = true;
  try {
    console.log(`[EBMPurchaseSync] Starting ${reason} purchase sync`);
    const summary = await EBMPurchaseService.syncDueCompanies();
    console.log(`[EBMPurchaseSync] Completed ${reason} purchase sync`, summary);
  } catch (error) {
    console.error('[EBMPurchaseSync] Scheduled sync failed:', error);
  } finally {
    running = false;
  }
}

function startPurchaseSyncScheduler() {
  if (intervalHandle) return intervalHandle;

  const intervalHours = Math.max(1, Number(process.env.EBM_PURCHASE_SYNC_INTERVAL_HOURS || 6));
  const intervalMs = intervalHours * 60 * 60 * 1000;

  setTimeout(() => runPurchaseSync('startup'), 0);
  intervalHandle = setInterval(() => runPurchaseSync('scheduled'), intervalMs);
  if (typeof intervalHandle.unref === 'function') intervalHandle.unref();

  console.log(`[EBMPurchaseSync] Scheduler started. Interval: ${intervalHours} hour(s)`);
  return intervalHandle;
}

function stopPurchaseSyncScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  startPurchaseSyncScheduler,
  stopPurchaseSyncScheduler,
  runPurchaseSync,
};
