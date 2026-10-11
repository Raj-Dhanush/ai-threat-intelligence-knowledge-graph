/**
 * Integration test: validates all AI provider features via live backend (http://localhost:5000)
 * Tests: Gemini directly, Groq directly, entity extraction, relationship generation,
 *        AI summary, and chatbot — then reports results.
 *
 * Run: node test_integration.js
 * Requires: backend running on port 5000, .env populated, MongoDB accessible
 */
require('dotenv').config();

const { generateContent, runWithGemini, runWithGroq, parseJsonResponse, getKeyStats, DEFAULT_GEMINI_MODEL, DEFAULT_GROQ_MODEL } = require('./src/utils/aiProvider');

let passed = 0;
let failed = 0;

function ok(label, result) {
  console.log(`  ✅ PASS: ${label}`);
  if (result !== undefined) console.log(`         -> ${String(result).slice(0, 100)}`);
  passed++;
}

function fail(label, err) {
  console.log(`  ❌ FAIL: ${label}`);
  console.log(`         -> ${err}`);
  failed++;
}

async function runTests() {
  console.log('\n══════════════════════════════════════════════');
  console.log(' AI Provider Integration Test');
  console.log('══════════════════════════════════════════════');

  // ── 1. Key stats ────────────────────────────────────────────────────────────
  console.log('\n[1] Key detection');
  const stats = getKeyStats();
  console.log(`  Gemini keys: ${stats.gemini}  |  Groq keys: ${stats.groq}`);
  if (stats.gemini > 0) ok('Gemini keys detected', `${stats.gemini} key(s)`);
  else fail('Gemini keys', 'No Gemini keys found');
  if (stats.groq > 0) ok('Groq keys detected', `${stats.groq} key(s)`);
  else fail('Groq keys', 'No Groq keys found');

  // ── 2. Gemini direct test ────────────────────────────────────────────────────
  console.log(`\n[2] Gemini direct — model: ${process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL}`);
  try {
    const reply = await runWithGemini('Reply with just the JSON: {"ok":true}');
    const parsed = parseJsonResponse(reply);
    if (parsed.ok === true) ok('Gemini generateContent + parseJson', reply.trim());
    else fail('Gemini JSON parse', `Expected {ok:true}, got: ${reply.slice(0,80)}`);
  } catch (e) {
    fail('Gemini direct call', e.message);
  }

  // ── 3. Groq direct test ──────────────────────────────────────────────────────
  console.log(`\n[3] Groq direct — model: ${process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL}`);
  try {
    const reply = await runWithGroq('Reply with just the JSON: {"ok":true}');
    const parsed = parseJsonResponse(reply);
    if (parsed.ok === true) ok('Groq generateContent + parseJson', reply.trim());
    else fail('Groq JSON parse', `Expected {ok:true}, got: ${reply.slice(0,80)}`);
  } catch (e) {
    fail('Groq direct call', e.message);
  }

  // ── 4. Unified generateContent (Gemini primary) ──────────────────────────────
  console.log('\n[4] Unified generateContent (Gemini primary path)');
  try {
    const reply = await generateContent('Reply with only: {"provider":"gemini","status":"ok"}');
    const parsed = parseJsonResponse(reply);
    ok('Unified generateContent', JSON.stringify(parsed));
  } catch (e) {
    fail('Unified generateContent', e.message);
  }

  // ── 5. Entity extraction prompt ──────────────────────────────────────────────
  console.log('\n[5] Entity extraction prompt (structured JSON array)');
  const sampleReport = `APT29 (Cozy Bear), a Russian state-sponsored threat actor, has been observed 
  exploiting CVE-2021-44228 (Log4Shell) to deploy Cobalt Strike beacons against US and UK government 
  networks. The campaign also uses Mimikatz for credential harvesting.`;

  try {
    const prompt = `Extract cybersecurity entities from this text. 
Types: ThreatActor, Malware, CVE, Country.
Return ONLY a JSON array: [{"name":"...","type":"...","confidence":"high|medium|low"}]

Text: ${sampleReport}`;
    const reply = await generateContent(prompt);
    const entities = parseJsonResponse(reply);
    if (Array.isArray(entities) && entities.length > 0) {
      ok('Entity extraction returns array', `${entities.length} entities: ${entities.map(e=>e.name).join(', ')}`);
    } else {
      fail('Entity extraction', `Expected non-empty array, got: ${JSON.stringify(entities)}`);
    }
  } catch (e) {
    fail('Entity extraction prompt', e.message);
  }

  // ── 6. Relationship generation prompt ────────────────────────────────────────
  console.log('\n[6] Relationship generation prompt (structured JSON array)');
  const sampleEntities = [
    { id: 'e1', name: 'APT29', type: 'ThreatActor' },
    { id: 'e2', name: 'CVE-2021-44228', type: 'CVE' },
    { id: 'e3', name: 'Cobalt Strike', type: 'Malware' },
    { id: 'e4', name: 'USA', type: 'Country' },
  ];

  try {
    const prompt = `Generate relationships between these cybersecurity entities based on this text.
Allowed relations: exploits, uses, targets, delivers, related_to.
Return ONLY a JSON array: [{"sourceId":"...","relation":"...","targetId":"..."}]
Use ONLY the IDs from the entity list.

Entities: ${JSON.stringify(sampleEntities)}

Text: ${sampleReport}`;
    const reply = await generateContent(prompt);
    const rels = parseJsonResponse(reply);
    if (Array.isArray(rels) && rels.length > 0) {
      ok('Relationship generation returns array', `${rels.length} relationships: ${rels.map(r=>`${r.sourceId}-[${r.relation}]->${r.targetId}`).join(', ')}`);
    } else {
      fail('Relationship generation', `Expected non-empty array, got: ${JSON.stringify(rels)}`);
    }
  } catch (e) {
    fail('Relationship generation prompt', e.message);
  }

  // ── 7. AI Summary prompt ─────────────────────────────────────────────────────
  console.log('\n[7] AI Summary prompt');
  try {
    const prompt = `Analyze this threat report. Return ONLY JSON:
{"riskLevel":"LOW|MEDIUM|HIGH","threatActors":[],"malware":[],"vulnerabilities":[],"countries":[],"summary":"..."}

Report: ${sampleReport}`;
    const reply = await generateContent(prompt);
    const summary = parseJsonResponse(reply);
    if (summary.riskLevel && summary.summary) {
      ok('AI Summary structure valid', `riskLevel=${summary.riskLevel}, actors=${summary.threatActors?.join(',')}`);
    } else {
      fail('AI Summary', `Missing required fields: ${JSON.stringify(summary)}`);
    }
  } catch (e) {
    fail('AI Summary prompt', e.message);
  }

  // ── 8. Chatbot prompt ────────────────────────────────────────────────────────
  console.log('\n[8] Chatbot conversational response');
  try {
    const reply = await generateContent(
      `You are a threat intelligence analyst. Based on this report:
"${sampleReport}"
Answer: What threat actor is mentioned and what CVE do they exploit?`
    );
    if (reply && reply.length > 20) {
      ok('Chatbot response', reply.trim().slice(0, 100) + '...');
    } else {
      fail('Chatbot response', `Response too short: "${reply}"`);
    }
  } catch (e) {
    fail('Chatbot prompt', e.message);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════\n');
}

runTests().catch(console.error);
