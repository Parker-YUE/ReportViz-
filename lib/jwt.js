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
  verifyToken,
  requireUserToken,
  requireAdminToken,
};
