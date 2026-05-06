// Compatibility shim: expose legacy names expected across the codebase
const auth = require('./auth');

module.exports = {
	// legacy name used in routes
	verifyToken: auth.protect,
	// alias common functions
	protect: auth.protect,
	authorize: auth.authorize,
};
