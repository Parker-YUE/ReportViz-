const { getDB } = require('../lib/db');
const { requireUserToken } = require('../lib/jwt');
const { parseFile, sha256 } = require('../lib/file-parser');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

// 每个邀请码每天最多调用次数
const DAILY_LIMIT = 30;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 验证用户 token
  const auth = requireUserToken(req);
  if (!auth.valid) {
    return res.status(auth.status).json({ error: auth.error });
  }

  // 速率限制检查
  const db = getDB();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count } = await db
    .from('parse_records')
    .select('*', { count: 'exact', head: true })
    .eq('invitation_code', auth.code)
    .gte('created_at', today.toISOString());

  if (count >= DAILY_LIMIT) {
    return res.status(429).json({ error: '请求过于频繁，请明天再试' });
  }

  // 解析输入
  let inputText = '';
  let filename = null;
  let textHash = '';

  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('multipart/form-data')) {
    // 文件上传模式 - Vercel Serverless 不支持 multer，用原生解析
    // 简化处理：要求前端以 JSON 发送 base64 文件
    return res.status(400).json({ error: '请使用 JSON 模式提交文件（file_base64 + filename）' });
  }

  // JSON 模式
  const { text, file_base64, filename: fname } = req.body || {};

  if (file_base64 && fname) {
    // 检查文件大小（base64 约增大 33%）
    const sizeLimit = 10 * 1024 * 1024 * 1.34;
    if (file_base64.length > sizeLimit) {
      return res.status(413).json({ error: '文件超过 10MB 限制' });
    }

    const ext = fname.split('.').pop().toLowerCase();
    if (!['pdf', 'docx', 'txt', 'doc'].includes(ext)) {
      return res.status(400).json({ error: '仅支持 .pdf/.docx/.txt 文件' });
    }

    try {
      const buffer = Buffer.from(file_base64, 'base64');
      const result = await parseFile(buffer, fname);
      inputText = result.text;
      textHash = result.hash;
      filename = fname;
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  } else if (text && text.trim()) {
    inputText = text.trim();
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

  // 调用 DeepSeek AI
  try {
    const systemPrompt = loadSystemPrompt();
    const client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com',
    });

    const resp = await client.chat.completions.create({
      model: 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '请解析以下报告，输出标准化JSON：\n\n' + inputText },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    let result = resp.choices[0].message.content.trim();

    // 清理 markdown 代码块包裹
    if (result.startsWith('```')) {
      const parts = result.split('\n', 1);
      if (parts.length > 1) result = result.slice(result.indexOf('\n') + 1);
    }
    if (result.endsWith('```')) {
      result = result.slice(0, -3);
    }
    result = result.trim();

    let data;
    try {
      data = JSON.parse(result);
    } catch {
      return res.status(502).json({ error: '解析服务暂时不可用，请稍后重试' });
    }

    if (!data.title || !data.sections) {
      return res.status(502).json({ error: '解析服务暂时不可用，请稍后重试' });
    }

    // 存记录到数据库
    await db.from('parse_records').insert({
      invitation_code: auth.code,
      input_filename: filename,
      input_text_hash: textHash,
      result_json: data,
    });

    return res.status(200).json(data);
  } catch (err) {
    console.error('AI parse error:', err.message);
    return res.status(502).json({ error: '解析服务暂时不可用，请稍后重试' });
  }
};

function loadSystemPrompt() {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'prompts', 'system-prompt.txt'), 'utf-8');
  } catch {
    return '你是报告解析专家。将报告解析为JSON。只输出JSON。';
  }
}
