const crypto = require('crypto');
const { getDB } = require('../lib/db');
const { createUploadTicket, requireUserToken } = require('../lib/jwt');
const { getSafeErrorDetails } = require('../lib/ai-response');
const { createInputUploadUrl } = require('../lib/storage');
const { validateUploadMetadata } = require('../lib/upload-validation');

const DAILY_LIMIT = 30;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const log = (event, details = {}) => {
    console.info(JSON.stringify({
      scope: 'upload_ticket',
      request_id: requestId,
      event,
      elapsed_ms: Date.now() - startedAt,
      ...details,
    }));
  };

  res.setHeader('X-Request-ID', requestId);
  res.setHeader('Cache-Control', 'no-store');

  const auth = requireUserToken(req);
  if (!auth.valid) {
    return res.status(auth.status).json({ error: auth.error });
  }

  let metadata;
  try {
    metadata = validateUploadMetadata(req.body);
  } catch (error) {
    return res.status(error.status || 400).json({
      error: error.message,
      request_id: requestId,
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const db = getDB();
    const rateLimitResult = await db
      .from('parse_records')
      .select('*', { count: 'exact', head: true })
      .eq('invitation_code', auth.code)
      .gte('created_at', today.toISOString());

    if (rateLimitResult.error) throw rateLimitResult.error;
    if ((rateLimitResult.count || 0) >= DAILY_LIMIT) {
      return res.status(429).json({ error: '请求过于频繁，请明天再试' });
    }

    const recordId = crypto.randomUUID();
    const upload = await createInputUploadUrl(recordId);
    const uploadTicket = createUploadTicket({
      code: auth.code,
      recordId,
      path: upload.path,
      filename: metadata.filename,
      size: metadata.size,
      mimeType: metadata.mimeType,
    });

    log('ticket_issued', { record_id: recordId, size: metadata.size });
    return res.status(200).json({
      signed_url: upload.signedUrl,
      upload_ticket: uploadTicket,
    });
  } catch (error) {
    log('ticket_failed', { error: getSafeErrorDetails(error) });
    return res.status(502).json({
      error: '文件上传服务暂时不可用，请稍后重试',
      request_id: requestId,
      retryable: true,
    });
  }
};
