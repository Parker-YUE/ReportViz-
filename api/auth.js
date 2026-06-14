const { getDB } = require('../lib/db');
const { createUserToken } = require('../lib/jwt');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.body || {};
  if (!code || !code.trim()) {
    return res.status(400).json({ error: '请输入邀请码' });
  }

  const db = getDB();

  // 查询邀请码
  const { data: invite, error } = await db
    .from('invitation_codes')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .single();

  if (error || !invite) {
    return res.status(401).json({ error: '邀请码无效或已过期' });
  }

  // 检查过期
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.status(401).json({ error: '邀请码无效或已过期' });
  }

  // 检查使用次数
  if (invite.max_uses > 0 && invite.used_count >= invite.max_uses) {
    return res.status(403).json({ error: '邀请码已用完' });
  }

  // 增加使用次数
  await db
    .from('invitation_codes')
    .update({ used_count: invite.used_count + 1 })
    .eq('id', invite.id);

  // 生成 token
  const token = createUserToken(invite.code);

  return res.status(200).json({ token, code: invite.code });
};
