const { getDB } = require('./db');

const BUCKET = 'attachments';

// 注意：bucket 需已存在于 Supabase（生产环境已创建）。
// 不再做 createBucket 尝试——那是一次多余的冷启动往返，在 Vercel Hobby 10s 超时下要省掉。

// 上传原始文件（PDF/DOCX/TXT 等）→ {recordId}/input
async function uploadInput(recordId, buffer, contentType) {
  const { error } = await getDB().storage
    .from(BUCKET)
    .upload(`${recordId}/input`, buffer, { contentType, upsert: true });
  if (error) throw error;
}

// 上传原始文本 → {recordId}/input.txt
async function uploadText(recordId, text) {
  const { error } = await getDB().storage
    .from(BUCKET)
    .upload(`${recordId}/input.txt`, text, { contentType: 'text/plain; charset=utf-8', upsert: true });
  if (error) throw error;
}

// 上传 PNG → {recordId}/preview.png
async function uploadPng(recordId, buffer) {
  const { error } = await getDB().storage
    .from(BUCKET)
    .upload(`${recordId}/preview.png`, buffer, { contentType: 'image/png', upsert: true });
  if (error) throw error;
}

// 下载附件。type: 'png' | 'input'
// 返回 { buffer, path } 或 null（文件不存在）
async function downloadFile(recordId, type) {
  const paths = type === 'png'
    ? [`${recordId}/preview.png`]
    : [`${recordId}/input`, `${recordId}/input.txt`];

  for (const p of paths) {
    const { data, error } = await getDB().storage.from(BUCKET).download(p);
    if (!error && data) {
      const buffer = Buffer.from(await data.arrayBuffer());
      return { buffer, path: p };
    }
  }
  return null;
}

module.exports = {
  uploadInput,
  uploadText,
  uploadPng,
  downloadFile,
};
