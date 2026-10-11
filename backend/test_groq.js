require('dotenv').config();
const Groq = require('groq-sdk');

const keys = [];
for (let i = 1; i <= 5; i++) {
  const k = process.env['GROQ_API_KEY' + i] || process.env['GROQ_API_KEY_' + i];
  if (k && k.trim()) keys.push(k.trim());
}

console.log('Groq keys available:', keys.length);

const groq = new Groq({ apiKey: keys[0] });

const candidates = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'allam-2-7b',
];

async function testModel(model) {
  try {
    const r = await groq.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant. Always reply with valid JSON only.',
        },
        {
          role: 'user',
          content: 'Return a JSON object with key "status" set to "working".',
        },
      ],
      max_tokens: 100,
      temperature: 0,
    });
    const text = r.choices[0]?.message?.content || '';
    console.log('OK:', model, '->', text.trim().slice(0, 80));
    return true;
  } catch (e) {
    console.log('FAIL:', model, '->', e.message.slice(0, 100));
    return false;
  }
}

(async () => {
  for (const m of candidates) {
    await testModel(m);
  }
  console.log('Done.');
})();
