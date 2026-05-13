import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
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

export const viewport: Viewport = {
  // Drives Android PWA's status bar tint and iOS Safari's chrome. Two media-
  // gated entries so the bar blends with whichever theme the OS is on,
  // eliminating the visible color seam between the system bar and the app bg
  // (--color-bg). Note: this follows the OS theme, not the in-app cookie
  // toggle — close enough for 99% of users since the manual toggle in
  // /options usually mirrors the system theme.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#111110' },
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

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
      </body>
    </html>
  );
}
