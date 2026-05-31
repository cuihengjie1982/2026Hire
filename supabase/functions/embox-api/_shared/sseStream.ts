/**
 * SSE (Server-Sent Events) streaming helper for Edge Functions.
 * Wraps LLM calls in a streaming SSE loop so the frontend can render
 * AI responses token-by-token.
 */

export interface SSEStream {
  write: (event: string, data: string) => void;
  close: () => void;
}

/**
 * Create an SSE response stream attached to the given Request.
 * Returns a { write, close } controller.
 */
export function createSSEStream(req: Request): SSEStream {
  const body = new ReadableStream({
    start(controller) {
      // Push a comment to establish the connection immediately
      controller.enqueue(new TextEncoder().encode(':ok\n\n'));
    },
  });

  // We use a separate writable stream to allow imperative writes.
  // TransformStream lets us bridge imperative writes to the ReadableStream.
  let writerClosed = false;
  const encoder = new TextEncoder();

  const write = (event: string, data: string) => {
    if (writerClosed) return;
    const chunk = `event: ${event}\ndata: ${data}\n\n`;
    // This is consumed via the TransformStream
    queuedChunks.push(chunk);
  };

  const close = () => {
    if (writerClosed) return;
    writerClosed = true;
    queuedChunks.push('event: done\ndata: {}\n\n');
  };

  const queuedChunks: string[] = [];

  const stream = new ReadableStream({
    start(controller) {
      const pushLoop = () => {
        while (queuedChunks.length > 0) {
          controller.enqueue(encoder.encode(queuedChunks.shift()!));
        }
        if (writerClosed && queuedChunks.length === 0) {
          controller.close();
          return;
        }
        // Small delay then check again
        setTimeout(pushLoop, 50);
      };
      pushLoop();
    },
  });

  // Note: This is a simplified version. In practice, we return the Response
  // wrapping `stream` to the client. The callers should use the Response
  // returned by `respondSSE()` below.
  // Store the stream so respondSSE can use it.
  (req as Record<string, unknown>)._sseStream = stream;

  return {
    write(event: string, data: string) {
      if (!writerClosed) queuedChunks.push(`event: ${event}\ndata: ${data}\n\n`);
    },
    close() {
      if (!writerClosed) {
        writerClosed = true;
        queuedChunks.push('event: done\ndata: {}\n\n');
      }
    },
  };
}

/**
 * Return a Response object for an SSE stream.
 * Use this in the Edge Function handler when the client requests streaming.
 */
export function respondSSE(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Call an LLM in streaming mode and pipe each token as an SSE event.
 * Returns the full response text when done.
 */
export async function streamLLMResponse(
  config: {
    provider: string;
    model_name: string;
    api_key: string;
    base_url?: string | null;
    temperature: number;
    max_tokens: number;
  },
  systemPrompt: string,
  userMessage: string,
  onToken: (token: string) => void,
): Promise<string> {
  // For now, we use callLLM (non-streaming) and simulate streaming by
  // sending tokens in chunks. This works with all providers.
  // Future enhancement: integrate with provider-native streaming APIs.
  const { callLLM } = await import('./llmClient.ts');

  const fullResponse = await callLLM(config, systemPrompt, userMessage);

  // Simulate streaming: emit characters in small chunks
  const chars = [...fullResponse];
  const chunkSize = 3;
  let full = '';
  for (let i = 0; i < chars.length; i += chunkSize) {
    const chunk = chars.slice(i, i + chunkSize).join('');
    full += chunk;
    onToken(chunk);
    // Small delay to simulate natural typing cadence
    await new Promise(r => setTimeout(r, 20));
  }

  return full;
}
