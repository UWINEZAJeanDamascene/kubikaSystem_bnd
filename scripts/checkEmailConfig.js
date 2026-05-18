#!/usr/bin/env node
const { validateConfig, testConnection } = require('../config/email');
const env = require('../src/config/environment');
const config = env.getConfig();

(async () => {
  try {
    console.log('Email config (masked):');
    const masked = {...config.email};
    if (masked.gmailAppPassword) masked.gmailAppPassword = '*****';
    if (masked.smtpPass) masked.smtpPass = '*****';
    if (masked.resendApiKey) masked.resendApiKey = '*****';
    console.log(masked);

    const { provider, valid, missing } = validateConfig();
    console.log('Provider:', provider, 'Valid:', valid, 'Missing:', missing);

    const ok = await testConnection();
    console.log('testConnection result:', ok);
    process.exit(ok ? 0 : 2);
  } catch (err) {
    console.error('Error checking email config:', err.message);
    process.exit(1);
  }
})();
