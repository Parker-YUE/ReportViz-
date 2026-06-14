const { createAdminToken } = require('../lib/jwt');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: '请输入密码' });
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: '密码错误' });
  }

  const token = createAdminToken();
  return res.status(200).json({ token });
};
