import { describe, expect, it } from 'vitest';
import { buildManualDump, manualBackupFilename } from './manual-dump';

describe('buildManualDump', () => {
  it('wraps tables in a versioned envelope', () => {
    const dump = buildManualDump({
      cards: [{ id: 'a' }, { id: 'b' }],
      lots: [],
      card_listings: [],
      lot_listings: [],
      user_profiles: [],
      config: [],
      ocr_usage_log: [],
      stock_value_snapshots: [],
    }, '2026-05-07T14:30:52.000Z');

    expect(dump.version).toBe('phase5');
    expect(dump.created_at).toBe('2026-05-07T14:30:52.000Z');
    expect(dump.tables.cards.length).toBe(2);
    expect(dump.tables.lots).toEqual([]);
  });
});

describe('manualBackupFilename', () => {
  it('produces a sortable filename in iris-YYYY-MM-DD-HHMMSS.json.gz format', () => {
    const name = manualBackupFilename(new Date('2026-05-07T14:30:52.000Z'));
    expect(name).toBe('iris-2026-05-07-143052.json.gz');
  });
});
