const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Shared Gemini API Key Manager
 *
 * Responsibilities:
 * 1. Reads GEMINI_API_KEY_1 through GEMINI_API_KEY_5 from backend/.env.
 *    (Also falls back to GEMINI_API_KEY1..5 and legacy GEMINI_API_KEY for resilience).
 * 2. Ignores missing, empty, or placeholder keys and validates at least one key is configured.
 * 3. Rotates configured keys using a round-robin strategy across requests.
 * 4. Boundedly retries operations on transient quota / overload errors (HTTP 429 / 503)
 *    with exponential backoff and rotation to the next key.
 * 5. Fails immediately on invalid requests or authentication errors (HTTP 400, 401, 403, 404).
 * 6. Never logs or sends raw API keys to the frontend.
 */

let currentKeyIndex = 0;

/**
 * Scans environment variables and returns all valid, non-empty Gemini API keys.
 * Filters out placeholder values (e.g. 'your_gemini_api_key_...').
 *
 * @returns {string[]} Array of valid API key strings
 */
function getConfiguredKeys() {
  const keys = [];
  const placeholderPrefix = 'your_gemini_api_key';

  for (let i = 1; i <= 5; i++) {
    const rawKey =
      process.env[`GEMINI_API_KEY_${i}`] ||
      process.env[`GEMINI_API_KEY${i}`];

    if (typeof rawKey === 'string') {
      const trimmed = rawKey.trim();
      if (trimmed && !trimmed.toLowerCase().startsWith(placeholderPrefix)) {
        keys.push(trimmed);
      }
    }
  }

  // Fallback to single legacy GEMINI_API_KEY if no numbered keys found
  if (keys.length === 0 && process.env.GEMINI_API_KEY) {
    const trimmed = process.env.GEMINI_API_KEY.trim();
    if (trimmed && !trimmed.toLowerCase().startsWith(placeholderPrefix)) {
      keys.push(trimmed);
    }
  }

  return keys;
}

/**
 * Validates that at least one Gemini API key is configured.
 *
 * @returns {string[]} Array of configured keys
 * @throws {Error} When no keys are configured
 */
function validateKeysConfigured() {
  const keys = getConfiguredKeys();
  if (keys.length === 0) {
    throw new Error(
      'No valid Gemini API keys configured. Please configure GEMINI_API_KEY_1 through GEMINI_API_KEY_5 in backend/.env'
    );
  }
  return keys;
}

/**
 * Returns the count of currently configured valid keys.
 * @returns {number}
 */
function getKeyCount() {
  return getConfiguredKeys().length;
}

/**
 * Selects the next key using round-robin rotation.
 * Never exposes the key in logs or metadata.
 *
 * @returns {{ key: string, index: number, keyNumber: number, totalKeys: number }}
 */
function getNextKey() {
  const keys = validateKeysConfigured();
  const index = currentKeyIndex % keys.length;
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;

  return {
    key: keys[index],
    index,
    keyNumber: index + 1,
    totalKeys: keys.length,
  };
}

/**
 * Checks if an error from Gemini is temporary/transient (429 rate limit or 503 unavailable)
 * and can be retried with another key.
 *
 * Explicitly rejects invalid requests (400) or auth errors (401, 403) from retrying.
 *
 * @param {any} error
 * @returns {boolean}
 */
function isTransientError(error) {
  if (!error) return false;

  const status =
    error.status ||
    error.statusCode ||
    (error.response && error.response.status);
  const message = (error.message || '').toLowerCase();

  // 1. Explicitly do not retry invalid requests, auth failures, or not found
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return false;
  }

  if (
    message.includes('api_key_invalid') ||
    message.includes('api key not valid') ||
    message.includes('invalid api key') ||
    message.includes('invalid argument') ||
    message.includes('invalid_argument') ||
    message.includes('unauthorized') ||
    message.includes('permission_denied') ||
    message.includes('permission denied') ||
    message.includes('not found')
  ) {
    return false;
  }

  // 2. HTTP 429 (Too Many Requests / Quota) and 503 (Service Unavailable / Overloaded)
  if (status === 429 || status === 503) {
    return true;
  }

  // 3. String matches for transient Gemini status descriptions
  if (
    message.includes('429') ||
    message.includes('503') ||
    message.includes('resource_exhausted') ||
    message.includes('rate limit') ||
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

/**
 * Pauses execution for a specified duration in milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a Gemini model operation with round-robin key selection and bounded retries on 429/503.
 *
 * @param {Function} operation - async ({ genAI, model, keyInfo }) => Promise<any>
 * @param {Object} [options]
 * @param {string} [options.modelName='gemini-3.6-flash']
 * @param {Object} [options.generationConfig]
 * @param {number} [options.maxRetries]
 * @returns {Promise<any>}
 */
async function executeWithGemini(operation, options = {}) {
  const keys = validateKeysConfigured();
  const modelName = options.modelName || 'gemini-3.6-flash';

  // Bounded retries: try each configured key at most once (bounded between 2 and 5 attempts)
  const maxAttempts = options.maxRetries || Math.min(Math.max(keys.length, 2), 5);

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const keyInfo = getNextKey();
    const genAI = new GoogleGenerativeAI(keyInfo.key);
    const model = genAI.getGenerativeModel({
      model: modelName,
      ...(options.generationConfig ? { generationConfig: options.generationConfig } : {}),
    });

    try {
      const result = await operation({ genAI, model, keyInfo });
      return result;
    } catch (error) {
      lastError = error;

      // Only retry if it's a transient 429 / 503 error
      const canRetry = isTransientError(error);

      if (!canRetry) {
        // Non-transient error (e.g. 400 Bad Request or 401 Invalid Key) -> abort immediately
        console.error(
          `[GeminiKeyManager] Non-retryable error on Key #${keyInfo.keyNumber}: ${error.message || error}`
        );
        throw error;
      }

      if (attempt >= maxAttempts) {
        console.warn(
          `[GeminiKeyManager] Key #${keyInfo.keyNumber} encountered transient error (${error.status || '429/503'}). All ${maxAttempts} attempts exhausted.`
        );
        break;
      }

      // Small bounded backoff: 500ms, 1000ms, 2000ms, max 3000ms
      const backoffMs = Math.min(500 * Math.pow(2, attempt - 1), 3000);
      console.warn(
        `[GeminiKeyManager] Key #${keyInfo.keyNumber} encountered transient error (${error.status || '429/503'}). Retrying with next key (attempt ${attempt + 1}/${maxAttempts}) after ${backoffMs}ms...`
      );

      await sleep(backoffMs);
    }
  }

  const cleanErrorMessage = lastError ? (lastError.message || String(lastError)) : 'Unknown error';
  throw new Error(
    `Gemini API request failed after ${maxAttempts} attempts across configured keys: ${cleanErrorMessage}`
  );
}

/**
 * Convenience helper to generate content with round-robin key selection and retry.
 *
 * @param {string|Array|Object} promptOrContents
 * @param {Object} [options]
 * @param {string} [options.modelName='gemini-3.6-flash']
 * @param {Object} [options.generationConfig]
 * @param {number} [options.maxRetries]
 * @returns {Promise<any>}
 */
async function generateContentWithRetry(promptOrContents, options = {}) {
  return await executeWithGemini(async ({ model }) => {
    return await model.generateContent(promptOrContents);
  }, options);
}

module.exports = {
  getConfiguredKeys,
  validateKeysConfigured,
  getKeyCount,
  getNextKey,
  isTransientError,
  executeWithGemini,
  generateContentWithRetry,
};
