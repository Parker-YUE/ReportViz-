const { getDB } = require('./db');

const BUCKET = 'attachments';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 注意：bucket 需已存在于 Supabase（生产环境已创建）。
// 不在请求内尝试创建 bucket；生产环境需预先创建，避免每次上传增加无意义的网络往返。

// 上传原始文件（PDF/DOCX/TXT 等）→ {recordId}/input
async function uploadInput(recordId, buffer, contentType) {
  const { error } = await getDB().storage
    .from(BUCKET)
    .upload(buildInputPath(recordId), buffer, { contentType, upsert: true });
  if (error) throw error;
}

function buildInputPath(recordId) {
  if (typeof recordId !== 'string' || !UUID_PATTERN.test(recordId)) {
    const error = new Error('存储路径无效');
    error.code = 'INVALID_STORAGE_PATH';
    throw error;
  }
  return `${recordId}/input`;
}

function assertInputPath(inputPath) {
  if (typeof inputPath !== 'string' || !inputPath.endsWith('/input')) {
    const error = new Error('存储路径无效');
    error.code = 'INVALID_STORAGE_PATH';
    throw error;
  }
  const recordId = inputPath.slice(0, -'/input'.length);
  if (buildInputPath(recordId) !== inputPath) {
    const error = new Error('存储路径无效');
    error.code = 'INVALID_STORAGE_PATH';
    throw error;
  }
  return inputPath;
}

async function createInputUploadUrl(recordId) {
  const inputPath = buildInputPath(recordId);
  const { data, error } = await getDB().storage
    .from(BUCKET)
    .createSignedUploadUrl(inputPath, { upsert: false });
  if (error || !data?.signedUrl) throw error || new Error('创建上传地址失败');
  return { signedUrl: data.signedUrl, path: inputPath };
}

async function downloadInput(inputPath) {
  const safePath = assertInputPath(inputPath);
  const { data, error } = await getDB().storage.from(BUCKET).download(safePath);
  if (error || !data) throw error || new Error('读取上传文件失败');
  return Buffer.from(await data.arrayBuffer());
}

async function removeInput(inputPath) {
  const safePath = assertInputPath(inputPath);
  const { error } = await getDB().storage.from(BUCKET).remove([safePath]);
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
  buildInputPath,
  createInputUploadUrl,
  downloadInput,
  uploadInput,
  uploadText,
  uploadPng,
  downloadFile,
  removeInput,
};
