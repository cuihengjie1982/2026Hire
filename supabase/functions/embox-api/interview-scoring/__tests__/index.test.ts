/**
 * Integration tests for interview-scoring Edge Function.
 *
 * Run:
 *   SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=test \
 *   deno test --allow-env --allow-net --no-check supabase/functions/embox-api/interview-scoring/__tests__/index.test.ts
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// Supabase client + fetchWithRetry create internal timers that are out of our
// control. Disable resource sanitization for these tests.
const opts: Deno.TestDefinition = { sanitizeResources: false, sanitizeOps: false };

// ---------------------------------------------------------------------------
// transcribeAndScore — validation tests
// ---------------------------------------------------------------------------

Deno.test('interview-scoring — returns 400 when audio is missing', opts, async () => {
  const { transcribeAndScore } = await import('../index.ts');
  const formData = new FormData();
  formData.append('sessionId', '00000000-0000-0000-0000-000000000001');
  formData.append('questionId', 'q-1');

  const req = new Request('http://localhost/transcribe-and-score', {
    method: 'POST',
    body: formData,
  });

  const res = await transcribeAndScore(req, 'user-1', 'admin');
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, 'VALIDATION_ERROR');
  assertEquals(body.error.message, 'Audio file is required');
});

Deno.test('interview-scoring — returns 400 when sessionId is missing', opts, async () => {
  const { transcribeAndScore } = await import('../index.ts');
  const formData = new FormData();
  const audioContent = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
  const audioBlob = new Blob([audioContent], { type: 'audio/webm' });
  formData.append('audio', audioBlob, 'test.webm');

  const req = new Request('http://localhost/transcribe-and-score', {
    method: 'POST',
    body: formData,
  });

  const res = await transcribeAndScore(req, 'user-1', 'admin');
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, 'VALIDATION_ERROR');
  assertEquals(body.error.message, 'sessionId is required');
});

Deno.test('interview-scoring — returns 400 for invalid sessionId format', opts, async () => {
  const { transcribeAndScore } = await import('../index.ts');
  const formData = new FormData();
  const audioContent = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
  const audioBlob = new Blob([audioContent], { type: 'audio/webm' });
  formData.append('audio', audioBlob, 'test.webm');
  formData.append('sessionId', 'not-a-uuid');

  const req = new Request('http://localhost/transcribe-and-score', {
    method: 'POST',
    body: formData,
  });

  const res = await transcribeAndScore(req, 'user-1', 'admin');
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, 'VALIDATION_ERROR');
  assertEquals(body.error.message, 'Invalid sessionId format');
});

Deno.test('interview-scoring — rejects various invalid UUID formats', opts, async () => {
  const { transcribeAndScore } = await import('../index.ts');
  const invalidIds = [
    'not-a-uuid',
    '123',
    '00000000-0000-0000-0000-00000000000',
    '00000000-0000-0000-0000-0000000000001',
    'gggggggg-gggg-gggg-gggg-gggggggggggg',
    'GGGGGGGG-GGGG-GGGG-GGGG-GGGGGGGGGGGG',
  ];

  for (const id of invalidIds) {
    const formData = new FormData();
    const audioContent = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
    const audioBlob = new Blob([audioContent], { type: 'audio/webm' });
    formData.append('audio', audioBlob, 'test.webm');
    formData.append('sessionId', id);

    const req = new Request('http://localhost/transcribe-and-score', {
      method: 'POST',
      body: formData,
    });

    const res = await transcribeAndScore(req, 'user-1', 'admin');
    assertEquals(res.status, 400, `sessionId="${id}" should be rejected`);
    const body = await res.json();
    assertEquals(body.error.code, 'VALIDATION_ERROR', `sessionId="${id}": expected VALIDATION_ERROR`);
  }
});

// ---------------------------------------------------------------------------
// aggregate — validation tests
// ---------------------------------------------------------------------------

Deno.test('interview-scoring — aggregate returns 400 when sessionId missing from URL', async () => {
  const { aggregate } = await import('../index.ts');
  const req = new Request('http://localhost/aggregate/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const res = await aggregate(req, 'user-1', 'admin');
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, 'VALIDATION_ERROR');
});

Deno.test('interview-scoring — aggregate returns 400 for invalid sessionId', async () => {
  const { aggregate } = await import('../index.ts');
  const req = new Request('http://localhost/aggregate/not-a-uuid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const res = await aggregate(req, 'user-1', 'admin');
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, 'VALIDATION_ERROR');
  assertEquals(body.error.message, 'Invalid sessionId format');
});

// ---------------------------------------------------------------------------
// Error response structure tests
// ---------------------------------------------------------------------------

Deno.test('interview-scoring — all error responses use proper JSON format', opts, async () => {
  const { transcribeAndScore, aggregate } = await import('../index.ts');

  const formData = new FormData();
  formData.append('sessionId', 'invalid');
  const req1 = new Request('http://localhost/transcribe-and-score', {
    method: 'POST',
    body: formData,
  });
  const res1 = await transcribeAndScore(req1, 'user-1', 'admin');
  assertEquals(res1.headers.get('Content-Type'), 'application/json');
  const body1 = await res1.json();
  assertExists(body1.error, 'error should exist');
  assertEquals(typeof body1.error.code, 'string');

  const req2 = new Request('http://localhost/aggregate/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const res2 = await aggregate(req2, 'user-1', 'admin');
  assertEquals(res2.headers.get('Content-Type'), 'application/json');
  const body2 = await res2.json();
  assertExists(body2.error, 'error should exist');
  assertEquals(typeof body2.error.code, 'string');
});
