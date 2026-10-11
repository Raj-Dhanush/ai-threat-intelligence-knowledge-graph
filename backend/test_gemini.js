require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const keys = [];
for (let i = 1; i <= 5; i++) {
  const k = process.env['GEMINI_API_KEY' + i] || process.env['GEMINI_API_KEY_' + i];
  if (k && k.trim()) keys.push(k.trim());
}

console.log('Gemini keys available:', keys.length);

const genAI = new GoogleGenerativeAI(keys[0]);

const testModels = [
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

async function testModel(name) {
  try {
    const model = genAI.getGenerativeModel({ model: name });
    const result = await model.generateContent('Say just the word: working');
    const text = result.response.text();
    console.log('OK:', name, '->', text.trim().slice(0, 60));
    return true;
  } catch (e) {
    // Log full error including status
    const status = e.status || e.statusCode || (e.response && e.response.status) || 'unknown';
    console.log('FAIL:', name, '| status:', status, '| msg:', e.message.slice(0, 120));
    return false;
  }
}

(async () => {
  for (const m of testModels) {
    const ok = await testModel(m);
    if (ok) {
      console.log('\nFirst working Gemini model:', m);
      break;
    }
  }
  console.log('Done.');
})();
