const assert = require('assert');
const { sanitizeResult } = require('../lib/result-sanitizer');

function walkStrings(value, visitor) {
  if (typeof value === 'string') {
    visitor(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => walkStrings(item, visitor));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(item => walkStrings(item, visitor));
  }
}

function assertNoText(value, forbidden) {
  walkStrings(value, text => {
    assert(
      !text.includes(forbidden),
      `Expected output not to contain "${forbidden}", got: ${text}`
    );
  });
}

const sample = {
  title: '陈虹旭背景评估报告',
  subtitle: '陈虹旭适合AI产品方向',
  badges: ['主赛道'],
  meta: { date: '2026.6', duration: '陈虹旭规划期' },
  sections: [
    {
      type: 'info_grid',
      title: '基本背景',
      items: [
        { label: '姓名', value: '陈虹旭' },
        { label: '目标岗位', value: 'AI产品经理' },
      ],
    },
    {
      type: 'radar_score',
      title: '能力评估',
      total_score: 65,
      conclusion: '陈虹旭需要补齐项目经历',
      dimensions: [
        { name: '专业理解', score: 85, description: '陈虹旭有基础' },
        { name: '项目经历', score: 50, description: '陈虹旭项目经历偏少' },
        { name: '执行力', score: '60', description: '陈虹旭需要加强' },
      ],
    },
    {
      type: 'track_cards',
      title: '发展赛道建议',
      tracks: [
        { level: 'main', label: '主赛道', name: 'AI产品经理赛道', content: '陈虹旭适合主赛道' },
        { level: 'side', label: '副业赛道', name: '内容产品赛道', content: '副业赛道可作为补充' },
        { level: 'side', label: '副业赛道', name: '重复副业赛道', content: '应该删除' },
        { level: 'advanced', label: '高阶赛道', name: '增长赛道', content: '高阶赛道方向' },
      ],
    },
    {
      type: 'summary',
      title: '总结',
      content: '陈虹旭具备较强学习能力。',
      highlight: '建议陈虹旭补齐AI项目闭环。',
    },
  ],
};

const result = sanitizeResult(sample, {
  inputText: '姓名：陈虹旭\n目标岗位：AI产品经理',
  filename: '学员-背景评估报告（陈虹旭）.docx',
});

assert.strictEqual(result.title, '你背景评估报告');
assert.strictEqual(result.sections[0].items[0].value, '陈虹旭');

const radar = result.sections.find(section => section.type === 'radar_score');
assert.strictEqual(radar.total_score, 70);
assert.deepStrictEqual(
  radar.dimensions.map(item => item.score),
  [85, 70, 70]
);

const tracks = result.sections.find(section => section.type === 'track_cards').tracks;
assert.deepStrictEqual(
  tracks.map(item => item.label),
  ['核心方向', '补充方向', '进阶方向']
);
assert.strictEqual(tracks.length, 3);

assertNoText(result, '主赛道');
assertNoText(result, '副业赛道');
assertNoText(result, '高阶赛道');
assertNoText(result, '赛道');
assertNoText(result.sections.slice(1), '陈虹旭');

console.log('result sanitizer tests passed');
