const assert = require('assert');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-upload-ticket-secret-that-is-long-enough';

const {
  createUploadTicket,
  verifyUploadTicket,
} = require('../lib/jwt');

const payload = {
  code: 'RV-A14E7C',
  recordId: '8fc5e16b-7ef8-460d-a2c8-6d0fd3ecbf92',
  path: '8fc5e16b-7ef8-460d-a2c8-6d0fd3ecbf92/input',
  filename: 'report.pdf',
  size: 1024,
  mimeType: 'application/pdf',
};

const ticket = createUploadTicket(payload);
const decoded = verifyUploadTicket(ticket, payload.code);
assert(decoded);
assert.strictEqual(decoded.type, 'upload');
assert.strictEqual(decoded.recordId, payload.recordId);
assert.strictEqual(decoded.path, payload.path);
assert.strictEqual(decoded.filename, payload.filename);
assert.strictEqual(decoded.size, payload.size);
assert.strictEqual(decoded.mimeType, payload.mimeType);

assert.strictEqual(verifyUploadTicket(ticket, 'RV-OTHER'), null);
assert.strictEqual(verifyUploadTicket(`${ticket}broken`, payload.code), null);

const expiredTicket = jwt.sign(
  { type: 'upload', ...payload, exp: Math.floor(Date.now() / 1000) - 1 },
  process.env.JWT_SECRET
);
assert.strictEqual(verifyUploadTicket(expiredTicket, payload.code), null);

const wrongPathTicket = jwt.sign(
  { type: 'upload', ...payload, path: '../escape' },
  process.env.JWT_SECRET,
  { expiresIn: '15m' }
);
assert.strictEqual(verifyUploadTicket(wrongPathTicket, payload.code), null);

console.log('上传票据绑定与过期校验测试通过');
