const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

/**
 * Unified AI Provider — Gemini + Groq
 *
 * Strategy:
 * - Gemini is PRIMARY: round-robin across GEMINI_API_KEY_1..5 (or GEMINI_API_KEY1..5)
 * - Groq is FALLBACK: used only if Gemini exhausts all retries
 * - Within each provider, keys rotate round-robin per request
 * - Bounded retries (2–5) on transient errors (HTTP 429 / 503)
 * - Immediate fail on auth/invalid/not-found errors (400, 401, 403, 404)
 * - Model IDs configurable via GEMINI_MODEL and GROQ_MODEL env vars
 * - API keys are NEVER logged
 *
 * Tested working defaults (2026-10-10):
 *   Gemini → gemini-3.8-flash
 *   Groq   → qwen/qwen3.8-27b
 */

// ── Module-level round-robin indices ─────────────────────────────────────────
let geminiIndex = 0;
let groqIndex = 0;

// ── Validated defaults ────────────────────────────────────────────────────────
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const DEFAULT_GROQ_MODEL   = 'qwen/qwen3.8-27b';

// ── Key Loaders ───────────────────────────────────────────────────────────────

/**
 * Read all valid Gemini keys from env.
 * Supports both GEMINI_API_KEY_N and GEMINI_API_KEY_N (with underscore) formats.
 * Falls back to the single GEMINI_API_KEY if no numbered keys are found.
 * @returns {string[]}
 */
function getGeminiKeys() {
  const keys = [];
  const placeholder = 'your_gemini_api_key';

  for (let i = 1; i <= 5; i++) {
    const raw = process.env[`GEMINI_API_KEY_${i}`] || process.env[`GEMINI_API_KEY${i}`];
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed && !trimmed.toLowerCase().startsWith(placeholder)) {
        keys.push(trimmed);
      }
    }
  }

  if (keys.length === 0 && process.env.GEMINI_API_KEY) {
    const trimmed = process.env.GEMINI_API_KEY.trim();
    if (trimmed && !trimmed.toLowerCase().startsWith(placeholder)) {
      keys.push(trimmed);
    }
  }

  return keys;
}

/**
 * Read all valid Groq keys from env.
 * Supports both GROQ_API_KEY_N and GROQ_API_KEYN (no underscore) formats.
 * Falls back to the single GROQ_API_KEY if no numbered keys are found.
 * @returns {string[]}
 */
function getGroqKeys() {
  const keys = [];
  const placeholder = 'your_groq_api_key';

  for (let i = 1; i <= 5; i++) {
    const raw = process.env[`GROQ_API_KEY_${i}`] || process.env[`GROQ_API_KEY${i}`];
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed && !trimmed.toLowerCase().startsWith(placeholder)) {
        keys.push(trimmed);
      }
    }
  }

  if (keys.length === 0 && process.env.GROQ_API_KEY) {
    const trimmed = process.env.GROQ_API_KEY.trim();
    if (trimmed && !trimmed.toLowerCase().startsWith(placeholder)) {
      keys.push(trimmed);
    }
  }

  return keys;
}

// ── Error Classification ──────────────────────────────────────────────────────

/**
 * Normalises an error's HTTP status from various SDK error shapes.
 * @param {any} error
 * @returns {number|null}
 */
function getErrorStatus(error) {
  if (!error) return null;
  return (
    error.status ||
    error.statusCode ||
    (error.response && error.response.status) ||
    null
  );
}

/**
 * Returns true ONLY for transient errors worth retrying (429, 503).
 * Returns false for:
 *   - Auth errors      (401, 403)
 *   - Invalid request  (400)
 *   - Not found / model unavailable (404) — treated as permanent
 *   - Any auth/key/permission message
 * @param {any} error
 * @returns {boolean}
 */
function isTransientError(error) {
  if (!error) return false;

  const status = getErrorStatus(error);
  const message = (error.message || '').toLowerCase();

  // ── Permanent failures — do NOT retry ────────────────────────────────────
  if ([400, 401, 403, 404].includes(status)) return false;

  if (
    message.includes('api_key_invalid') ||
    message.includes('api key not valid') ||
    message.includes('invalid api key') ||
    message.includes('invalid argument') ||
    message.includes('invalid_argument') ||
    message.includes('unauthorized') ||
    message.includes('permission_denied') ||
    message.includes('permission denied') ||
    message.includes('not found') ||
    message.includes('model not found') ||
    message.includes('model_not_found') ||
    message.includes('404')
  ) {
    return false;
  }

  // ── Transient failures — safe to retry ───────────────────────────────────
  if (status === 429 || status === 503) return true;

  if (
    message.includes('429') ||
    message.includes('503') ||
    message.includes('resource_exhausted') ||
    message.includes('rate limit') ||
    message.includes('rate_limit_exceeded') ||
    message.includes('quota') ||
    message.includes('overloaded') ||
    message.includes('service unavailable') ||
    message.includes('unavailable') ||
    message.includes('temporarily unavailable')
  ) {
    return true;
  }

  return false;
}

// ── Key Cooldowns & Status Tracking ───────────────────────────────────────────
const geminiCooldowns = new Map(); // keyIdx -> expiryTimestamp
const groqCooldowns   = new Map(); // keyIdx -> expiryTimestamp
const disabledGeminiKeys = new Set();
const disabledGroqKeys   = new Set();

function getNextAvailableIndex(keys, currentIndex, cooldownMap, disabledSet) {
  const now = Date.now();
  const total = keys.length;
  if (total === 0) return -1;

  // Try to find the next key that is not disabled and not in cooldown
  for (let offset = 0; offset < total; offset++) {
    const candidateIdx = (currentIndex + offset) % total;
    if (disabledSet.has(candidateIdx)) continue;
    const cooldownExpiry = cooldownMap.get(candidateIdx);
    if (!cooldownExpiry || now >= cooldownExpiry) {
      return candidateIdx;
    }
  }

  // All keys are currently in cooldown or disabled
  return -1;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Gemini Executor ───────────────────────────────────────────────────────────

/**
 * Run a prompt against the Gemini API with round-robin key selection and cooldowns.
 * Returns { text, provider: 'gemini', model: string } on success.
 *
 * @param {string} promptText
 * @param {object} [opts]
 * @returns {Promise<{ text: string, provider: 'gemini', model: string }>}
 */
async function runWithGeminiWithMeta(promptText, opts = {}) {
  const keys = getGeminiKeys();
  if (keys.length === 0) throw new Error('NO_GEMINI_KEYS');

  const modelName = opts.modelName || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const maxAttempts = opts.maxRetries || Math.min(Math.max(keys.length, 2), 5);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const keyIdx = getNextAvailableIndex(keys, geminiIndex, geminiCooldowns, disabledGeminiKeys);
    if (keyIdx === -1) {
      throw new Error(`[Gemini] All keys are currently in cooldown or disabled (quota exhausted)`);
    }
    geminiIndex = (keyIdx + 1) % keys.length;

    try {
      const genAI = new GoogleGenerativeAI(keys[keyIdx]);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(promptText);
      const text = result.response.text();
      geminiCooldowns.delete(keyIdx);
      return { text, provider: 'gemini', model: modelName };
    } catch (err) {
      lastError = err;
      const status = getErrorStatus(err);
      const msg = (err.message || '').toLowerCase();

      if (status === 401 || status === 403 || msg.includes('api_key_invalid') || msg.includes('api key not valid')) {
        console.warn(`[aiProvider/Gemini] Key #${keyIdx + 1} invalid/unauthorized. Disabling key in pool.`);
        disabledGeminiKeys.add(keyIdx);
        if (disabledGeminiKeys.size >= keys.length) {
          throw err;
        }
        continue;
      }

      if (status === 429 || msg.includes('quota') || msg.includes('resource_exhausted')) {
        const isDailyQuota = msg.includes('daily') || msg.includes('perday') || msg.includes('free_tier');
        geminiCooldowns.set(keyIdx, Date.now() + (isDailyQuota ? 300000 : 60000));
      } else if (status === 503 || msg.includes('unavailable')) {
        geminiCooldowns.set(keyIdx, Date.now() + 15000);
      }

      if (!isTransientError(err)) {
        console.error(
          `[aiProvider/Gemini] Non-retryable error | model=${modelName} | key#=${keyIdx + 1} | status=${status} | ${err.message}`
        );
        throw err;
      }

      if (attempt >= maxAttempts) break;

      const backoffMs = Math.min(300 * Math.pow(2, attempt - 1), 2000);
      console.warn(
        `[aiProvider/Gemini] Transient error | model=${modelName} | key#=${keyIdx + 1} | status=${status} | attempt ${attempt}/${maxAttempts} | retrying next key in ${backoffMs}ms`
      );
      await sleep(backoffMs);
    }
  }

  throw new Error(`[Gemini] Exhausted ${maxAttempts} attempts | model=${modelName} | last error: ${lastError?.message || 'unknown'}`);
}

/**
 * Run a prompt against the Gemini API returning plain text string.
 * @param {string} promptText
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
async function runWithGemini(promptText, opts = {}) {
  const meta = await runWithGeminiWithMeta(promptText, opts);
  return meta.text;
}

// ── Groq Executor ─────────────────────────────────────────────────────────────

/**
 * Run a prompt against the Groq API with round-robin key selection and cooldowns.
 * Returns { text, provider: 'groq', model: string } on success.
 *
 * @param {string} promptText
 * @param {object} [opts]
 * @returns {Promise<{ text: string, provider: 'groq', model: string }>}
 */
async function runWithGroqWithMeta(promptText, opts = {}) {
  const keys = getGroqKeys();
  if (keys.length === 0) throw new Error('NO_GROQ_KEYS');

  const model = opts.groqModel || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
  const maxAttempts = opts.maxRetries || Math.min(Math.max(keys.length, 2), 5);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const keyIdx = getNextAvailableIndex(keys, groqIndex, groqCooldowns, disabledGroqKeys);
    if (keyIdx === -1) {
      throw new Error(`[Groq] All keys are currently in cooldown or disabled (quota exhausted)`);
    }
    groqIndex = (keyIdx + 1) % keys.length;

    try {
      const groq = new Groq({ apiKey: keys[keyIdx] });
      const completion = await groq.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a senior cybersecurity threat intelligence analyst. ' +
              'When asked for JSON, respond with valid minified JSON only — no markdown fences, no commentary.',
          },
          { role: 'user', content: promptText },
        ],
        temperature: 0.1,
        max_tokens: opts.maxTokens || 8192,
      });
      const text = completion.choices?.[0]?.message?.content || '';
      groqCooldowns.delete(keyIdx);
      return { text, provider: 'groq', model };
    } catch (err) {
      lastError = err;
      const status = getErrorStatus(err);
      const msg = (err.message || '').toLowerCase();

      if (status === 401 || status === 403 || msg.includes('invalid_api_key')) {
        console.warn(`[aiProvider/Groq] Key #${keyIdx + 1} invalid/unauthorized. Disabling key in pool.`);
        disabledGroqKeys.add(keyIdx);
        if (disabledGroqKeys.size >= keys.length) {
          throw err;
        }
        continue;
      }

      if (status === 429 || msg.includes('rate limit')) {
        groqCooldowns.set(keyIdx, Date.now() + 60000);
      } else if (status === 503) {
        groqCooldowns.set(keyIdx, Date.now() + 15000);
      }

      if (!isTransientError(err)) {
        console.error(
          `[aiProvider/Groq] Non-retryable error | model=${model} | key#=${keyIdx + 1} | status=${status} | ${err.message}`
        );
        throw err;
      }

      if (attempt >= maxAttempts) break;

      const backoffMs = Math.min(300 * Math.pow(2, attempt - 1), 2000);
      console.warn(
        `[aiProvider/Groq] Transient error | model=${model} | key#=${keyIdx + 1} | status=${status} | attempt ${attempt}/${maxAttempts} | retrying next key in ${backoffMs}ms`
      );
      await sleep(backoffMs);
    }
  }

  throw new Error(`[Groq] Exhausted ${maxAttempts} attempts | model=${model} | last error: ${lastError?.message || 'unknown'}`);
}

/**
 * Run a prompt against the Groq API returning plain text string.
 * @param {string} promptText
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
async function runWithGroq(promptText, opts = {}) {
  const meta = await runWithGroqWithMeta(promptText, opts);
  return meta.text;
}

// ── Unified Entry Point ───────────────────────────────────────────────────────

/**
 * Generate text using Gemini (primary) with Groq as automatic fallback.
 * Returns rich result { text: string, provider: 'gemini' | 'groq', model: string }.
 *
 * @param {string} promptText
 * @param {object} [opts]
 * @returns {Promise<{ text: string, provider: 'gemini' | 'groq', model: string }>}
 */
async function generateContentWithMeta(promptText, opts = {}) {
  const geminiKeys = getGeminiKeys();
  const groqKeys   = getGroqKeys();

  if (geminiKeys.length === 0 && groqKeys.length === 0) {
    throw new Error(
      'No AI API keys configured. Set GEMINI_API_KEY_1..5 or GROQ_API_KEY_1..5 in backend/.env'
    );
  }

  // Try Gemini first (primary)
  if (geminiKeys.length > 0) {
    try {
      return await runWithGeminiWithMeta(promptText, opts);
    } catch (geminiErr) {
      if (groqKeys.length === 0) {
        throw geminiErr;
      }
      console.warn(
        `[aiProvider] Gemini primary failed — falling back to Groq. Reason: ${geminiErr.message}`
      );
    }
  }

  // Groq fallback
  if (groqKeys.length > 0) {
    return await runWithGroqWithMeta(promptText, opts);
  }

  throw new Error('All AI providers exhausted.');
}

/**
 * Generate text using Gemini (primary) with Groq as automatic fallback.
 * Backwards-compatible string return.
 *
 * @param {string} promptText
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
async function generateContent(promptText, opts = {}) {
  const meta = await generateContentWithMeta(promptText, opts);
  return meta.text;
}

/**
 * Parse a JSON string returned by an AI model, stripping markdown fences and commentary if present.
 * @param {string} rawText
 * @returns {any}
 */
function parseJsonResponse(rawText) {
  if (typeof rawText !== 'string') return rawText;

  let cleaned = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (initialErr) {
    // If there is preamble or postscript commentary, extract outermost JSON array or object
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (e) {}
    }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch (e) {}
    }
    throw initialErr;
  }
}

/**
 * Returns the count of currently configured valid keys for each provider.
 * @returns {{ gemini: number, groq: number }}
 */
function getKeyStats() {
  return {
    gemini: getGeminiKeys().length,
    groq:   getGroqKeys().length,
  };
}

module.exports = {
  generateContent,
  generateContentWithMeta,
  parseJsonResponse,
  getKeyStats,
  getGeminiKeys,
  getGroqKeys,
  runWithGemini,
  runWithGroq,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
};
