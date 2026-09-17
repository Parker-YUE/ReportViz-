const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * 生成邀请码用户 token
 */
function createUserToken(invitationCode) {
  return jwt.sign(
    { type: 'user', code: invitationCode },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * 生成管理员 token
 */
function createAdminToken() {
  return jwt.sign(
    { type: 'admin' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function createUploadTicket(payload) {
  if (!isValidUploadPayload(payload)) {
    throw new Error('上传票据信息无效');
  }
  return jwt.sign(
    { ...payload, type: 'upload' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function verifyUploadTicket(token, invitationCode) {
  const payload = verifyToken(token);
  if (!payload || payload.type !== 'upload' || payload.code !== invitationCode) {
    return null;
  }
  return isValidUploadPayload(payload) ? payload : null;
}

function isValidUploadPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof payload.code === 'string'
    && payload.code.length > 0
    && typeof payload.recordId === 'string'
    && uuidPattern.test(payload.recordId)
    && payload.path === `${payload.recordId}/input`
    && typeof payload.filename === 'string'
    && payload.filename.length > 0
    && Number.isInteger(payload.size)
    && payload.size > 0
    && typeof payload.mimeType === 'string'
    && payload.mimeType.length > 0;
}

/**
 * 验证 token，返回解码后的 payload 或 null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * 从请求中提取并验证邀请码 token
 * 返回 { valid, code, payload, error, status }
 */
function requireUserToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return { valid: false, error: '认证失败，请重新输入邀请码', status: 401 };
  }
  const payload = verifyToken(auth.slice(7));
  if (!payload) {
    return { valid: false, error: '登录已过期，请重新输入邀请码', status: 401 };
  }
  if (payload.type !== 'user') {
    return { valid: false, error: '认证失败，请重新输入邀请码', status: 401 };
  }
  return { valid: true, code: payload.code, payload };
}

/**
 * 从请求中提取并验证管理员 token
 * 返回 { valid, payload, error, status }
 */
function requireAdminToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return { valid: false, error: '认证失败，请重新登录', status: 401 };
  }
  const payload = verifyToken(auth.slice(7));
  if (!payload) {
    return { valid: false, error: '登录已过期，请重新登录', status: 401 };
  }
  if (payload.type !== 'admin') {
    return { valid: false, error: '权限不足', status: 403 };
  }
  return { valid: true, payload };
}

module.exports = {
  createUserToken,
  createAdminToken,
  createUploadTicket,
  verifyToken,
  verifyUploadTicket,
  requireUserToken,
  requireAdminToken,
};
