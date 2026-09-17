const assert = require('assert');
const { buildSystemPrompt } = require('../lib/prompt-builder');

assert.strictEqual(
  buildSystemPrompt('BASE', 'standard', 'SCORED'),
  'BASE'
);

assert.strictEqual(
  buildSystemPrompt('BASE', 'scored', 'SCORED'),
  'BASE\n\nSCORED'
);

assert.strictEqual(
  buildSystemPrompt('BASE\n', 'scored', '\nSCORED\n'),
  'BASE\n\nSCORED'
);

console.log('评分版提示词组合测试通过');
