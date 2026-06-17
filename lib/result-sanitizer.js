const NAME_LABELS = [
  '姓名',
  '名字',
  'Name',
  '被评估人',
  '学员',
  '学员姓名',
  '候选人',
];

// 标准替换（输入文本含赛道/方向概念时使用）
const TRACK_REPLACEMENTS_STANDARD = [
  [/主赛道/g, '核心方向'],
  [/副业赛道/g, '补充方向'],
  [/高阶赛道/g, '进阶方向'],
  [/发展赛道/g, '发展方向'],
  [/赛道/g, '方向'],
];

// 无赛道概念时的替换（更中性，避免"方向"一词）
const TRACK_REPLACEMENTS_NEUTRAL = [
  [/主赛道/g, '核心领域'],
  [/副业赛道/g, '补充领域'],
  [/高阶赛道/g, '进阶领域'],
  [/发展赛道/g, '成长建议'],
  [/赛道/g, '领域'],
  [/核心方向/g, '核心领域'],
  [/补充方向/g, '补充领域'],
  [/进阶方向/g, '进阶领域'],
  [/发展方向/g, '成长建议'],
];

// 输入文本中表示"赛道/方向/路径"概念的关键词
const TRACK_CONCEPT_KEYWORDS = [
  '赛道', '主赛道', '副业赛道', '高阶赛道',
  '职业方向', '发展方向', '成长路径', '职业路径',
  '生涯规划', '职业规划', '方向选择',
];

// AI转型报告固定五大维度
const AI_TRANSFORM_DIMENSIONS = [
  { name: '行业适配度', score: 75, description: '个人背景与AI行业的匹配程度' },
  { name: '能力迁移', score: 75, description: '现有能力向AI领域迁移的可行性' },
  { name: '学习能力', score: 75, description: '快速掌握AI新知识与技能的潜力' },
  { name: '行业资源', score: 75, description: '在目标行业的经验与人脉储备' },
  { name: '风险评估', score: 75, description: '转型过程中面临的挑战与应对空间' },
];

const DEFAULT_TRACK_LABELS = {
  main: '核心方向',
  side: '补充方向',
  advanced: '进阶方向',
};

function sanitizeResult(data, options = {}) {
  if (!data || typeof data !== 'object') return data;

  const personName = extractPersonName(data, options.inputText, options.filename);
  const hasTracks = hasTrackConcepts(options.inputText);
  const isAiTransform = isAiTransformReport(options.inputText);
  let result = deepClone(data);

  if (Array.isArray(result.sections)) {
    result.sections = result.sections.map(section => sanitizeSection(section, {
      personName,
      previousScore: options.previousScore,
      hasTracks,
      isAiTransform,
    }));
  }

  result = sanitizeNonInfoValue(result, personName, { insideInfoGrid: false });
  result = replaceTrackWords(result, { hasTracks });

  return result;
}

function sanitizeSection(section, options) {
  if (!section || typeof section !== 'object') return section;
  const next = { ...section };

  if (next.type === 'radar_score') {
    next.total_score = clampScore(next.total_score, options.previousScore);

    // AI转型报告：强制使用固定五大维度
    if (options.isAiTransform) {
      const aiScores = extractAiScores(next.dimensions);
      next.dimensions = AI_TRANSFORM_DIMENSIONS.map((dim, i) => ({
        ...dim,
        score: clampScore(aiScores[i] || dim.score),
      }));
      // 也更新 total_score 为五维度的加权平均
      const avgScore = Math.round(
        next.dimensions.reduce((sum, d) => sum + d.score, 0) / next.dimensions.length
      );
      next.total_score = clampScore(avgScore, options.previousScore);
    } else if (Array.isArray(next.dimensions)) {
      next.dimensions = next.dimensions.map(dimension => ({
        ...dimension,
        score: clampScore(dimension.score),
      }));
    }
  }

  if (next.type === 'track_cards') {
    // 根据是否有赛道概念选择替换词表
    const replacements = options.hasTracks
      ? TRACK_REPLACEMENTS_STANDARD
      : TRACK_REPLACEMENTS_NEUTRAL;

    // 清洗 section 标题（无赛道概念时用更中性的词）
    next.title = applyReplacements(next.title || '', replacements);

    if (Array.isArray(next.tracks)) {
      const seenLevels = new Set();
      next.tracks = next.tracks
        .filter(track => {
          const level = track && track.level ? track.level : '';
          if (seenLevels.has(level)) return false;
          seenLevels.add(level);
          return true;
        })
        .map(track => {
          const cleanTrack = { ...track };
          const defaultLabel = options.hasTracks
            ? (DEFAULT_TRACK_LABELS[cleanTrack.level] || '方向')
            : (DEFAULT_TRACK_LABELS_NEUTRAL[cleanTrack.level] || '领域');
          cleanTrack.label = applyReplacements(
            cleanTrack.label || defaultLabel,
            replacements
          );
          cleanTrack.name = applyReplacements(cleanTrack.name || '', replacements);
          cleanTrack.content = applyReplacements(cleanTrack.content || '', replacements);
          return cleanTrack;
        });
    }
  }

  return next;
}

// 无赛道概念时的默认标签
const DEFAULT_TRACK_LABELS_NEUTRAL = {
  main: '核心领域',
  side: '补充领域',
  advanced: '进阶领域',
};

// 从 AI 生成的维度中提取分数（用于 AI 转型报告保留 AI 评分）
function extractAiScores(dimensions) {
  if (!Array.isArray(dimensions)) return [];
  return dimensions.map(d => {
    const score = Number(d.score);
    return Number.isFinite(score) ? Math.round(score) : null;
  }).filter(s => s !== null);
}

// 检测输入文本是否包含赛道/方向/路径等概念
function hasTrackConcepts(inputText) {
  if (!inputText) return false;
  return TRACK_CONCEPT_KEYWORDS.some(kw => inputText.includes(kw));
}

// 检测是否为 AI 转型报告
function isAiTransformReport(inputText) {
  if (!inputText) return false;
  return inputText.includes('AI转型') || inputText.includes('AI 转型');
}

function clampScore(value, previousScore) {
  let score = Number(value);
  if (!Number.isFinite(score)) score = 70;
  score = Math.round(score);
  if (score < 70) score = 70;
  if (typeof previousScore === 'number' && Number.isFinite(previousScore)) {
    const anchor = Math.max(70, Math.round(previousScore));
    const diff = score - anchor;
    if (Math.abs(diff) > 3) {
      score = anchor + Math.sign(diff) * 3;
    }
  }
  return Math.max(70, score);
}

function extractPersonName(data, inputText, filename) {
  const fromInfo = extractNameFromInfoGrid(data);
  if (fromInfo) return fromInfo;

  const fromText = extractNameFromText(inputText);
  if (fromText) return fromText;

  return extractNameFromFilename(filename);
}

function extractNameFromInfoGrid(data) {
  const sections = Array.isArray(data.sections) ? data.sections : [];
  for (const section of sections) {
    if (!section || section.type !== 'info_grid' || !Array.isArray(section.items)) continue;
    for (const item of section.items) {
      const label = String(item.label || '').trim();
      const value = String(item.value || '').trim();
      if (NAME_LABELS.includes(label) && isLikelyChineseName(value)) {
        return value;
      }
    }
  }
  return null;
}

function extractNameFromText(inputText) {
  if (!inputText) return null;
  const patterns = [
    /姓名[：:\s]+([一-龥]{2,4})/,
    /名字[：:\s]+([一-龥]{2,4})/,
    /学员姓名[：:\s]+([一-龥]{2,4})/,
    /学员[：:\s]+([一-龥]{2,4})/,
    /被评估人[：:\s]+([一-龥]{2,4})/,
    /候选人[：:\s]+([一-龥]{2,4})/,
  ];
  for (const pattern of patterns) {
    const match = String(inputText).match(pattern);
    if (match && isLikelyChineseName(match[1])) return match[1];
  }
  return null;
}

function extractNameFromFilename(filename) {
  if (!filename) return null;
  const text = String(filename);
  const bracketMatch = text.match(/[（(]([一-龥]{2,4})[）)]/);
  if (bracketMatch && isLikelyChineseName(bracketMatch[1])) return bracketMatch[1];

  const reportMatch = text.match(/报告[-_ ]?([一-龥]{2,4})/);
  if (reportMatch && isLikelyChineseName(reportMatch[1])) return reportMatch[1];

  return null;
}

function isLikelyChineseName(value) {
  return /^[一-龥]{2,4}$/.test(String(value || '').trim());
}

function sanitizeNonInfoValue(value, personName, context) {
  if (!personName) return value;

  if (typeof value === 'string') {
    return context.insideInfoGrid ? value : value.replace(new RegExp(escapeRegExp(personName), 'g'), '你');
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeNonInfoValue(item, personName, context));
  }

  if (value && typeof value === 'object') {
    const insideInfoGrid = context.insideInfoGrid || value.type === 'info_grid';
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = sanitizeNonInfoValue(value[key], personName, { insideInfoGrid });
    }
    return result;
  }

  return value;
}

function replaceTrackWords(value, options = {}) {
  const replacements = options.hasTracks !== false
    ? TRACK_REPLACEMENTS_STANDARD
    : TRACK_REPLACEMENTS_NEUTRAL;

  if (typeof value === 'string') return applyReplacements(value, replacements);
  if (Array.isArray(value)) {
    return value.map(item => replaceTrackWords(item, options));
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = replaceTrackWords(value[key], options);
    }
    return result;
  }
  return value;
}

function applyReplacements(value, replacements) {
  if (typeof value !== 'string') return value;
  return replacements.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value
  );
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  sanitizeResult,
  extractPersonName,
  clampScore,
  replaceTrackWords,
  applyReplacements,
  hasTrackConcepts,
  isAiTransformReport,
  AI_TRANSFORM_DIMENSIONS,
};
