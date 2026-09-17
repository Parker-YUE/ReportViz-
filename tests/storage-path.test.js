const assert = require('assert');
const { buildInputPath } = require('../lib/storage');

const recordId = '8fc5e16b-7ef8-460d-a2c8-6d0fd3ecbf92';
assert.strictEqual(buildInputPath(recordId), `${recordId}/input`);

assert.throws(
  () => buildInputPath('../escape'),
  error => error && error.code === 'INVALID_STORAGE_PATH'
);

assert.throws(
  () => buildInputPath('8fc5e16b-7ef8-060d-a2c8-6d0fd3ecbf92'),
  error => error && error.code === 'INVALID_STORAGE_PATH'
);

console.log('私有上传路径约束测试通过');
