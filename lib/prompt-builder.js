function buildSystemPrompt(basePrompt, reportMode, scoredPrompt = '') {
  const base = String(basePrompt || '').trim();
  if (reportMode !== 'scored') return base;

  const scored = String(scoredPrompt || '').trim();
  return scored ? `${base}\n\n${scored}` : base;
}

module.exports = { buildSystemPrompt };
