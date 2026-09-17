const assert = require('assert');
const {
  DIRECT_UPLOAD_MAX_BYTES,
  decodeBase64Payload,
  MAX_FILE_BYTES,
  MIME_BY_EXTENSION,
  validateFilePayload,
  validatePngBuffer,
  validateStoredFile,
  validateUploadMetadata,
} = require('../lib/upload-validation');

const valid = validateFilePayload(Buffer.from('hello').toString('base64'), 'report.txt');
assert.strictEqual(valid.ext, 'txt');
assert.strictEqual(valid.buffer.toString(), 'hello');

assert.throws(
  () => validateFilePayload(Buffer.from('x').toString('base64'), 'legacy.doc'),
  err => err.status === 400 && err.message.includes('.pdf/.docx/.txt')
);

assert.throws(
  () => validateFilePayload(Buffer.alloc(MAX_FILE_BYTES + 1).toString('base64'), 'large.pdf'),
  err => err.status === 413 && err.message.includes('3MB')
);

assert.throws(
  () => validateFilePayload('%%%not-base64%%%', 'broken.txt'),
  err => err.status === 400 && err.message.includes('文件数据无效')
);

assert.strictEqual(
  decodeBase64Payload(Buffer.from('png-data').toString('base64'), 100).toString(),
  'png-data'
);
assert.throws(
  () => decodeBase64Payload(Buffer.alloc(101).toString('base64'), 100),
  err => err.status === 413
);

const maxMetadata = validateUploadMetadata({
  filename: 'report.pdf',
  size: DIRECT_UPLOAD_MAX_BYTES,
  mimeType: MIME_BY_EXTENSION.pdf,
});
assert.strictEqual(maxMetadata.ext, 'pdf');
assert.strictEqual(maxMetadata.size, DIRECT_UPLOAD_MAX_BYTES);

assert.throws(
  () => validateUploadMetadata({
    filename: 'too-large.pdf',
    size: DIRECT_UPLOAD_MAX_BYTES + 1,
    mimeType: MIME_BY_EXTENSION.pdf,
  }),
  err => err.status === 413 && err.message.includes('10MB')
);

assert.throws(
  () => validateUploadMetadata({
    filename: 'fake.pdf',
    size: 100,
    mimeType: 'text/plain',
  }),
  err => err.status === 400 && err.message.includes('类型')
);

assert.deepStrictEqual(
  validateStoredFile(Buffer.from('%PDF-1.7\nbody'), 'report.pdf', 13),
  { ext: 'pdf' }
);

assert.deepStrictEqual(
  validateStoredFile(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]), 'report.docx', 5),
  { ext: 'docx' }
);

assert.deepStrictEqual(
  validateStoredFile(Buffer.from('这是一份正常文本'), 'report.txt', Buffer.byteLength('这是一份正常文本')),
  { ext: 'txt' }
);

assert.throws(
  () => validateStoredFile(Buffer.from('not a pdf'), 'report.pdf', 9),
  err => err.status === 400 && err.message.includes('格式')
);

assert.throws(
  () => validateStoredFile(Buffer.from([0x00, 0x01, 0x02]), 'report.txt', 3),
  err => err.status === 400 && err.message.includes('格式')
);

assert.throws(
  () => validateStoredFile(Buffer.from('%PDF-1.7'), 'report.pdf', 999),
  err => err.status === 400 && err.message.includes('大小')
);

const validPng = Buffer.from('89504e470d0a1a0a00000000', 'hex');
assert.strictEqual(validatePngBuffer(validPng), validPng);
assert.throws(
  () => validatePngBuffer(Buffer.from('<script>alert(1)</script>')),
  err => err.status === 400 && err.message.includes('PNG')
);

console.log('上传载荷限制测试通过');
