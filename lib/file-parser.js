const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const crypto = require('crypto');

/**
 * 解析上传文件，提取文本
 * @param {Buffer} buffer - 文件内容
 * @param {string} filename - 文件名
 * @returns {{ text: string, hash: string }}
 */
async function parseFile(buffer, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  let text = '';

  if (ext === 'pdf') {
    text = await extractPDF(buffer);
  } else if (ext === 'docx') {
    text = await extractDOCX(buffer);
  } else if (ext === 'txt') {
    text = extractTXT(buffer);
  } else {
    throw new Error('仅支持 .pdf/.docx/.txt 文件');
  }

  text = cleanText(text);
  if (!text.trim()) {
    throw new Error('文件内容为空');
  }

  const hash = sha256(text);
  return { text, hash };
}

async function extractPDF(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function extractTXT(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder('gb18030', { fatal: true }).decode(buffer);
    } catch {
      throw new Error('TXT 编码无法识别，请另存为 UTF-8 或 GBK 后重试');
    }
  }
}

function cleanText(text) {
  return text.replace(/�/g, '').trim();
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

module.exports = { parseFile, sha256 };
