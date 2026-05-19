/**
 * System Metrics Service
 * Collects advanced operational metrics: DB stats, request timing,
 * company dataset sizes, capacity estimates, and event loop health.
 */

const mongoose = require('mongoose');
const os = require('os');

// ── Request Timing Tracker ──────────────────────────────────────────────
const requestStats = {
  count: 0,
  errors: 0,
  totalMs: 0,
  slowCount: 0, // >500ms
  samples: [],
};
const MAX_SAMPLES = 200;

function recordRequest(durationMs, statusCode) {
  requestStats.count++;
  requestStats.totalMs += durationMs;
  if (durationMs > 500) requestStats.slowCount++;
  if (statusCode >= 400) requestStats.errors++;

  requestStats.samples.push({
    timestamp: Date.now(),
    durationMs: Math.round(durationMs),
    statusCode,
  });
  if (requestStats.samples.length > MAX_SAMPLES) {
    requestStats.samples.shift();
  }
}

function getRequestMetrics() {
  if (requestStats.count === 0) {
    return {
      total_requests: 0,
      avg_response_ms: 0,
      error_rate: 0,
      slow_rate: 0,
      requests_per_min: 0,
    };
  }
  const recent = requestStats.samples.filter(
    (s) => Date.now() - s.timestamp < 60 * 1000
  );
  const recentMs = recent.reduce((s, r) => s + r.durationMs, 0);
  return {
    total_requests: requestStats.count,
    avg_response_ms: Math.round((requestStats.totalMs / requestStats.count) * 100) / 100,
    error_rate: Math.round((requestStats.errors / requestStats.count) * 10000) / 100,
    slow_rate: Math.round((requestStats.slowCount / requestStats.count) * 10000) / 100,
    requests_per_min: recent.length,
    recent_avg_ms: recent.length > 0 ? Math.round((recentMs / recent.length) * 100) / 100 : 0,
  };
}

// ── Event Loop Lag Monitor ──────────────────────────────────────────────
let lastEventLoopLag = 0;

function measureEventLoopLag() {
  const start = process.hrtime.bigint();
  setImmediate(() => {
    const end = process.hrtime.bigint();
    lastEventLoopLag = Number(end - start) / 1_000_000; // ns -> ms
  });
}

// Sample every 5 seconds
const eventLoopTimer = setInterval(measureEventLoopLag, 5000);
if (eventLoopTimer.unref) eventLoopTimer.unref();

// ── Database Stats ──────────────────────────────────────────────────────
async function getDatabaseStats() {
  try {
    if (mongoose.connection.readyState !== 1) return null;
    const db = mongoose.connection.db;
    if (!db) return null;

    const stats = await db.admin().command({ listDatabases: 1 });
    const ourDbName = db.databaseName;
    const ourDb = stats.databases.find((d) => d.name === ourDbName);
    const dbSizeOnDisk = ourDb ? ourDb.sizeOnDisk : 0;

    // Collection stats for top collections
    const collections = await db.listCollections().toArray();
    const collectionStats = [];
    for (const col of collections.slice(0, 30)) {
      // Skip system collections and views
      if (col.name.startsWith('system.') || col.type === 'view') continue;
      try {
        const colStats = await db.command({ collStats: col.name });
        collectionStats.push({
          name: col.name,
          documents: colStats.count || 0,
          size_mb: Math.round((colStats.size || 0) / 1024 / 1024 * 100) / 100,
          avg_obj_size: colStats.avgObjSize || 0,
          indexes: colStats.nindexes || 0,
        });
      } catch (e) {
        // Some collections may not support stats
      }
    }
    collectionStats.sort((a, b) => b.documents - a.documents);

    return {
      name: ourDbName,
      total_size_mb: Math.round(dbSizeOnDisk / 1024 / 1024 * 100) / 100,
      collections_count: collections.length,
      top_collections: collectionStats.slice(0, 8),
    };
  } catch (e) {
    return null;
  }
}

// ── Company Dataset Stats ───────────────────────────────────────────────
async function getCompanyDatasetStats() {
  try {
    if (mongoose.connection.readyState !== 1) return null;
    const db = mongoose.connection.db;
    if (!db) return null;

    // Estimate per-company document counts from key collections
    const Company = require('../models/Company');
    const totalCompanies = await Company.countDocuments();
    const activeCompanies = await Company.countDocuments({ isActive: true });

    // Key tenant-scoped collections
    const tenantCollections = [
      'products', 'salesorders', 'purchaseorders', 'invoices',
      'journalentries', 'stockmovements', 'grns', 'clients', 'suppliers',
    ];

    const collectionDocs = [];
    for (const colName of tenantCollections) {
      try {
        const count = await db.collection(colName).countDocuments();
        collectionDocs.push({ collection: colName, documents: count });
      } catch (e) {
        collectionDocs.push({ collection: colName, documents: 0 });
      }
    }
    const totalTenantDocs = collectionDocs.reduce((s, c) => s + c.documents, 0);
    const avgDocsPerCompany = totalCompanies > 0 ? Math.round(totalTenantDocs / totalCompanies) : 0;

    return {
      total_companies: totalCompanies,
      active_companies: activeCompanies,
      total_tenant_documents: totalTenantDocs,
      avg_documents_per_company: avgDocsPerCompany,
      collection_breakdown: collectionDocs.sort((a, b) => b.documents - a.documents),
    };
  } catch (e) {
    return null;
  }
}

// ── System Capacity Estimate ────────────────────────────────────────────
function getCapacityEstimate(memory, dbStats, companyStats, requestMetrics) {
  const currentLoad = companyStats?.active_companies || 0;
  const totalDocs = companyStats?.total_tenant_documents || 0;
  const dbSizeMb = dbStats?.total_size_mb || 0;

  // 1. Derive actual per-company footprint from DB stats
  const actualDbPerCompanyMb = currentLoad > 0 ? dbSizeMb / currentLoad : 0;
  const actualDocsPerCompany = currentLoad > 0 ? totalDocs / currentLoad : 0;

  // 2. Heap limit from v8 (returns bytes)
  const v8Stats = require('v8').getHeapStatistics();
  const maxHeapMb = Math.round((v8Stats.heap_size_limit || 0) / 1024 / 1024 * 100) / 100;
  const heapHeadroomMb = Math.max(0, maxHeapMb - memory.heap_used_mb);

  // 3. DB headroom: use MongoDB's dataSize + indexSize as the real ceiling
  // If we can't query server status, estimate from collection sizes
  let dbLimitMb = 5120; // Start with 5GB generic assumption
  try {
    // Try to get real wiredTiger cache limit or server disk info
    const os = require('os');
    const freeDiskMb = Math.round(os.freemem() / 1024 / 1024 * 0.3); // Conservative 30% of free RAM for DB
    dbLimitMb = Math.max(dbLimitMb, freeDiskMb);
  } catch (e) {
    // ignore
  }
  const dbHeadroomMb = Math.max(0, dbLimitMb - dbSizeMb);

  // 4. Capacity by DB (based on actual average size per company)
  const companiesByDb = actualDbPerCompanyMb > 0
    ? Math.floor(dbHeadroomMb / actualDbPerCompanyMb)
    : Math.floor(dbHeadroomMb / 20); // fallback only if no data yet

  // 5. Capacity by heap (based on memory pressure)
  // Model: base overhead ~2MB + 0.5MB per 1000 documents in active caches
  const heapPerCompanyMb = actualDocsPerCompany > 0
    ? 2 + (actualDocsPerCompany / 1000) * 0.5
    : 4;
  const companiesByHeap = Math.floor(heapHeadroomMb / heapPerCompanyMb);

  // 6. Capacity by throughput (event loop lag + request rate)
  let companiesByThroughput = 10000; // effectively unlimited if healthy
  if (requestMetrics) {
    const rps = requestMetrics.requests_per_min / 60;
    const lag = requestMetrics.event_loop_lag_ms || 0;
    // If >50 req/min and lag >20ms, we're feeling pressure
    if (rps > 50 && lag > 20) {
      companiesByThroughput = Math.floor(currentLoad * (20 / Math.max(lag, 1)));
    } else if (rps > 200) {
      companiesByThroughput = Math.floor(currentLoad * 1.5); // conservative growth
    }
  }

  // 7. Overall limit = most restrictive bottleneck, capped at 5000
  const estimatedMaxCompanies = Math.min(companiesByHeap, companiesByDb, companiesByThroughput, 5000);
  const capacityPercent = estimatedMaxCompanies > 0
    ? Math.round((currentLoad / estimatedMaxCompanies) * 100)
    : 0;

  return {
    current_active_companies: currentLoad,
    estimated_max_companies: estimatedMaxCompanies,
    capacity_used_percent: capacityPercent,
    headroom_companies: Math.max(0, estimatedMaxCompanies - currentLoad),
    heap_headroom_mb: Math.round(heapHeadroomMb * 100) / 100,
    db_headroom_mb: Math.round(dbHeadroomMb * 100) / 100,
    node_heap_limit_mb: Math.round(maxHeapMb * 100) / 100,
    // Transparency: show how the number was derived
    derived_from: {
      actual_db_per_company_mb: Math.round(actualDbPerCompanyMb * 100) / 100,
      actual_docs_per_company: Math.round(actualDocsPerCompany * 100) / 100,
      heap_per_company_mb: Math.round(heapPerCompanyMb * 100) / 100,
      bottleneck: companiesByHeap <= companiesByDb && companiesByHeap <= companiesByThroughput
        ? 'memory'
        : companiesByDb <= companiesByHeap && companiesByDb <= companiesByThroughput
          ? 'database'
          : 'throughput',
    },
  };
}

// ── System Load / CPU ───────────────────────────────────────────────────
function getSystemLoad() {
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const cpuCount = cpus.length || 1;
  return {
    cpu_count: cpuCount,
    load_average_1m: Math.round(loadAvg[0] * 100) / 100,
    load_average_5m: Math.round(loadAvg[1] * 100) / 100,
    load_average_15m: Math.round(loadAvg[2] * 100) / 100,
    load_percent_1m: Math.round((loadAvg[0] / cpuCount) * 100),
    total_memory_mb: Math.round(os.totalmem() / 1024 / 1024),
    free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
    uptime_hours: Math.round(os.uptime() / 3600 * 10) / 10,
  };
}

// ── Aggregate Metrics Builder ───────────────────────────────────────────
async function buildAdvancedMetrics(memorySnapshot) {
  const [dbStats, companyStats] = await Promise.all([
    getDatabaseStats(),
    getCompanyDatasetStats(),
  ]);

  const requests = getRequestMetrics();
  const capacity = getCapacityEstimate(memorySnapshot, dbStats, companyStats, {
    requests_per_min: requests.requests_per_min,
    event_loop_lag_ms: lastEventLoopLag,
  });
  const system = getSystemLoad();

  return {
    requests,
    database_stats: dbStats,
    company_stats: companyStats,
    capacity,
    system,
    event_loop_lag_ms: Math.round(lastEventLoopLag * 100) / 100,
    active_connections: mongoose.connection.readyState === 1
      ? (mongoose.connection.db?.serverConfig?.connections?.length || 1)
      : 0,
  };
}

module.exports = {
  recordRequest,
  getRequestMetrics,
  getDatabaseStats,
  getCompanyDatasetStats,
  getCapacityEstimate,
  getSystemLoad,
  buildAdvancedMetrics,
};
