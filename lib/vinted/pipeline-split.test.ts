// lib/vinted/pipeline-split.test.ts
import { describe, expect, it } from 'vitest';
import { splitPipelineByQuota } from './pipeline-split';

describe('splitPipelineByQuota', () => {
  it('splits the first dailyQuota items into today, the rest into later', () => {
    expect(splitPipelineByQuota([1, 2, 3, 4, 5], 3)).toEqual({ today: [1, 2, 3], later: [4, 5] });
  });

  it('puts everything in today when there are fewer items than the quota', () => {
    expect(splitPipelineByQuota([1, 2], 5)).toEqual({ today: [1, 2], later: [] });
  });

  it('returns empty arrays for an empty pipeline', () => {
    expect(splitPipelineByQuota([], 8)).toEqual({ today: [], later: [] });
  });
});
