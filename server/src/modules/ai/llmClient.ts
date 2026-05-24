interface AIModelConfig {
  id: string;
  provider: string;
  model_name: string;
  api_key: string;
  base_url?: string | null;
  temperature: number;
  max_tokens: number;
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ContentPart {
  type: 'text' | 'image';
  text?: string;
  image?: { media_type: string; data: string }; // base64 without data URI prefix
}

// ---------------------------------------------------------------------------
// Resilient fetch wrapper — timeout + retry with exponential backoff
// ---------------------------------------------------------------------------

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

async function fetchWithRetry(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number },
): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? 25_000;
  const maxRetries = init.retries ?? 2;
  // Strip custom fields before passing to fetch
  const { timeoutMs: _t, retries: _r, ...fetchInit } = init;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...fetchInit, signal: controller.signal });
      clearTimeout(timer);

      // Success — return immediately
      if (response.ok) return response;

      // Server error or rate limit — retryable
      if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[LLM] ${response.status} on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${backoff}ms`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }

      // Non-retryable error — throw immediately with full context
      const errorText = await response.text();
      throw new Error(`LLM API error ${response.status}: ${errorText.slice(0, 500)}`);
    } catch (err) {
      clearTimeout(timer);

      // AbortError means timeout
      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = new Error(`LLM request timed out after ${timeoutMs}ms`);
      } else if (err instanceof TypeError && err.message.includes('fetch')) {
        // Network error (DNS, TCP, TLS) — retryable
        lastError = err;
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      // Only retry on timeout, network error, or if the error was from a retryable HTTP status
      const isRetryable = lastError.message.includes('timed out') || lastError.message.includes('fetch');
      if (isRetryable && attempt < maxRetries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[LLM] ${lastError.message} on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${backoff}ms`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error('LLM request failed after all retries');
}

/**
 * Returns the base URL that already includes the version path.
 * Append /chat/completions to get the full endpoint.
 */
function defaultBaseUrl(provider: string): string {
  switch (provider) {
    case 'openai': return 'https://api.openai.com/v1';
    case 'anthropic': return 'https://api.anthropic.com/v1';
    case 'gemini': return 'https://generativelanguage.googleapis.com/v1beta';
    case 'deepseek': return 'https://api.deepseek.com';          // no /v1
    case 'zhipu': return 'https://open.bigmodel.cn/api/paas/v4';
    case 'minimax': return 'https://api.minimax.chat/v1';
    case 'moonshot': return 'https://api.moonshot.cn/v1';
    case 'qwen': return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    default: return 'https://api.openai.com/v1';
  }
}

/** Providers that use OpenAI-compatible /v1/chat/completions API with Bearer token */
function isOpenAICompatible(provider: string): boolean {
  return provider !== 'anthropic' && provider !== 'gemini';
}

export async function callLLM(
  config: AIModelConfig,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const provider = config.provider || 'openai';

  if (provider === 'gemini') {
    return callGemini(config, systemPrompt, userMessage);
  }

  if (provider === 'anthropic') {
    return callAnthropic(config, systemPrompt, userMessage);
  }

  // OpenAI-compatible providers
  const baseUrl = config.base_url || defaultBaseUrl(provider);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.api_key}`,
  };

  const body = {
    model: config.model_name,
    messages: [
      {role: 'system', content: systemPrompt},
      {role: 'user', content: userMessage},
    ] as LLMMessage[],
    temperature: config.temperature ?? 0.7,
    max_tokens: config.max_tokens ?? 4096,
  };

  const response = await fetchWithRetry(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const result = await response.json() as Record<string, any>;

  // OpenAI-compatible format (most providers use this)
  const content = result?.choices?.[0]?.message?.content
    ?? result?.output?.choices?.[0]?.message?.content     // some GLM versions
    ?? result?.result?.choices?.[0]?.message?.content     // alternative wrapper
    ?? (typeof result?.output?.text === 'string' ? result.output.text : null)  // GLM chatglm format
    ?? (typeof result?.result === 'string' ? result.result : null)  // simple string result
    ?? (typeof result?.content === 'string' ? result.content : null); // direct content

  if (content) {
    return content;
  }

  // Log the actual response for debugging
  console.error('[LLM] Unrecognized response format:', JSON.stringify(result).slice(0, 500));
  throw new Error('Unexpected LLM response format');
}

async function callAnthropic(
  config: AIModelConfig,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const baseUrl = config.base_url || defaultBaseUrl('anthropic');

  const body = {
    model: config.model_name,
    max_tokens: config.max_tokens ?? 4096,
    system: systemPrompt,
    messages: [
      {role: 'user', content: userMessage},
    ],
  };

  const response = await fetchWithRetry(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.api_key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const result = await response.json() as {
    content?: Array<{type: string; text?: string}>;
  };

  const textBlock = result?.content?.find(b => b.type === 'text');
  if (textBlock?.text) {
    return textBlock.text;
  }

  console.error('[LLM] Unrecognized Anthropic response format:', JSON.stringify(result).slice(0, 500));
  throw new Error('Unexpected Anthropic response format');
}

async function callGemini(
  config: AIModelConfig,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const baseUrl = config.base_url || defaultBaseUrl('gemini');
  const url = `${baseUrl}/models/${config.model_name}:generateContent?key=${encodeURIComponent(config.api_key)}`;

  const body = {
    system_instruction: {
      parts: [{text: systemPrompt}],
    },
    contents: [
      {role: 'user', parts: [{text: userMessage}]},
    ],
    generationConfig: {
      temperature: config.temperature ?? 0.7,
      maxOutputTokens: config.max_tokens ?? 4096,
    },
  };

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const result = await response.json() as {
    candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>;
  };

  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) return text;

  throw new Error('Unexpected Gemini response format');
}

// ---------------------------------------------------------------------------
// Vision LLM — multimodal (text + image) support for resume image extraction
// ---------------------------------------------------------------------------

/**
 * Calls a vision-capable LLM with text + image content.
 * Resolves the model config from the database (same pattern as AI proxy routes).
 */
export async function callVisionLLM(
  config: AIModelConfig,
  systemPrompt: string,
  parts: ContentPart[],
): Promise<string> {
  const provider = config.provider || 'openai';

  if (provider === 'gemini') {
    return callGeminiVision(config, systemPrompt, parts);
  }
  if (provider === 'anthropic') {
    return callAnthropicVision(config, systemPrompt, parts);
  }
  return callOpenAIVision(config, systemPrompt, parts);
}

async function callOpenAIVision(
  config: AIModelConfig,
  systemPrompt: string,
  parts: ContentPart[],
): Promise<string> {
  const baseUrl = config.base_url || defaultBaseUrl(config.provider || 'openai');

  // Build content array from parts
  const content: Array<Record<string, unknown>> = parts.map(p => {
    if (p.type === 'text') {
      return {type: 'text', text: p.text ?? ''};
    }
    // image
    const mime = p.image?.media_type ?? 'image/jpeg';
    return {
      type: 'image_url',
      image_url: {
        url: `data:${mime};base64,${p.image?.data ?? ''}`,
        detail: 'high',
      },
    };
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.api_key}`,
  };

  const body = {
    model: config.model_name,
    messages: [
      {role: 'system', content: systemPrompt},
      {role: 'user', content},
    ],
    temperature: config.temperature ?? 0.1,
    max_tokens: config.max_tokens ?? 4096,
  };

  const response = await fetchWithRetry(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision LLM API error ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const result = await response.json() as Record<string, any>;
  const text = result?.choices?.[0]?.message?.content
    ?? result?.output?.choices?.[0]?.message?.content
    ?? result?.result?.choices?.[0]?.message?.content;

  if (text) return text;
  console.error('[VisionLLM] Unrecognized response format:', JSON.stringify(result).slice(0, 500));
  throw new Error('Unexpected vision LLM response format');
}

async function callAnthropicVision(
  config: AIModelConfig,
  systemPrompt: string,
  parts: ContentPart[],
): Promise<string> {
  const baseUrl = config.base_url || defaultBaseUrl('anthropic');

  // Build content array from parts
  const content: Array<Record<string, unknown>> = parts.map(p => {
    if (p.type === 'text') {
      return {type: 'text', text: p.text ?? ''};
    }
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: p.image?.media_type ?? 'image/jpeg',
        data: p.image?.data ?? '',
      },
    };
  });

  const body = {
    model: config.model_name,
    max_tokens: config.max_tokens ?? 4096,
    system: systemPrompt,
    messages: [
      {role: 'user', content},
    ],
  };

  const response = await fetchWithRetry(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.api_key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic Vision API error ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const result = await response.json() as {
    content?: Array<{type: string; text?: string}>;
  };

  const textBlock = result?.content?.find(b => b.type === 'text');
  if (textBlock?.text) return textBlock.text;

  console.error('[VisionLLM] Unrecognized Anthropic response:', JSON.stringify(result).slice(0, 500));
  throw new Error('Unexpected Anthropic vision response format');
}

async function callGeminiVision(
  config: AIModelConfig,
  systemPrompt: string,
  parts: ContentPart[],
): Promise<string> {
  const baseUrl = config.base_url || defaultBaseUrl('gemini');
  const url = `${baseUrl}/models/${config.model_name}:generateContent?key=${encodeURIComponent(config.api_key)}`;

  // Build parts array from ContentPart[]
  const geminiParts: Array<Record<string, unknown>> = parts.map(p => {
    if (p.type === 'text') {
      return {text: p.text ?? ''};
    }
    return {
      inline_data: {
        mime_type: p.image?.media_type ?? 'image/jpeg',
        data: p.image?.data ?? '',
      },
    };
  });

  const body = {
    system_instruction: {
      parts: [{text: systemPrompt}],
    },
    contents: [
      {role: 'user', parts: geminiParts},
    ],
    generationConfig: {
      temperature: config.temperature ?? 0.1,
      maxOutputTokens: config.max_tokens ?? 4096,
    },
  };

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Vision API error ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const result = await response.json() as Record<string, unknown>;
  const candidates = result.candidates as Array<Record<string, unknown>> | undefined;
  const content = candidates?.[0]?.content as {parts?: Array<{text?: string}>} | undefined;
  const text = content?.parts?.[0]?.text;
  if (text) return text;

  throw new Error('Unexpected Gemini vision response format');
}
