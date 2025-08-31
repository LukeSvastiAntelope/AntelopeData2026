const OpenAI = require('openai');
require('dotenv').config();

async function main() {
  const prompt = process.argv.slice(2).join(' ').trim() || 'Create a short test survey.';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY missing');
    process.exit(1);
  }
  const model = process.env.TEST_OPENAI_MODEL || 'gpt-5';
  const client = new OpenAI({ apiKey, timeout: 120000, maxRetries: 0 });
  const system = 'You are an expert survey designer. Return compact JSON without markdown fences.';

  console.log('[script] model', model);

  // 1) Responses API
  try {
    const t0 = Date.now();
    const resp = await client.responses.create({
      model,
      input: prompt,
      instructions: system,
      max_output_tokens: 8000,
      reasoning: { effort: 'medium' },
    });
    console.log('[script] responses.ok', { ms: Date.now() - t0 });
    console.log('[script] typeof output_text', typeof resp.output_text);
    console.log('[script] output_text len', (resp.output_text || '').length);
    console.log('[script] raw keys', Object.keys(resp));
    console.log('[script] raw.output sample', JSON.stringify(resp.output?.slice(0,2), null, 2));
    if (resp.output_text && resp.output_text.trim()) {
      console.log('[script] RESPONSES output_text:\n', resp.output_text.slice(0, 1000));
    }
  } catch (e) {
    console.log('[script] responses.err', e.status, e.code, e.message);
  }

  // 2) Chat Completions
  try {
    const usesCompletionTokens = true; // for gpt-5
    const request = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      reasoning: { effort: 'medium' }
    };
    if (usesCompletionTokens) request.max_completion_tokens = 8000; else request.max_tokens = 8000;
    const t1 = Date.now();
    const c = await client.chat.completions.create(request);
    console.log('[script] chat.ok', { ms: Date.now() - t1, usage: c.usage });
    const msg = c.choices?.[0]?.message || {};
    console.log('[script] typeof message.content', typeof msg.content);
    if (Array.isArray(msg.content)) {
      console.log('[script] message.content array len', msg.content.length);
      console.log('[script] message.content[0] sample', JSON.stringify(msg.content[0], null, 2));
      const joined = msg.content.map(p => (typeof p === 'string' ? p : (p?.text || ''))).join('');
      console.log('[script] joined len', joined.length);
      console.log('[script] joined sample', joined.slice(0, 800));
    } else {
      console.log('[script] content len', (msg.content || '').length);
      console.log('[script] content sample', (msg.content || '').slice(0, 800));
    }
    if (msg.reasoning) {
      console.log('[script] has reasoning array len', Array.isArray(msg.reasoning) ? msg.reasoning.length : 'n/a');
      try {
        const rJoined = (Array.isArray(msg.reasoning) ? msg.reasoning : []).map(r => {
          if (typeof r === 'string') return r;
          if (Array.isArray(r?.content)) return r.content.map(c => c?.text || '').join('');
          return r?.text || '';
        }).join('');
        console.log('[script] reasoning joined len', rJoined.length);
        console.log('[script] reasoning sample', rJoined.slice(0, 800));
      } catch {}
    }
  } catch (e) {
    console.log('[script] chat.err', e.status, e.code, e.message);
  }
}

main();


