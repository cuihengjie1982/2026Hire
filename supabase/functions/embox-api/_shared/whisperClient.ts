export interface WhisperResult {
  text: string;
  language?: string;
  duration?: number;
}

function mimeToExt(mime: string): string {
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('mp4') || mime.includes('m4a')) return '.m4a';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('mpeg')) return '.mp3';
  return '.webm';
}

export async function transcribeAudio(
  audioBlob: Blob,
  mimeType: string,
  apiKey: string,
  baseUrl?: string,
): Promise<WhisperResult> {
  const url = `${baseUrl || 'https://api.openai.com/v1'}/audio/transcriptions`;
  const ext = mimeToExt(mimeType);
  const filename = `answer${ext}`;

  const formData = new FormData();
  formData.append('file', audioBlob, filename);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('language', 'zh');

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const result = await response.json() as { text?: string; language?: string; duration?: number };
  return {
    text: result.text?.trim() ?? '',
    language: result.language,
    duration: result.duration,
  };
}
