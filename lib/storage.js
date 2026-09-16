const { getDB } = require('./db');

const BUCKET = 'attachments';

// 冷启动时只尝试建一次 bucket（已存在会抛错，忽略）
let _ensured = false;

async function ensureBucket() {
  if (_ensured) return;
  try {
    await getDB().storage.createBucket(BUCKET, { public: false });
  } catch (e) {
    // bucket 已存在
  }
  _ensured = true;
}

// 上传原始文件（PDF/DOCX/TXT 等）→ {recordId}/input
async function uploadInput(recordId, buffer, contentType) {
  await ensureBucket();
  const { error } = await getDB().storage
    .from(BUCKET)
    .upload(`${recordId}/input`, buffer, { contentType, upsert: true });
  if (error) throw error;
}

// 上传原始文本 → {recordId}/input.txt
async function uploadText(recordId, text) {
  await ensureBucket();
  const { error } = await getDB().storage
    .from(BUCKET)
    .upload(`${recordId}/input.txt`, text, { contentType: 'text/plain; charset=utf-8', upsert: true });
  if (error) throw error;
}

// 上传 PNG → {recordId}/preview.png
async function uploadPng(recordId, buffer) {
  await ensureBucket();
  const { error } = await getDB().storage
    .from(BUCKET)
    .upload(`${recordId}/preview.png`, buffer, { contentType: 'image/png', upsert: true });
  if (error) throw error;
}

// 下载附件。type: 'png' | 'input'
// 返回 { buffer, path } 或 null（文件不存在）
async function downloadFile(recordId, type) {
  await ensureBucket();
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
  ensureBucket,
  uploadInput,
  uploadText,
  uploadPng,
  downloadFile,
};
