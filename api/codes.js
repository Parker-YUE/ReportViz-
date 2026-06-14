const { getDB } = require('../lib/db');
const { requireAdminToken } = require('../lib/jwt');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  // 验证管理员 token
  const auth = requireAdminToken(req);
  if (!auth.valid) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const db = getDB();

  // POST /api/codes - 生成新邀请码
  if (req.method === 'POST') {
    const { max_uses = 1, expires_days = 90, note = '' } = req.body || {};

    // 生成邀请码：RV- + 6位随机字符
    const code = 'RV-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const expiresAt = expires_days > 0
      ? new Date(Date.now() + expires_days * 86400000).toISOString()
      : null;

    const { data, error } = await db
      .from('invitation_codes')
      .insert({
        code,
        max_uses: Math.max(1, parseInt(max_uses) || 1),
        expires_at: expiresAt,
        note: note.slice(0, 100),
      })
      .select()
      .single();

    if (error) {
      console.error('Create code error:', error);
      return res.status(500).json({ error: '创建失败' });
    }

    return res.status(201).json(data);
  }

  // GET /api/codes - 查看所有邀请码
  if (req.method === 'GET') {
    const { data, error } = await db
      .from('invitation_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: '查询失败' });
    }

    return res.status(200).json({ codes: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
