const SENSITIVE_KEY_PATTERN =
  /(password|passcode|pin|secret|token|refresh_token|access_token|authorization|api_?key|private_?key|credential|otp|mfa)/i;

function redactSensitive(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;

  if (typeof value.toObject === 'function') {
    value = value.toObject({ depopulate: true });
  }

  const output = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = '[REDACTED]';
    } else {
      output[key] = redactSensitive(nestedValue);
    }
  }
  return output;
}

module.exports = {
  redactSensitive,
  SENSITIVE_KEY_PATTERN,
};
