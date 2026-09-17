const assert = require('assert');
const {
  DIRECT_UPLOAD_MAX_BYTES,
  buildParsePayload,
  buildUploadMetadata,
  normalizeReportMode,
} = require('../public/report-options');

assert.strictEqual(normalizeReportMode(), 'standard');
assert.strictEqual(normalizeReportMode('scored'), 'scored');
assert.throws(() => normalizeReportMode('invalid'), /报告版本/);

assert.deepStrictEqual(
  buildParsePayload(undefined, { text: '足够长的测试内容' }),
  { report_mode: 'standard', text: '足够长的测试内容' }
);
assert.deepStrictEqual(
  buildParsePayload('scored', { uploadTicket: 'signed-ticket' }),
  { report_mode: 'scored', upload_ticket: 'signed-ticket' }
);

assert.deepStrictEqual(
  buildUploadMetadata({ name: '调研报告.pdf', size: DIRECT_UPLOAD_MAX_BYTES, type: '' }),
  {
    filename: '调研报告.pdf',
    size: DIRECT_UPLOAD_MAX_BYTES,
    mimeType: 'application/pdf',
  }
);

assert.throws(
  () => buildUploadMetadata({ name: '调研报告.pdf', size: DIRECT_UPLOAD_MAX_BYTES + 1 }),
  /10MB/
);
assert.throws(
  () => buildUploadMetadata({ name: '程序.exe', size: 100 }),
  /.pdf.*.docx.*.txt/
);

console.log('前端报告版本与直传参数测试通过');
