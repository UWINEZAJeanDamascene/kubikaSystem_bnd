const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Company = require('../models/Company');

// Import centralized configuration
let JWT_SECRET = process.env.JWT_SECRET || null;
try {
	// environment module may export a getConfig function
	// keep this defensive in case environment is missing during some scripts
	// eslint-disable-next-line global-require
	const env = require('../src/config/environment');
	const config = env && typeof env.getConfig === 'function' ? env.getConfig() : null;
	if (config && config.jwt && config.jwt.secret) {
		JWT_SECRET = config.jwt.secret;
	}
} catch (err) {
	// ignore; fall back to env var
}

/**
 * Extract user and company information from JWT token
 * @param {Object} req - Express request object
 * @returns {Object} Object containing companyId and userId
 */
const getTokenInfo = (req) => {
	let token = null;

	// Extract token from Authorization header
	if (req && req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
		token = req.headers.authorization.split(' ')[1];
	}

	// Fallback to cookie token
	if (!token && req && req.cookies && req.cookies.token) {
		token = req.cookies.token;
	}

	if (!token) {
		throw new Error('No token provided');
	}

	if (!JWT_SECRET) {
		throw new Error('JWT secret not configured');
	}

	try {
		const decoded = jwt.verify(token, JWT_SECRET);
		return {
			userId: decoded.id || decoded.userId,
			companyId: decoded.companyId || decoded.company_id || decoded.company
		};
	} catch (error) {
		throw new Error('Invalid token');
	}
};

module.exports = {
	getTokenInfo,
};
