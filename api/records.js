const { getDB } = require('../lib/db');
const { requireAdminToken } = require('../lib/jwt');

module.exports = async function handler(req, res) {
  // 验证管理员 token
  const auth = requireAdminToken(req);
  if (!auth.valid) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const db = getDB();

  // GET /api/records - 列表（分页）
  if (req.method === 'GET') {
    const id = req.query.id;

    // GET /api/records?id=xxx - 单条详情
    if (id) {
      const { data, error } = await db
        .from('parse_records')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: '记录不存在' });
      }
      return res.status(200).json(data);
    }

    // 分页列表
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const code = req.query.code; // 按邀请码筛选

    let query = db
      .from('parse_records')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (code) {
      query = query.eq('invitation_code', code);
    }

    const { data, count, error } = await query;

    if (error) {
      return res.status(500).json({ error: '查询失败' });
    }

    return res.status(200).json({
      records: data,
      total: count,
      page,
      pageSize,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
