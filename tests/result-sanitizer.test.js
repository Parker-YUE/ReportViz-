const assert = require('assert');
const {
  sanitizeResult,
  hasTrackConcepts,
  isAiTransformReport,
  AI_TRANSFORM_DIMENSIONS,
} = require('../lib/result-sanitizer');

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

function assertContainsText(value, search) {
  let found = false;
  walkStrings(value, text => {
    if (text.includes(search)) found = true;
  });
  assert(found, `Expected output to contain "${search}", but not found`);
}

// ============ 辅助函数测试 ============

// hasTrackConcepts
assert.strictEqual(hasTrackConcepts('这是我的职业发展方向'), true);
assert.strictEqual(hasTrackConcepts('赛道选择很重要'), true);
assert.strictEqual(hasTrackConcepts('今天天气真好'), false);
assert.strictEqual(hasTrackConcepts(''), false);
assert.strictEqual(hasTrackConcepts(null), false);

// isAiTransformReport
assert.strictEqual(isAiTransformReport('这是AI转型报告'), true);
assert.strictEqual(isAiTransformReport('这是AI 转型评估'), true);
assert.strictEqual(isAiTransformReport('普通报告'), false);

// ============ 基础清洗测试（含赛道概念） ============

const sampleWithTracks = {
  title: '陈虹旭背景评估报告',
  subtitle: '陈虹旭适合AI产品方向',
  badges: ['职业规划'],
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
      title: '职业方向建议',
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

const result1 = sanitizeResult(sampleWithTracks, {
  inputText: '姓名：陈虹旭\n目标岗位：AI产品经理\n职业规划方向建议...',
  filename: '学员-背景评估报告（陈虹旭）.docx',
});

assert.strictEqual(result1.title, '你背景评估报告');
assert.strictEqual(result1.sections[0].items[0].value, '陈虹旭');

const radar1 = result1.sections.find(s => s.type === 'radar_score');
assert.strictEqual(radar1.total_score, 70);
assert.deepStrictEqual(
  radar1.dimensions.map(d => d.score),
  [85, 70, 70]
);

// 有赛道概念 → 标准替换词
const tracks1 = result1.sections.find(s => s.type === 'track_cards').tracks;
assert.deepStrictEqual(
  tracks1.map(t => t.label),
  ['核心方向', '补充方向', '进阶方向']
);
assert.strictEqual(tracks1.length, 3);
assertNoText(result1, '主赛道');
assertNoText(result1, '副业赛道');
assertNoText(result1, '高阶赛道');
assertNoText(result1, '赛道');
assertNoText(result1.sections.slice(1), '陈虹旭');

console.log('基础清洗测试通过（含赛道概念 → 标准替换）');

// ============ 无赛道概念清洗测试 ============

const sampleWithoutTracks = {
  title: '张三学习能力评估',
  subtitle: '张三的全面学习评估',
  badges: ['学习评估'],
  meta: { date: '2026.6', duration: '—' },
  sections: [
    {
      type: 'info_grid',
      title: '基本背景',
      items: [
        { label: '姓名', value: '张三' },
        { label: '当前岗位', value: '产品经理' },
      ],
    },
    {
      type: 'radar_score',
      title: '能力评估',
      total_score: 78,
      conclusion: '张三整体学习能力较强',
      dimensions: [
        { name: '学习能力', score: 82, description: '张三学习能力突出' },
        { name: '执行力', score: 75, description: '张三执行力良好' },
      ],
    },
    {
      type: 'track_cards',
      title: '综合成长建议',
      tracks: [
        { level: 'main', label: '主赛道', name: '主赛道方向', content: '适合主赛道发展' },
        { level: 'side', label: '副业赛道', name: '副业赛道方向', content: '副业赛道可选' },
      ],
    },
    {
      type: 'summary',
      title: '总结',
      content: '张三同学表现优异。',
      highlight: '建议张三继续深造。',
    },
  ],
};

const result2 = sanitizeResult(sampleWithoutTracks, {
  inputText: '姓名：张三\n当前岗位：产品经理\n学习能力评估报告内容...',
  filename: '学习评估报告（张三）.docx',
});

// 无赛道概念 → 中性替换词
const tracks2 = result2.sections.find(s => s.type === 'track_cards').tracks;
assert.deepStrictEqual(
  tracks2.map(t => t.label),
  ['核心领域', '补充领域']
);
// section 标题无赛道关键词所以保持不变
const trackSection = result2.sections.find(s => s.type === 'track_cards');
assert.strictEqual(trackSection.title, '综合成长建议');
assertNoText(result2, '赛道');
assertNoText(result2, '主赛道');
assertNoText(result2, '副业赛道');
assertNoText(result2, '核心方向');
assertNoText(result2, '补充方向');
assertNoText(result2, '发展方向');
assertNoText(result2.sections.slice(1), '张三');

console.log('无赛道概念清洗测试通过（中性替换）');

// ============ AI转型固定维度测试 ============

const sampleAiTransform = {
  title: '李四AI转型潜力评估',
  subtitle: '评估李四向AI领域转型的潜力',
  badges: ['AI转型', '能力评估'],
  meta: { date: '2026.6', duration: '—' },
  sections: [
    {
      type: 'info_grid',
      title: '基本背景',
      items: [
        { label: '姓名', value: '李四' },
        { label: '当前岗位', value: '传统行业产品经理' },
      ],
    },
    {
      type: 'radar_score',
      title: '转型潜力评估',
      total_score: 70,
      conclusion: '李四具备AI转型基础',
      dimensions: [
        { name: '行业理解', score: 72, description: 'AI行业理解' },
        { name: '技术基础', score: 68, description: '技术基础薄弱' },
      ],
    },
  ],
};

const result3 = sanitizeResult(sampleAiTransform, {
  inputText: '姓名：李四\nAI转型潜力评估...AI转型相关描述...',
  filename: 'AI转型评估（李四）.docx',
});

const radar3 = result3.sections.find(s => s.type === 'radar_score');
// 维度被替换为固定五个
assert.strictEqual(radar3.dimensions.length, 5);
assert.deepStrictEqual(
  radar3.dimensions.map(d => d.name),
  ['行业适配度', '能力迁移', '学习能力', '行业资源', '风险评估']
);
// 前两个维度保留 AI 原始分数
assert.strictEqual(radar3.dimensions[0].score, 72);
assert.strictEqual(radar3.dimensions[1].score, 70); // 68 被 clamp 到 70
// 后三个维度使用默认 75
assert.strictEqual(radar3.dimensions[2].score, 75);
assert.strictEqual(radar3.dimensions[3].score, 75);
assert.strictEqual(radar3.dimensions[4].score, 75);

console.log('AI转型固定维度测试通过');

// ============ AI转型未生成 radar_score 时不影响其他 section ============

const sampleAiTransformNoRadar = {
  title: '王五AI转型报告',
  subtitle: '王五的转型规划',
  badges: ['AI转型'],
  sections: [
    {
      type: 'info_grid',
      title: '基本背景',
      items: [{ label: '姓名', value: '王五' }],
    },
    {
      type: 'summary',
      title: '总结',
      content: '王五建议考虑AI转型。',
    },
  ],
};

const result4 = sanitizeResult(sampleAiTransformNoRadar, {
  inputText: 'AI转型相关报告...',
});

// 没有 radar_score 时不报错
const radar4 = result4.sections.find(s => s.type === 'radar_score');
assert.strictEqual(radar4, undefined);
assertNoText(result4.sections.slice(1), '王五');

console.log('AI转型无radar时不报错测试通过');

// ============ 边界情况 ============

// 空 sections
const resultEmpty = sanitizeResult({ title: 'test', sections: [] }, { inputText: 'test' });
assert.deepStrictEqual(resultEmpty.sections, []);

// 无 sections 字段
const resultNoSections = sanitizeResult({ title: 'test' }, { inputText: 'test' });
assert.strictEqual(resultNoSections.title, 'test');

console.log('边界情况测试通过');
console.log('');
console.log('所有测试通过 ✅');
