import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseJSONResponse } from '../jsonParser.ts';

Deno.test('parseJSONResponse — parses clean JSON', () => {
  const result = parseJSONResponse('{"totalScore": 85, "recommendation": "推荐"}');
  assertEquals(result.totalScore, 85);
  assertEquals(result.recommendation, '推荐');
});

Deno.test('parseJSONResponse — extracts JSON from markdown code block', () => {
  const raw = '```json\n{"score": 90, "grade": "A"}\n```';
  const result = parseJSONResponse(raw);
  assertEquals(result.score, 90);
  assertEquals(result.grade, 'A');
});

Deno.test('parseJSONResponse — extracts JSON from code block without language', () => {
  const raw = '```\n{"score": 75}\n```';
  const result = parseJSONResponse(raw);
  assertEquals(result.score, 75);
});

Deno.test('parseJSONResponse — extracts JSON object from mixed text', () => {
  const raw = 'Here is the result: {"totalScore": 60, "notes": "ok"} done.';
  const result = parseJSONResponse(raw);
  assertEquals(result.totalScore, 60);
  assertEquals(result.notes, 'ok');
});

Deno.test('parseJSONResponse — returns fallback for unparseable input', () => {
  const result = parseJSONResponse('just some text, no json here');
  assertEquals(result.totalScore, 0);
  assertExists(result.error);
  assertExists(result.rawResponse);
});
