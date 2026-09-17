function createAIError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function stripMarkdownFence(value) {
  const text = String(value || '').trim();
  const match = text.match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  return match ? match[1].trim() : text;
}

function parseModelResponse(response) {
  const choice = response?.choices?.[0];
  if (!choice) {
    throw createAIError('AI_EMPTY_RESPONSE', 'AI 未返回可用内容');
  }
  if (choice.finish_reason === 'length') {
    throw createAIError('AI_OUTPUT_TRUNCATED', 'AI 输出被截断');
  }

  const content = stripMarkdownFence(choice.message?.content);
  if (!content) {
    throw createAIError('AI_EMPTY_RESPONSE', 'AI 未返回可用内容');
  }

  try {
    return JSON.parse(content);
  } catch (cause) {
    throw createAIError('AI_INVALID_JSON', 'AI 返回的 JSON 格式无效', cause);
  }
}

function findErrorValue(error, key) {
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current[key] !== undefined && current[key] !== null) return current[key];
    current = current.cause;
  }
  return null;
}

function isTransientAIError(error) {
  const status = Number(findErrorValue(error, 'status'));
  if ([408, 409, 429].includes(status) || status >= 500) return true;

  const code = String(findErrorValue(error, 'code') || '').toUpperCase();
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return true;
  }

  const name = String(findErrorValue(error, 'name') || '');
  if (name === 'APIConnectionError' || name === 'APIConnectionTimeoutError') return true;

  const message = String(findErrorValue(error, 'message') || '').toLowerCase();
  return message.includes('invalid response body')
    || message.includes('connection error')
    || message.includes('connection reset')
    || message.includes('fetch failed')
    || message.includes('timed out');
}

async function defaultWait(milliseconds) {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function withTransientRetry(operation, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || 1);
  const wait = options.wait || defaultWait;
  const onRetry = options.onRetry || (() => {});

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientAIError(error)) throw error;
      onRetry(error, attempt);
      await wait(500 * (2 ** (attempt - 1)));
    }
  }

  throw createAIError('AI_RETRY_EXHAUSTED', 'AI 请求重试次数已耗尽');
}

function getSafeErrorDetails(error) {
  return {
    name: String(findErrorValue(error, 'name') || 'Error'),
    code: String(findErrorValue(error, 'code') || ''),
    status: Number(findErrorValue(error, 'status')) || null,
    message: redactSensitiveText(
      String(findErrorValue(error, 'message') || 'Unknown error')
    ).slice(0, 300),
  };
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/([?&](?:token|apikey|api_key|key|signature)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED]');
}

module.exports = {
  getSafeErrorDetails,
  isTransientAIError,
  parseModelResponse,
  stripMarkdownFence,
  withTransientRetry,
};
