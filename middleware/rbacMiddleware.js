/**
 * RBAC middleware compatibility shim
 * Provides `requirePermission(resource, action)` used by routes.
 * Internally reuses the authorize middleware implementation.
 */
const { authorize } = require('./authorize');

/**
 * Create middleware that requires a permission on a resource
 * @param {string} resource
 * @param {string} action
 */
function requirePermission(resource, action) {
  return authorize(resource, action);
}

module.exports = {
  requirePermission,
};
