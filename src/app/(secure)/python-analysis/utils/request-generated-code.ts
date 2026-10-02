/**
 * Client helpers for /api/python-analysis/generate-code(+stream).
 * Supports regenerate-on-truncation for executeCode self-repair (H5 / F4).
 */

export type GenerateCodePayload = {
  query: string;
  dataSchema: {
    columns: string[];
    types: Record<string, string>;
    sampleData: any[];
    rowCount?: number;
    codebookMappings?: any;
  };
  analysisHistory?: Array<{
    code: string;
    output: string;
    timestamp: string;
    question?: string;
  }>;
  analyticsContextPrompt?: string;
  analysisType?: string;
};

export type GeneratedCodeResult = {
  code: string;
  explanation: string;
  suggestedFollowups: string[];
  analysisType: string;
  model: string;
};

function extractPythonFromStreamText(raw: string): string {
  const cleaned = raw.trim();
  const fence = cleaned.match(/```(?:python)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  return cleaned;
}

/** Non-stream generate-code with one automatic retry on truncated. */
export async function requestGeneratedCode(
  payload: GenerateCodePayload,
  opts?: { allowRetry?: boolean }
): Promise<GeneratedCodeResult> {
  const allowRetry = opts?.allowRetry !== false;
  const response = await fetch('/api/python-analysis/generate-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      analysisType: payload.analysisType || 'auto',
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (data?.truncated) {
    if (!allowRetry) {
      throw new Error(
        data.error || 'Generated code was truncated; please regenerate'
      );
    }
    console.warn(
      '[requestGeneratedCode] truncated; regenerating once via generate-code'
    );
    return requestGeneratedCode(payload, { allowRetry: false });
  }
  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate code');
  }
  if (!data?.code || typeof data.code !== 'string') {
    throw new Error('Generated code was empty');
  }
  return {
    code: data.code,
    explanation: String(data.explanation || ''),
    suggestedFollowups: Array.isArray(data.suggestedFollowups)
      ? data.suggestedFollowups
      : [],
    analysisType: String(data.analysisType || 'auto'),
    model: String(data.model || 'workhorse'),
  };
}

/**
 * Stream generate-code-stream. On `{truncated:true}`, re-POST once via
 * non-stream generate-code (expandOnTruncation already applied there).
 */
export async function requestGeneratedCodeStream(
  payload: GenerateCodePayload,
  opts?: {
    onChunk?: (text: string) => void;
    allowRetry?: boolean;
  }
): Promise<GeneratedCodeResult> {
  const allowRetry = opts?.allowRetry !== false;
  const response = await fetch('/api/python-analysis/generate-code-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      analysisType: payload.analysisType || 'auto',
      analysisHistory: payload.analysisHistory || [],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to stream generated code');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No stream body from generate-code-stream');
  }

  const decoder = new TextDecoder();
  let accumulated = '';
  let truncated = false;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() || '';
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed?.truncated) {
          truncated = true;
          continue;
        }
        const piece =
          typeof parsed?.content === 'string'
            ? parsed.content
            : typeof parsed?.text === 'string'
              ? parsed.text
              : typeof parsed === 'string'
                ? parsed
                : '';
        if (piece) {
          accumulated += piece;
          opts?.onChunk?.(piece);
        }
      } catch {
        // Some stream adapters send raw text after data:
        if (data && data !== '[DONE]') {
          accumulated += data;
          opts?.onChunk?.(data);
        }
      }
    }
  }

  if (truncated) {
    if (!allowRetry) {
      throw new Error('Generated code was truncated; please regenerate');
    }
    console.warn(
      '[requestGeneratedCodeStream] truncated; regenerating once via generate-code'
    );
    return requestGeneratedCode(payload, { allowRetry: false });
  }

  const code = extractPythonFromStreamText(accumulated);
  if (!code) {
    // Empty stream — fall back to non-stream once
    if (allowRetry) {
      return requestGeneratedCode(payload, { allowRetry: true });
    }
    throw new Error('Generated code was empty');
  }

  return {
    code,
    explanation: 'Streamed analysis code',
    suggestedFollowups: [],
    analysisType: response.headers.get('X-Analysis-Type') || 'auto',
    model: response.headers.get('X-Model-Used') || 'workhorse',
  };
}

/** Build a regenerateCode callback bound to the same payload (re-POST). */
export function makeRegenerateCode(
  payload: GenerateCodePayload
): () => Promise<string> {
  return async () => {
    const result = await requestGeneratedCode(payload, { allowRetry: true });
    return result.code;
  };
}
