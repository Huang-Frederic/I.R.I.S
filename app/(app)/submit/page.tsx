import SubmitTabs from '@/components/submit/SubmitTabs';

export const metadata = {
  title: 'Scanner — I.R.I.S',
};

export default function SubmitPage() {
  return (
    // Desktop: viewport-height shell with overflow-hidden. The form column
    // inside SubmitTabs gets its own overflow-y-auto so ONLY the form scrolls;
    // header, tabs, and photo column stay put. Mobile keeps natural flow
    // (BottomNav eats viewport, header sticky would overcrowd).
    // 3.5rem = parent layout's pt-6 (1.5rem) + pb-8 (2rem) padding.
    <section className="lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden lg:flex lg:flex-col">
      <div className="lg:shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">Scanner</h1>
        <p className="text-text-muted mt-1 text-sm">
          Photo, lot ou import script — l&apos;OCR remplit le formulaire automatiquement.
        </p>
      </div>
      <div className="mt-6 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
        <SubmitTabs />
      </div>
    </section>
  );
}
