/**
 * Request Timing Middleware
 * Tracks response times and status codes for the health dashboard.
 * Lightweight: only stores rolling samples, no DB writes.
 */

const { recordRequest } = require('../services/systemMetricsService');

function requestTimingMiddleware(req, res, next) {
  const start = Date.now();

  function onFinish() {
    cleanup();
    const duration = Date.now() - start;
    recordRequest(duration, res.statusCode);
  }

  function onClose() {
    cleanup();
    const duration = Date.now() - start;
    recordRequest(duration, res.statusCode || 499);
  }

  function cleanup() {
    res.removeListener('finish', onFinish);
    res.removeListener('close', onClose);
  }

  res.once('finish', onFinish);
  res.once('close', onClose);
  next();
}

module.exports = requestTimingMiddleware;
