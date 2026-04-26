import SubmitTabs from '@/components/submit/SubmitTabs';

export const metadata = {
  title: 'Scanner — I.R.I.S',
};

export default function SubmitPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Scanner</h1>
      <p className="text-text-muted mt-1 text-sm">
        Photo, lot ou import script — l&apos;OCR remplit le formulaire automatiquement.
      </p>
      <div className="mt-6">
        <SubmitTabs />
      </div>
    </section>
  );
}
