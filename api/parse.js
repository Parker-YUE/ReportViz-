const { getDB } = require('../lib/db');
const { requireUserToken } = require('../lib/jwt');
const { parseFile, sha256 } = require('../lib/file-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');
const { waitUntil } = require('@vercel/functions');
const {
  assertScoredResult,
  normalizeReportMode,
  sanitizeResult,
} = require('../lib/result-sanitizer');
const { buildSystemPrompt } = require('../lib/prompt-builder');
const { uploadInput, uploadText } = require('../lib/storage');
const {
  getSafeErrorDetails,
  isTransientAIError,
  parseModelResponse,
  withTransientRetry,
} = require('../lib/ai-response');
const { validateFilePayload } = require('../lib/upload-validation');

// 每个邀请码每天最多调用次数
const DAILY_LIMIT = 30;

// 文件类型 → MIME（用于 Storage 上传）
const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

const AI_TIMEOUT_MS = 90_000;
const AI_MAX_ATTEMPTS = 2;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const log = (event, details = {}) => {
    console.info(JSON.stringify({
      scope: 'parse',
      request_id: requestId,
      event,
      elapsed_ms: Date.now() - startedAt,
      ...details,
    }));
  };
  res.setHeader('X-Request-ID', requestId);
  log('request_started');

  // 验证用户 token
  const auth = requireUserToken(req);
  if (!auth.valid) {
    return res.status(auth.status).json({ error: auth.error });
  }

  let reportMode;
  try {
    reportMode = normalizeReportMode(req.body?.report_mode);
  } catch (error) {
    return res.status(error.status || 400).json({
      error: error.message,
      request_id: requestId,
    });
  }

  // 速率限制检查
  const db = getDB();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let rateLimitResult;
  try {
    rateLimitResult = await db
      .from('parse_records')
      .select('*', { count: 'exact', head: true })
      .eq('invitation_code', auth.code)
      .gte('created_at', today.toISOString());
  } catch (error) {
    log('rate_limit_failed', { error: getSafeErrorDetails(error) });
    return res.status(502).json({
      error: '数据服务暂时不可用，请稍后重试',
      request_id: requestId,
      retryable: true,
    });
  }

  if (rateLimitResult.error) {
    log('rate_limit_failed', { error: getSafeErrorDetails(rateLimitResult.error) });
    return res.status(502).json({
      error: '数据服务暂时不可用，请稍后重试',
      request_id: requestId,
      retryable: true,
    });
  }

  const count = rateLimitResult.count || 0;

  if (count >= DAILY_LIMIT) {
    return res.status(429).json({ error: '请求过于频繁，请明天再试' });
  }

  // 解析输入
  let inputText = '';
  let filename = null;
  let textHash = '';
  let rawBuffer = null;   // 原始文件字节（用于保存附件）
  let rawText = '';       // 原始文本（截断前，用于保存附件）
  let rawMime = null;

  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('multipart/form-data')) {
    // 文件上传模式 - Vercel Serverless 不支持 multer，用原生解析
    // 简化处理：要求前端以 JSON 发送 base64 文件
    return res.status(400).json({ error: '请使用 JSON 模式提交文件（file_base64 + filename）' });
  }

  // JSON 模式
  const { text, file_base64, filename: fname } = req.body || {};

  if (file_base64 && fname) {
    try {
      const { buffer, ext } = validateFilePayload(file_base64, fname);
      const result = await parseFile(buffer, fname);
      inputText = result.text;
      textHash = result.hash;
      filename = fname;
      rawBuffer = buffer;
      rawMime = MIME[ext] || 'application/octet-stream';
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, request_id: requestId });
    }
  } else if (typeof text === 'string' && text.trim()) {
    inputText = text.trim();
    rawText = inputText;
    textHash = sha256(inputText);
  } else {
    return res.status(400).json({ error: '请上传文件或输入文本' });
  }

  if (inputText.length < 30) {
    return res.status(400).json({ error: '报告内容不足，请提供更完整的文本' });
  }

  // 截断过长文本
  if (inputText.length > 15000) {
    inputText = inputText.slice(0, 15000);
  }
  log('input_ready', { mode: rawBuffer ? 'file' : 'text', input_chars: inputText.length });

  // 调用 DeepSeek AI
  try {
    const systemPrompt = buildSystemPrompt(
      loadSystemPrompt(),
      reportMode,
      loadScoredPrompt()
    );
    const client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com',
      timeout: AI_TIMEOUT_MS,
      maxRetries: 0,
    });

    log('ai_request_started');
    const resp = await withTransientRetry(
      attempt => client.chat.completions.create({
        model: 'deepseek-v4-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请解析以下报告，输出标准化JSON：\n\n' + inputText },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 4000,
      }).then(response => {
        log('ai_attempt_completed', {
          attempt,
          finish_reason: response.choices?.[0]?.finish_reason || null,
          output_tokens: response.usage?.completion_tokens || null,
        });
        return response;
      }),
      {
        maxAttempts: AI_MAX_ATTEMPTS,
        onRetry: (error, attempt) => {
          log('ai_attempt_retry', { attempt, error: getSafeErrorDetails(error) });
        },
      }
    );

    let data = parseModelResponse(resp);

    if (!data.title || !Array.isArray(data.sections)) {
      return res.status(502).json({
        error: 'AI 返回的报告结构不完整，请稍后重试',
        request_id: requestId,
        retryable: true,
      });
    }

    const previousScore = await findPreviousScore(db, textHash);
    data = sanitizeResult(data, {
      inputText,
      filename,
      previousScore,
      reportMode,
    });
    data.report_mode = reportMode;
    assertScoredResult(data, reportMode);

    // 存记录到数据库
    const { data: inserted, error: insertError } = await db
      .from('parse_records')
      .insert({
        invitation_code: auth.code,
        input_filename: filename,
        input_text_hash: textHash,
        result_json: data,
      })
      .select()
      .single();

    if (insertError) {
      log('record_insert_failed', { error: getSafeErrorDetails(insertError) });
      return res.status(502).json({
        error: '报告已生成，但保存失败，请稍后重试',
        request_id: requestId,
        retryable: true,
      });
    }
    log('record_inserted', { record_id: inserted.id });

    // 使用 Vercel 官方生命周期机制完成非关键附件上传，不阻塞响应。
    const uploadTask = rawBuffer
      ? uploadInput(inserted.id, rawBuffer, rawMime)
      : (rawText ? uploadText(inserted.id, rawText) : null);
    if (uploadTask) {
      waitUntil(uploadTask
        .then(() => log('input_attachment_uploaded', { record_id: inserted.id }))
        .catch(error => log('input_attachment_failed', {
          record_id: inserted.id,
          error: getSafeErrorDetails(error),
        })));
    }

    log('request_succeeded', { record_id: inserted.id });
    return res.status(200).json({ ...data, record_id: inserted.id });
  } catch (err) {
    if (err.code === 'INVALID_SCORED_RESULT') {
      log('request_failed', { retryable: true, error: getSafeErrorDetails(err) });
      return res.status(502).json({
        error: 'AI 未生成完整的五维评分，请重新生成',
        request_id: requestId,
        retryable: true,
      });
    }
    const retryable = isTransientAIError(err);
    log('request_failed', { retryable, error: getSafeErrorDetails(err) });
    const formatError = ['AI_INVALID_JSON', 'AI_EMPTY_RESPONSE', 'AI_OUTPUT_TRUNCATED'].includes(err.code);
    return res.status(502).json({
      error: formatError
        ? 'AI 返回格式异常，请重新生成'
        : 'AI 服务连接不稳定，请稍后重试',
      request_id: requestId,
      retryable,
    });
  }
};

function loadSystemPrompt() {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'prompts', 'system-prompt.txt'), 'utf-8');
  } catch {
    return '你是报告解析专家。将报告解析为JSON。只输出JSON。';
  }
}

function loadScoredPrompt() {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'prompts', 'scored-mode.txt'), 'utf-8');
  } catch {
    return '';
  }
}

async function findPreviousScore(db, textHash) {
  if (!textHash) return null;
  try {
    const { data: prevRecords } = await db
      .from('parse_records')
      .select('result_json')
      .eq('input_text_hash', textHash)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!prevRecords || prevRecords.length === 0) return null;

    const prevSections = prevRecords[0].result_json?.sections || [];
    const prevRadar = prevSections.find(s => s.type === 'radar_score');
    return typeof prevRadar?.total_score === 'number' ? prevRadar.total_score : null;
  } catch (e) {
    console.error('Score anchor lookup failed:', e.message);
    return null;
  }
}
