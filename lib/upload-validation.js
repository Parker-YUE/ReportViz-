const MAX_FILE_BYTES = 3 * 1024 * 1024;
const DIRECT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'txt']);
const MIME_BY_EXTENSION = Object.freeze({
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
});

function validationError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function decodeBase64Payload(value, maxBytes) {
  if (typeof value !== 'string') throw validationError(400, '数据无效');
  const normalized = value.trim();
  if (!normalized
    || normalized.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw validationError(400, '数据无效');
  }
  if (normalized.length > Math.ceil(maxBytes / 3) * 4) {
    throw validationError(413, '数据超过大小限制');
  }
  const buffer = Buffer.from(normalized, 'base64');
  if (buffer.length > maxBytes) throw validationError(413, '数据超过大小限制');
  return buffer;
}

function validateFilePayload(fileBase64, filename) {
  if (typeof fileBase64 !== 'string' || typeof filename !== 'string') {
    throw validationError(400, '文件数据无效');
  }

  const ext = filename.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw validationError(400, '仅支持 .pdf/.docx/.txt 文件');
  }

  let buffer;
  try {
    buffer = decodeBase64Payload(fileBase64, MAX_FILE_BYTES);
  } catch (error) {
    if (error.status === 413) throw validationError(413, '文件超过 3MB 限制');
    throw validationError(400, '文件数据无效');
  }

  return { buffer, ext };
}

function getSafeExtension(filename) {
  if (typeof filename !== 'string') {
    throw validationError(400, '文件名无效');
  }
  const normalized = filename.trim();
  if (!normalized || normalized.length > 255 || /[\\/\0\r\n]/.test(normalized)) {
    throw validationError(400, '文件名无效');
  }
  const ext = normalized.includes('.') ? normalized.split('.').pop().toLowerCase() : '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw validationError(400, '仅支持 .pdf/.docx/.txt 文件');
  }
  return { filename: normalized, ext };
}

function validateUploadMetadata({ filename, size, mimeType } = {}) {
  const safeFile = getSafeExtension(filename);
  if (!Number.isInteger(size) || size <= 0) {
    throw validationError(400, '文件大小无效');
  }
  if (size > DIRECT_UPLOAD_MAX_BYTES) {
    throw validationError(413, '文件超过 10MB 限制');
  }
  if (mimeType !== MIME_BY_EXTENSION[safeFile.ext]) {
    throw validationError(400, '文件类型与扩展名不匹配');
  }
  return { ...safeFile, size, mimeType };
}

function validateStoredFile(buffer, filename, declaredSize) {
  const { ext } = getSafeExtension(filename);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw validationError(400, '文件内容无效');
  }
  if (buffer.length > DIRECT_UPLOAD_MAX_BYTES) {
    throw validationError(413, '文件超过 10MB 限制');
  }
  if (!Number.isInteger(declaredSize) || declaredSize !== buffer.length) {
    throw validationError(400, '文件实际大小与上传信息不一致');
  }

  const validSignature = ext === 'pdf'
    ? buffer.subarray(0, 4).equals(Buffer.from('%PDF'))
    : ext === 'docx'
      ? buffer.length >= 4
        && buffer[0] === 0x50
        && buffer[1] === 0x4b
        && buffer[2] === 0x03
        && buffer[3] === 0x04
      : isLikelyText(buffer);

  if (!validSignature) {
    throw validationError(400, '文件内容与格式不匹配');
  }
  return { ext };
}

function isLikelyText(buffer) {
  if (buffer.includes(0)) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) suspicious += 1;
  }
  return suspicious / sample.length < 0.05;
}

module.exports = {
  ALLOWED_EXTENSIONS,
  DIRECT_UPLOAD_MAX_BYTES,
  decodeBase64Payload,
  MAX_FILE_BYTES,
  MIME_BY_EXTENSION,
  validateFilePayload,
  validateStoredFile,
  validateUploadMetadata,
};
