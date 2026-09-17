const assert = require('assert');
const { parseFile } = require('../lib/file-parser');

(async () => {
  const gbkChinese = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]);
  const result = await parseFile(gbkChinese, '中文测试.txt');
  assert.strictEqual(result.text, '中文');

  await assert.rejects(
    () => parseFile(Buffer.from('legacy doc'), '旧格式.doc'),
    err => err.message === '仅支持 .pdf/.docx/.txt 文件'
  );

  console.log('文件解析编码与格式测试通过');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
