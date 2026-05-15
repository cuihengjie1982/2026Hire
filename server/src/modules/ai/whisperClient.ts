import FormData from 'form-data';

export interface WhisperResult {
  text: string;
  language?: string;
  duration?: number;
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Transcribe audio using OpenAI Whisper API.
 * Uses stream-to-buffer conversion for Node.js native fetch compatibility.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  apiKey: string,
  baseUrl?: string,
): Promise<WhisperResult> {
  const url = `${baseUrl || 'https://api.openai.com/v1'}/audio/transcriptions`;

  // Determine file extension from MIME type
  const ext = mimeToExt(mimeType);
  const filename = `answer${ext}`;

  const form = new FormData();
  form.append('file', audioBuffer, { filename, contentType: mimeType });
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('language', 'zh');

  // form-data npm package creates a Node.js stream that native fetch can't consume.
  // Convert to buffer first.
  const formBuffer = await streamToBuffer(form);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    body: formBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const result = await response.json() as {
    text?: string;
    language?: string;
    duration?: number;
  };

  if (!result.text || result.text.trim().length === 0) {
    return { text: '', language: result.language, duration: result.duration };
  }

  return {
    text: result.text,
    language: result.language,
    duration: result.duration,
  };
}

function mimeToExt(mime: string): string {
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('mp4') || mime.includes('m4a')) return '.m4a';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('mpeg')) return '.mp3';
  return '.webm';
}
