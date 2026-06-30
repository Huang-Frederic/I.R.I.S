import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import ThemeToggle from '@/components/layout/ThemeToggle';
import LanguageToggle from '@/components/layout/LanguageToggle';
import SignOutButton from '@/components/layout/SignOutButton';
import ManualBackupSection from '@/components/options/ManualBackupSection';
import PWAInstallSection from '@/components/options/PWAInstallSection';
import RefreshAllPricesSection from '@/components/options/RefreshAllPricesSection';
import PageTitle from '@/components/layout/PageTitle';

export async function generateMetadata() {
  const t = await getTranslations('options');
  return {
    title: t('metaTitle'),
  };
}

export default async function OptionsPage() {
  const cookieStore = await cookies();
  const initialTheme = cookieStore.get('theme')?.value === 'light' ? 'light' : 'dark';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const t = await getTranslations('options');

  return (
    <section>
      <PageTitle title={t('pageTitle')} subtitle={t('pageSubtitle')} />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="bg-surface border-border rounded-lg border p-5">
          <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
            {t('appearance')}
          </h2>
          <ThemeToggle initialTheme={initialTheme} />
        </div>

        <div className="bg-surface border-border rounded-lg border p-5">
          <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
            {t('language')}
          </h2>
          <LanguageToggle />
        </div>

        <div className="bg-surface border-border rounded-lg border p-5">
          <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
            {t('account')}
          </h2>
          {user?.email && (
            <p className="text-text mb-3 break-all px-3 font-mono text-xs">{user.email}</p>
          )}
          <SignOutButton />
        </div>

        <PWAInstallSection />

        <RefreshAllPricesSection />
      </div>

      <div className="mt-4">
        <ManualBackupSection />
      </div>

      <div className="mt-4">
        <div className="bg-surface border-border rounded-lg border p-5">
          <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
            Activité
          </h2>
          <a
            href="/logs"
            className="text-accent hover:text-accent/80 text-sm transition-colors"
          >
            Voir les logs d'activité →
          </a>
        </div>
      </div>
    </section>
  );
}
