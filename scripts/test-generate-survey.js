const OpenAI = require('openai');
require('dotenv').config();

async function main() {
  const prompt = process.argv.slice(2).join(' ') || 'Create a short test survey.';
  const model = process.env.TEST_OPENAI_MODEL || 'gpt-4o-mini';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY missing');
    process.exit(1);
  }
  const client = new OpenAI({ apiKey, timeout: 120000, maxRetries: 0 });
  const system = 'You are an expert survey designer. Return compact JSON without markdown fences.';
  const usesCompletionTokens = /(^o1|^o3|^gpt-5|gpt-4o)/.test(model);
  const request = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ]
  };
  if (usesCompletionTokens) {
    request.max_completion_tokens = 800;
  } else {
    request.temperature = 0.7;
    request.max_tokens = 800;
  }
  console.log('[test] request', { model, usesCompletionTokens, hasTemp: request.temperature !== undefined });
  const t0 = Date.now();
  try {
    const resp = await client.chat.completions.create(request);
    const ms = Date.now() - t0;
    console.log('[test] ok', { ms, usage: resp.usage });
    console.log(resp.choices[0]?.message?.content || '');
  } catch (e) {
    const ms = Date.now() - t0;
    console.error('[test] error', { ms, status: e.status, code: e.code, message: e.message });
    process.exit(2);
  }
}

main();










