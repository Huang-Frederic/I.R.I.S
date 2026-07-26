import { describe, expect, it } from 'vitest';
import { previewPosition, type Rect, type Size } from './ptcg-preview-position';

const preview: Size = { width: 300, height: 418 };
const viewport: Size = { width: 1280, height: 800 };
const card = (over: Partial<Rect> = {}): Rect => ({
  left: 400,
  top: 300,
  width: 110,
  height: 153,
  ...over,
});

describe('previewPosition', () => {
  it('sits to the right of the card when there is room', () => {
    expect(previewPosition(card(), preview, viewport).left).toBe(400 + 110 + 14);
  });

  it('centres vertically on the card', () => {
    const { top } = previewPosition(card(), preview, viewport);
    expect(top + preview.height / 2).toBe(300 + 153 / 2);
  });

  it('flips to the left near the right edge', () => {
    // A bench card at the far right of a full-width board.
    const { left } = previewPosition(card({ left: 1100 }), preview, viewport);
    expect(left).toBe(1100 - 14 - 300);
  });

  it('stays on screen when neither side fits', () => {
    const narrow: Size = { width: 360, height: 800 };
    const { left } = previewPosition(card({ left: 120 }), preview, narrow);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + preview.width).toBeLessThanOrEqual(360 - 8);
  });

  it('clamps a card near the top so the preview is not cut off', () => {
    expect(previewPosition(card({ top: 4 }), preview, viewport).top).toBe(8);
  });

  it('clamps a card near the bottom', () => {
    const { top } = previewPosition(card({ top: 760 }), preview, viewport);
    expect(top + preview.height).toBeLessThanOrEqual(800 - 8);
  });

  it('pins to the top when the preview is taller than the window', () => {
    // Short window: the clamp range inverts, and a naive Math.min/max would
    // return a negative top and push the card off screen.
    expect(previewPosition(card(), preview, { width: 1280, height: 380 }).top).toBe(8);
  });
});
