// Per-card price snapshot persisted by the daily snapshot cron.
// Granularity transitions: daily (≤90d) → weekly (≤365d) → monthly (∞).

export type Granularity = 'daily' | 'weekly' | 'monthly';

export interface PriceHistoryPoint {
  card_id: string;
  bucket_date: string;        // ISO date 'YYYY-MM-DD'
  granularity: Granularity;
  cm_price_low: number | null;
  cm_price_trend: number | null;
  cm_price_avg: number | null;
  source_freshness_days: number | null;
}

// Result of the cascade `J-1 → J-3 → J-7 → J-30 → J-90`.
// `null` means: no usable prior point OR delta < 1 cent (stable).
export interface PriceTrend {
  delta_pct: number;          // e.g. 3.2 means +3.2%
  delta_eur: number;
  period_days: 1 | 3 | 7 | 30 | 90;
  base_price: number;
  current_price: number;
}

// Multi-period delta matrix used in PriceDetailModal.
export interface DeltaMatrixData {
  d7: PriceTrend | null;
  d30: PriceTrend | null;
  d90: PriceTrend | null;
  d365: PriceTrend | null;
}
