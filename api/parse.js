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
      temperature: 0.1,
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

    // === 后处理：不依赖 AI 听话，代码层面强制保障 ===
    if (data.sections) {

      // 1. 评分锚定：查询同 hash 的历史记录
      let previousScore = null;
      if (textHash) {
        try {
          const { data: prevRecords } = await db
            .from('parse_records')
            .select('result_json')
            .eq('input_text_hash', textHash)
            .order('created_at', { ascending: false })
            .limit(1);

          if (prevRecords && prevRecords.length > 0) {
            const prevSections = prevRecords[0].result_json?.sections || [];
            const prevRadar = prevSections.find(s => s.type === 'radar_score');
            if (prevRadar && typeof prevRadar.total_score === 'number') {
              previousScore = prevRadar.total_score;
            }
          }
        } catch (e) {
          console.error('Score anchor lookup failed:', e.message);
        }
      }

      // 2. 提取被评估人姓名（多种来源兜底）
      let personName = null;
      // 来源1: info_grid 中的姓名字段
      for (const s of data.sections) {
        if (s.type === 'info_grid' && s.items) {
          const nameItem = s.items.find(it =>
            ['姓名', '名字', 'Name', '被评估人', '学员', '学员姓名', '候选人'].includes(it.label)
          );
          if (nameItem && nameItem.value && /^[一-龥]{2,4}$/.test(nameItem.value)) {
            personName = nameItem.value;
            break;
          }
        }
      }
      // 来源2: 从原文文本中提取
      if (!personName && inputText) {
        const namePatterns = [
          /姓名[：:]\s*([一-龥]{2,4})/,
          /学员[：:]\s*([一-龥]{2,4})/,
          /被评估人[：:]\s*([一-龥]{2,4})/,
          /候选人[：:]\s*([一-龥]{2,4})/,
        ];
        for (const p of namePatterns) {
          const m = inputText.match(p);
          if (m) { personName = m[1]; break; }
        }
      }
      // 来源3: 从文件名中提取，如"报告（张三）.docx"
      if (!personName && filename) {
        const fnMatch = filename.match(/[（(]([一-龥]{2,4})[）)]/);
        if (fnMatch) personName = fnMatch[1];
      }

      // 3. 逐 section 修复
      data.sections = data.sections.map(function(s) {

        // 3a. radar_score: 评分校正
        if (s.type === 'radar_score') {
          if (typeof s.total_score === 'number' && s.total_score < 70) {
            s.total_score = 70;
          }
          if (previousScore !== null && typeof s.total_score === 'number') {
            const diff = s.total_score - previousScore;
            if (Math.abs(diff) > 3) {
              s.total_score = previousScore + Math.sign(diff) * 3;
            }
          }
        }

        // 3b. track_cards: 去重 + 强制替换赛道词
        if (s.type === 'track_cards') {
          // 去 title 中的赛道
          if (s.title) {
            s.title = s.title.replace(/发展赛道/g, '推荐方向').replace(/赛道/g, '方向');
          }
          if (s.tracks) {
            // 去重：同 level 只保留第一个
            const seenLevels = new Set();
            s.tracks = s.tracks.filter(function(t) {
              if (seenLevels.has(t.level)) return false;
              seenLevels.add(t.level);
              return true;
            });
            // 强制替换 label 中的赛道词
            s.tracks = s.tracks.map(function(t) {
              if (t.label) {
                t.label = t.label.replace(/主赛道/g, '核心方向')
                                 .replace(/副业赛道/g, '补充方向')
                                 .replace(/高阶赛道/g, '进阶方向')
                                 .replace(/赛道/g, '方向');
              }
              if (t.name) {
                t.name = t.name.replace(/赛道/g, '方向');
              }
              if (t.content) {
                t.content = t.content.replace(/赛道/g, '方向');
              }
              return t;
            });
          }
        }

        // 3c. 人名替换为"你"（info_grid 除外）
        if (personName && s.type !== 'info_grid') {
          const nameRegex = new RegExp(personName, 'g');
          s = replaceNameInObj(s, nameRegex);
        }

        return s;
      });

      // 4. 最终保底：再扫一遍确保没有遗漏的 score < 70
      for (const s of data.sections) {
        if (s.type === 'radar_score' && typeof s.total_score === 'number' && s.total_score < 70) {
          s.total_score = 70;
        }
      }
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

// 递归替换对象中所有字符串值里的人名
function replaceNameInObj(obj, regex) {
  if (typeof obj === 'string') {
    return obj.replace(regex, '你');
  }
  if (Array.isArray(obj)) {
    return obj.map(item => replaceNameInObj(item, regex));
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = replaceNameInObj(obj[key], regex);
    }
    return result;
  }
  return obj;
}
