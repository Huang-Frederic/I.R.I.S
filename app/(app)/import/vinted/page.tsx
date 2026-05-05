import { VintedImportFlow } from '@/components/import/VintedImportFlow';

export default function ImportVintedPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Import Vinted</h1>
      <p className="text-sm text-text-muted">
        Bootstrap one-shot depuis ton compte Vinted. Tes annonces seront créées comme cards{' '}
        <code className="rounded bg-surface-off px-1">for_sale</code> listées par toi.
      </p>
      <VintedImportFlow />
    </div>
  );
}
