/**
 * Standard shape for API error responses across all `app/api/*` routes.
 *
 * Every error response uses:
 *   { ok: false, error: "snake_case_code", message?: "EN fallback string", details?: ... }
 *
 * Clients should:
 *   - Check `!res.ok` (HTTP status) for success/failure
 *   - Translate `body.error` via the `errors` next-intl namespace using
 *     `t.has(body.error) ? t(body.error) : body.message ?? body.error`.
 *     The `message` is an EN fallback used when the locale lacks a translation.
 *
 * Note: there is no symmetric `ok: true` wrapper for success — successful
 * responses return the resource directly (`{ card: {...} }` or `{ data: [...] }`).
 * The `ok: false` discriminator is on errors only.
 */

import { NextResponse } from 'next/server';

export interface ApiErrorBody {
  ok: false;
  /** Snake_case error code, stable for client-side switches. */
  error: string;
  /** EN fallback message — clients should translate `error` via the `errors`
   *  i18n namespace first and fall back to this string when no translation
   *  exists for the current locale. */
  message?: string;
  /** Optional structured payload (e.g. validation field errors, conflict context). */
  details?: unknown;
  /** Conflict-context payloads. Some 409 routes return existingCard / hasForSaleConflict
   *  at the top level (read directly by clients), so we allow arbitrary extra keys. */
  [extra: string]: unknown;
}

/**
 * Build a standardized error response.
 *
 * @example
 *   return apiError('card_not_found', { status: 404, message: 'Card not found' });
 *   return apiError('validation', { status: 400, details: { field: 'set_code' } });
 *   return apiError('pokedex_slot_taken', { status: 409, extra: { existingCard, hasForSaleConflict } });
 */
export function apiError(
  error: string,
  opts: {
    status?: number;
    message?: string;
    details?: unknown;
    /** Top-level fields merged into the response body (e.g. `{ existingCard }` for conflicts).
     *  Use sparingly — prefer `details` for everything that isn't a stable client contract. */
    extra?: Record<string, unknown>;
  } = {},
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { ok: false, error };
  if (opts.message !== undefined) body.message = opts.message;
  if (opts.details !== undefined) body.details = opts.details;
  if (opts.extra) Object.assign(body, opts.extra);
  return NextResponse.json(body, { status: opts.status ?? 400 });
}

// ---------------------------------------------------------------------------
// Common shorthands — repeated patterns, one line per use site.
// ---------------------------------------------------------------------------

/** 401 — request lacked a valid session. */
export const unauthorizedResponse = (): NextResponse<ApiErrorBody> =>
  apiError('unauthorized', { status: 401 });

/** 404 — resource lookup returned nothing. */
export const notFoundResponse = (resource: string): NextResponse<ApiErrorBody> =>
  apiError(`${resource}_not_found`, { status: 404 });

/** 400 — request shape was wrong (missing field, bad type, parse error). */
export const validationResponse = (
  message: string,
  details?: unknown,
): NextResponse<ApiErrorBody> =>
  apiError('validation', { status: 400, message, details });

/** 500 — unexpected server-side failure. Pass the underlying error message
 *  for telemetry; clients will see the generic message. */
export const serverErrorResponse = (
  underlying: string | Error,
): NextResponse<ApiErrorBody> => {
  const msg = underlying instanceof Error ? underlying.message : underlying;
  return apiError('server_error', {
    status: 500,
    message: 'A server-side error occurred.',
    details: { underlying: msg },
  });
};
