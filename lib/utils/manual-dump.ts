export type ManualDumpTables = {
  cards: unknown[];
  lots: unknown[];
  card_listings: unknown[];
  lot_listings: unknown[];
  user_profiles: unknown[];
  config: unknown[];
  ocr_usage_log: unknown[];
  stock_value_snapshots: unknown[];
};

export interface ManualDump {
  version: 'v1';
  created_at: string;
  tables: ManualDumpTables;
}

export function buildManualDump(tables: ManualDumpTables, createdAt: string): ManualDump {
  return { version: 'v1', created_at: createdAt, tables };
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

export function manualBackupFilename(date: Date): string {
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `iris-${y}-${m}-${d}-${h}${mi}${s}.json.gz`;
}
