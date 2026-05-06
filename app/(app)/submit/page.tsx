import SubmitTabs from '@/components/submit/SubmitTabs';

export const metadata = {
  title: 'Scanner — I.R.I.S',
};

export default function SubmitPage() {
  return (
    <section>
      {/* Desktop only: sticky header so the form scrolls underneath. Mobile
          keeps the natural flow (BottomNav already eats viewport). The bg +
          horizontal margin trick covers the page padding so nothing leaks
          through during scroll. */}
      <div className="lg:bg-bg lg:sticky lg:top-0 lg:z-10 lg:-mx-8 lg:px-8 lg:py-3">
        <h1 className="text-2xl font-semibold tracking-tight">Scanner</h1>
        <p className="text-text-muted mt-1 text-sm">
          Photo, lot ou import script — l&apos;OCR remplit le formulaire automatiquement.
        </p>
      </div>
      <div className="mt-6">
        <SubmitTabs />
      </div>
    </section>
  );
}
