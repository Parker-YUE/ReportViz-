const NAME_LABELS = [
  '姓名',
  '名字',
  'Name',
  '被评估人',
  '学员',
  '学员姓名',
  '候选人',
];

const TRACK_REPLACEMENTS = [
  [/主赛道/g, '核心方向'],
  [/副业赛道/g, '补充方向'],
  [/高阶赛道/g, '进阶方向'],
  [/发展赛道/g, '发展方向'],
  [/赛道/g, '方向'],
];

const DEFAULT_TRACK_LABELS = {
  main: '核心方向',
  side: '补充方向',
  advanced: '进阶方向',
};

function sanitizeResult(data, options = {}) {
  if (!data || typeof data !== 'object') return data;

  const personName = extractPersonName(data, options.inputText, options.filename);
  let result = deepClone(data);

  if (Array.isArray(result.sections)) {
    result.sections = result.sections.map(section => sanitizeSection(section, {
      personName,
      previousScore: options.previousScore,
    }));
  }

  result = sanitizeNonInfoValue(result, personName, { insideInfoGrid: false });
  result = replaceTrackWords(result);

  return result;
}

function sanitizeSection(section, options) {
  if (!section || typeof section !== 'object') return section;
  const next = { ...section };

  if (next.type === 'radar_score') {
    next.total_score = clampScore(next.total_score, options.previousScore);
    if (Array.isArray(next.dimensions)) {
      next.dimensions = next.dimensions.map(dimension => ({
        ...dimension,
        score: clampScore(dimension.score),
      }));
    }
  }

  if (next.type === 'track_cards') {
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
          cleanTrack.label = replaceTrackWordsInString(
            cleanTrack.label || DEFAULT_TRACK_LABELS[cleanTrack.level] || '方向'
          );
          cleanTrack.name = replaceTrackWordsInString(cleanTrack.name);
          cleanTrack.content = replaceTrackWordsInString(cleanTrack.content);
          return cleanTrack;
        });
    }
  }

  return next;
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
    /姓名[：:\s]+([\u4e00-\u9fa5]{2,4})/,
    /名字[：:\s]+([\u4e00-\u9fa5]{2,4})/,
    /学员姓名[：:\s]+([\u4e00-\u9fa5]{2,4})/,
    /学员[：:\s]+([\u4e00-\u9fa5]{2,4})/,
    /被评估人[：:\s]+([\u4e00-\u9fa5]{2,4})/,
    /候选人[：:\s]+([\u4e00-\u9fa5]{2,4})/,
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
  const bracketMatch = text.match(/[（(]([\u4e00-\u9fa5]{2,4})[）)]/);
  if (bracketMatch && isLikelyChineseName(bracketMatch[1])) return bracketMatch[1];

  const reportMatch = text.match(/报告[-_ ]?([\u4e00-\u9fa5]{2,4})/);
  if (reportMatch && isLikelyChineseName(reportMatch[1])) return reportMatch[1];

  return null;
}

function isLikelyChineseName(value) {
  return /^[\u4e00-\u9fa5]{2,4}$/.test(String(value || '').trim());
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

function replaceTrackWords(value) {
  if (typeof value === 'string') return replaceTrackWordsInString(value);
  if (Array.isArray(value)) return value.map(replaceTrackWords);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = replaceTrackWords(value[key]);
    }
    return result;
  }
  return value;
}

function replaceTrackWordsInString(value) {
  if (typeof value !== 'string') return value;
  return TRACK_REPLACEMENTS.reduce(
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
  replaceTrackWordsInString,
};
