const assert = require('assert');
const {
  getSafeErrorDetails,
  parseModelResponse,
  withTransientRetry,
} = require('../lib/ai-response');

const fenced = parseModelResponse({
  choices: [{
    finish_reason: 'stop',
    message: { content: '```json\n{"title":"测试","sections":[]}\n```' },
  }],
});
assert.strictEqual(fenced.title, '测试');
assert.deepStrictEqual(fenced.sections, []);

assert.throws(
  () => parseModelResponse({
    choices: [{ finish_reason: 'length', message: { content: '{"title":"截断"' } }],
  }),
  err => err.code === 'AI_OUTPUT_TRUNCATED'
);

const safeDetails = getSafeErrorDetails(new Error(
  'upload failed: https://storage.example.com/object?token=top-secret-value&x=1 Bearer user-secret-token'
));
assert(!safeDetails.message.includes('top-secret-value'));
assert(!safeDetails.message.includes('user-secret-token'));
assert(safeDetails.message.includes('[REDACTED]'));

assert.throws(
  () => parseModelResponse({
    choices: [{ finish_reason: 'stop', message: { content: 'not-json' } }],
  }),
  err => err.code === 'AI_INVALID_JSON'
);

(async () => {
  let attempts = 0;
  const result = await withTransientRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error('connection reset');
      error.code = 'ECONNRESET';
      throw error;
    }
    return 'ok';
  }, { maxAttempts: 2, wait: async () => {} });

  assert.strictEqual(result, 'ok');
  assert.strictEqual(attempts, 2);

  let invalidAttempts = 0;
  await assert.rejects(
    () => withTransientRetry(async () => {
      invalidAttempts += 1;
      const error = new Error('bad request');
      error.status = 400;
      throw error;
    }, { maxAttempts: 2, wait: async () => {} }),
    err => err.status === 400
  );
  assert.strictEqual(invalidAttempts, 1);

  console.log('AI 响应解析与受控重试测试通过');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
