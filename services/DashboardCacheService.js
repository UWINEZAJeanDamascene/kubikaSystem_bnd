/**
 * Dashboard Cache Service
 *
 * Dashboard cache facade.
 *
 * Dashboards are intentionally uncached so operational screens reflect the
 * latest sales, stock, journal, AR/AP, and banking activity on every request.
 */

const MAX_DASHBOARD_CACHE_SIZE = 2000; // Hard cap on in-memory entries

class DashboardCacheService {

  constructor() {
    this.store = new Map()
    // Kept for compatibility with services that call invalidate()/getStats().
    // get() always misses and set() is a no-op.
    this.defaultTTL = 60 * 1000
    // Periodic cleanup every 5 minutes to evict stale entries
    this._cleanupTimer = setInterval(() => this._cleanup(true), 5 * 60 * 1000)
    if (this._cleanupTimer.unref) this._cleanupTimer.unref()
  }

  _key(companyId, dashboardName, params = '') {
    return `${companyId}:${dashboardName}:${params}`
  }

  /**
   * Remove expired entries and enforce max size (LRU-like: oldest first).
   */
  _cleanup(forceMax = false) {
    const now = Date.now()
    for (const [key, item] of this.store) {
      if (item.expiresAt < now) {
        this.store.delete(key)
      }
    }
    const overage = this.store.size - MAX_DASHBOARD_CACHE_SIZE
    if (forceMax || overage > 0) {
      const keysToDelete = Array.from(this.store.keys()).slice(0, Math.max(0, overage + 100))
      for (const key of keysToDelete) this.store.delete(key)
    }
  }

  /**
   * Get cached dashboard data
   * @param {string} companyId - Company ID
   * @param {string} dashboardName - Name of the dashboard
   * @param {string} params - Optional params string for cache key
   * @returns {object|null} Cached data or null if not found/expired
   */
  get(companyId, dashboardName, params = '') {
    return null
  }

  /**
   * Set cached dashboard data
   * @param {string} companyId - Company ID
   * @param {string} dashboardName - Name of the dashboard
   * @param {object} data - Data to cache
   * @param {string} params - Optional params string for cache key
   * @param {number} ttlMs - Optional custom TTL in milliseconds
   */
  set(companyId, dashboardName, data, params = '', ttlMs = null) {
    return data
  }

  /**
   * Called by JournalService after every successful post
   * Invalidates all dashboard caches for the company
   * @param {string} companyId - Company ID
   */
  invalidate(companyId) {
    for (const key of this.store.keys()) {
      if (key.startsWith(`${companyId}:`)) {
        this.store.delete(key)
      }
    }
  }

  /**
   * Called when stock levels change
   * Invalidates specific dashboard caches
   * @param {string} companyId - Company ID
   * @param {string} dashboardName - Name of the dashboard to invalidate
   */
  invalidateDashboard(companyId, dashboardName) {
    for (const key of this.store.keys()) {
      if (key.startsWith(`${companyId}:${dashboardName}:`)) {
        this.store.delete(key)
      }
    }
  }

  /**
   * Clear all cached data (useful for testing)
   */
  clearAll() {
    this.store.clear()
  }

  /**
   * Get cache statistics (useful for debugging)
   */
  getStats() {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys())
    }
  }
}

// Singleton — shared across all requests in the process
const dashboardCache = new DashboardCacheService()
module.exports = dashboardCache
