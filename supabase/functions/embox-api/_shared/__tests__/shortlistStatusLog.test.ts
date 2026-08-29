import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  appendToLog,
  createInitialLog,
  isOutreachPromote,
  normalizeStatusLog,
} from '../shortlistStatusLog.ts';

Deno.test('createInitialLog — returns array with status and timestamp', () => {
  const log = createInitialLog('待处理');
  assertEquals(log.length, 1);
  assertEquals(log[0].status, '待处理');
  assertEquals(typeof log[0].at, 'string');
});

Deno.test('normalizeStatusLog — handles null and arrays', () => {
  assertEquals(normalizeStatusLog(null), []);
  assertEquals(normalizeStatusLog([{ status: 'a', at: '2026-01-01T00:00:00Z' }]).length, 1);
});

Deno.test('normalizeStatusLog — parses legacy JSON string', () => {
  const legacy = JSON.stringify([{ status: '待处理', at: '2026-01-01T00:00:00Z' }]);
  const log = normalizeStatusLog(legacy);
  assertEquals(log.length, 1);
  assertEquals(log[0].status, '待处理');
});

Deno.test('appendToLog — appends to legacy string log', () => {
  const legacy = JSON.stringify([{ status: '待处理', at: '2026-01-01T00:00:00Z' }]);
  const log = appendToLog(legacy, '发起外联');
  assertEquals(log.length, 2);
  assertEquals(log[1].status, '发起外联');
});

Deno.test('isOutreachPromote — requires all outreach fields', () => {
  assertEquals(
    isOutreachPromote({ outreachPerson: 'Alice', channel: 'wechat', reason: 'match' }),
    true,
  );
  assertEquals(
    isOutreachPromote({ outreachPerson: 'Alice', channel: 'wechat' }),
    false,
  );
  assertEquals(
    isOutreachPromote({ outreachPerson: '', channel: 'wechat', reason: 'x' }),
    false,
  );
  assertEquals(
    isOutreachPromote({ outreachPerson: 'Alice', channel: 'invalid', reason: 'x' }),
    false,
  );
});
