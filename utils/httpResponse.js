/**
 * Helper responses for controllers
 */
function json(res, status, payload) {
  return res.status(status).json(payload);
}

function ok(res, payload = {}) {
  return json(res, 200, payload);
}

function created(res, payload = {}) {
  return json(res, 201, payload);
}

function badRequest(res, message = 'Bad request') {
  return json(res, 400, { success: false, message });
}

function conflict(res, message = 'Conflict') {
  return json(res, 409, { success: false, message });
}

function notFound(res, message = 'Not found') {
  return json(res, 404, { success: false, message });
}

function serverError(res, message = 'Internal server error') {
  return json(res, 500, { success: false, message });
}

module.exports = {
  ok,
  created,
  badRequest,
  conflict,
  notFound,
  serverError,
};
