import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import ThemeToggle from '@/components/layout/ThemeToggle';
import SignOutButton from '@/components/layout/SignOutButton';
import ManualBackupSection from '@/components/options/ManualBackupSection';
import PWAInstallSection from '@/components/options/PWAInstallSection';

export const metadata = {
  title: 'Options — I.R.I.S',
};

export default async function OptionsPage() {
  const cookieStore = await cookies();
  const initialTheme = cookieStore.get('theme')?.value === 'light' ? 'light' : 'dark';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <section>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Options</h1>
        <p className="text-text-muted mt-1 text-sm">Préférences et compte.</p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="bg-surface border-border rounded-lg border p-5">
          <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
            Apparence
          </h2>
          <ThemeToggle initialTheme={initialTheme} />
        </div>

        <div className="bg-surface border-border rounded-lg border p-5">
          <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
            Compte
          </h2>
          {user?.email && (
            <p className="text-text mb-3 break-all px-3 font-mono text-xs">{user.email}</p>
          )}
          <SignOutButton />
        </div>

        <PWAInstallSection />
      </div>

      <div className="mt-4">
        <ManualBackupSection />
      </div>
    </section>
  );
}
