import { getTranslations } from 'next-intl/server';
import LoginForm from './login-form';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return {
    title: t('loginPageTitle'),
  };
}

export default async function LoginPage() {
  const t = await getTranslations('auth');

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="bg-surface border-border w-full max-w-sm rounded-lg border p-8">
        <header className="mb-6 text-center">
          <h1 className="text-red text-2xl font-bold tracking-tight">I.R.I.S</h1>
          <p className="text-text-muted mt-1 text-xs">{t('loginPageSubtitle')}</p>
        </header>
        <LoginForm />
      </div>
    </main>
  );
}
