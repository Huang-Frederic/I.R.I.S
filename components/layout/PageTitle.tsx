interface Props {
  title: string;
  subtitle?: string;
  /**
   * Optional controls (tabs, buttons) displayed right of the title on desktop,
   * stacked below the title row on mobile.
   */
  controls?: React.ReactNode;
}

export default function PageTitle({ title, subtitle, controls }: Props) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-text-muted mt-1 text-sm">{subtitle}</p>}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-10 w-10 shrink-0 md:hidden" aria-hidden />
      </div>
      {controls && <div className="flex items-center gap-2">{controls}</div>}
    </div>
  );
}
