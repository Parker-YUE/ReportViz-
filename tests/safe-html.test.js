const assert = require('assert');
const { escapeHtml, escapeHtmlDeep } = require('../public/safe-html');

assert.strictEqual(
  escapeHtml('<img src=x onerror="alert(1)">&\''),
  '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;'
);

const original = {
  title: '<script>alert(1)</script>',
  score: 80,
  active: true,
  items: ['A&B'],
};
const escaped = escapeHtmlDeep(original);

assert.strictEqual(escaped.title, '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.strictEqual(escaped.items[0], 'A&amp;B');
assert.strictEqual(escaped.score, 80);
assert.strictEqual(escaped.active, true);
assert.strictEqual(original.title, '<script>alert(1)</script>');

console.log('页面动态内容转义测试通过');
