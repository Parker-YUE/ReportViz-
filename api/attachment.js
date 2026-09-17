const { getDB } = require('../lib/db');
const { requireUserToken, requireAdminToken } = require('../lib/jwt');
const { uploadPng, downloadFile } = require('../lib/storage');
const {
  decodeBase64Payload,
  MAX_FILE_BYTES,
  validatePngBuffer,
} = require('../lib/upload-validation');

module.exports = async function handler(req, res) {
  // POST /api/attachment - 用户下载 PNG 时上传保存
  if (req.method === 'POST') {
    const auth = requireUserToken(req);
    if (!auth.valid) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const { record_id, data_base64 } = req.body || {};
    if (!record_id || !data_base64) {
      return res.status(400).json({ error: '缺少 record_id 或图片数据' });
    }

    // 校验记录归属（该记录必须由当前邀请码产生）
    const db = getDB();
    const { data: rec, error } = await db
      .from('parse_records')
      .select('id')
      .eq('id', record_id)
      .eq('invitation_code', auth.code)
      .single();

    if (error || !rec) {
      return res.status(404).json({ error: '记录不存在' });
    }

    try {
      const buffer = validatePngBuffer(decodeBase64Payload(data_base64, MAX_FILE_BYTES));
      await uploadPng(record_id, buffer);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Upload PNG error:', err.message);
      return res.status(err.status || 500).json({
        error: err.status === 413 ? '图片超过 3MB，无法保存到后台' : '图片保存失败',
      });
    }
  }

  // GET /api/attachment?record_id=xxx&type=input|png - 管理员下载附件
  if (req.method === 'GET') {
    const auth = requireAdminToken(req);
    if (!auth.valid) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const { record_id, type } = req.query;
    if (!record_id) {
      return res.status(400).json({ error: '缺少 record_id' });
    }
    if (type !== 'input' && type !== 'png') {
      return res.status(400).json({ error: 'type 必须是 input 或 png' });
    }

    const db = getDB();
    const { data: rec } = await db
      .from('parse_records')
      .select('input_filename, result_json')
      .eq('id', record_id)
      .single();

    const file = await downloadFile(record_id, type);
    if (!file) {
      return res.status(404).json({ error: '该记录无此附件（可能是历史记录）' });
    }

    // 确定下载文件名和 Content-Type
    let filename;
    let contentType;
    if (type === 'png') {
      const title = rec?.result_json?.title || record_id;
      filename = `${title}.png`;
      contentType = 'image/png';
    } else {
      const isText = file.path.endsWith('.txt');
      filename = rec?.input_filename || 'input.txt';
      contentType = isText ? 'text/plain; charset=utf-8' : 'application/octet-stream';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', 'sandbox');
    return res.status(200).send(file.buffer);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
