/**
 * Coefficient applied to Cardmarket trend price to derive the suggested
 * Vinted price. Single source of truth — both the form-save routes and
 * the daily cron (if it ever computes suggestions) must read from here.
 */
export const PRICE_COEFFICIENT = 0.85;
