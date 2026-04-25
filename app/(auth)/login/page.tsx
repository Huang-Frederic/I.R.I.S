import LoginForm from './login-form';

export const metadata = {
  title: 'Connexion — I.R.I.S',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="bg-surface border-border w-full max-w-sm rounded-lg border p-8">
        <header className="mb-6 text-center">
          <h1 className="text-red text-2xl font-bold tracking-tight">I.R.I.S</h1>
          <p className="text-text-muted mt-1 text-xs">Gestion de collection Pokémon TCG</p>
        </header>
        <LoginForm />
      </div>
    </main>
  );
}
