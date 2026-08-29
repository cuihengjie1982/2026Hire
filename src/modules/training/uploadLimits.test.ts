import {describe, expect, it} from 'vitest';
import {
  TRAINING_MATERIALS_MAX_FILE_BYTES,
  TRAINING_MATERIALS_MAX_FILE_LABEL,
} from './uploadLimits';

describe('training material upload limits', () => {
  it('accepts the largest source video in the bulk training library', () => {
    expect(TRAINING_MATERIALS_MAX_FILE_BYTES).toBeGreaterThanOrEqual(827_454_959);
    expect(TRAINING_MATERIALS_MAX_FILE_LABEL).toBe('1GB');
  });
});
