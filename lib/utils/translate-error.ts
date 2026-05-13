/**
 * Translate a server-returned error code via the `errors` next-intl namespace,
 * with EN fallback handling. Exists because next-intl's strict `t()` typing
 * rejects arbitrary string keys — server `error` codes are dynamic, so we
 * narrow to the namespace's union via a single type assertion in one place
 * instead of scattering `as never` casts across every consumer.
 *
 * Returns the translated string when the locale has a translation for the
 * code, or `null` so the caller can fall back to `body.message` (EN) or any
 * status-line default.
 *
 * Pass the result of `useTranslations('errors')` as `t`. The signature is
 * intentionally typed loosely with `unknown` so consumers don't have to
 * import next-intl's `Translator` type — the underlying object exposes
 * `has(string) → boolean` and `(string) → string` regardless of the strict
 * compile-time types `useTranslations` returns.
 */
interface ErrorsTranslator {
  has: (key: string) => boolean;
  (key: string): string;
}

export function translateErrorCode(
  t: unknown,
  code: string | undefined,
): string | null {
  if (!code) return null;
  const tt = t as ErrorsTranslator;
  return tt.has(code) ? tt(code) : null;
}

