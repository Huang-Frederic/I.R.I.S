import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import ServiceWorkerRegister from '@/components/layout/ServiceWorkerRegister';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: 'I.R.I.S',
    description: t('description'),
    applicationName: 'I.R.I.S',
    appleWebApp: {
      capable: true,
      title: 'I.R.I.S',
      statusBarStyle: 'black-translucent',
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  // Drives Android PWA's status bar tint. We read the same `theme` cookie
  // RootLayout uses for `data-theme` so the system bar follows the in-app
  // toggle instead of `prefers-color-scheme` — eliminates the visible color
  // seam reported in v1.0.1. iOS falls back to `apple-mobile-web-app-status-bar-style`
  // declared in `metadata.appleWebApp` (kept as `black-translucent`).
  const cookieStore = await cookies();
  const theme = cookieStore.get('theme')?.value === 'light' ? 'light' : 'dark';
  return {
    themeColor: theme === 'light' ? '#fafaf9' : '#111110',
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get('theme')?.value === 'light' ? 'light' : 'dark';
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-bg text-text min-h-full">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
