import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export const SUPPORTED_LOCALES = ['en', 'fr', 'ja', 'zh'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get('lang')?.value;
  const locale: SupportedLocale = SUPPORTED_LOCALES.includes(
    fromCookie as SupportedLocale,
  )
    ? (fromCookie as SupportedLocale)
    : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
    onError(error) {
      if (error.code === 'MISSING_MESSAGE') {
        if (process.env.NODE_ENV !== 'production') console.warn(error.message);
        return;
      }
      throw error;
    },
    getMessageFallback({ namespace, key }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});
