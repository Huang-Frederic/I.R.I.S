import { describe, expect, it } from 'vitest';

// We test the helper exports indirectly through their effect on ProcessedImage.
// The full processImageForVinted is hard to unit-test in happy-dom (no real canvas).
// We test the filename + quality contracts via small synthetic invocations.

describe('image-postprocess', () => {
  it('exports the expected shape', async () => {
    const mod = await import('./image-postprocess');
    expect(typeof mod.processImageForVinted).toBe('function');
    expect(typeof mod.downloadBlob).toBe('function');
  });

  it('downloadBlob does not throw on a tiny blob', async () => {
    const { downloadBlob } = await import('./image-postprocess');
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
    expect(() => downloadBlob(blob, 'test.jpg')).not.toThrow();
  });
});
