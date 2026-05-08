import Image from 'next/image';

/** Small visual primitives shared by the Pokédex drawer sub-views. */

export function Figure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="flex flex-col gap-1">
      <div className="bg-surface-2 relative aspect-[3/4] overflow-hidden rounded">
        <Image src={src} alt={alt} fill sizes="200px" className="object-contain" unoptimized />
      </div>
      <figcaption className="text-text-faint text-center text-[10px] uppercase">{caption}</figcaption>
    </figure>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border flex justify-between gap-3 border-b py-1.5 last:border-b-0">
      <dt className="text-text-muted text-xs">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

export function Price({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number | null;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-text-faint text-[10px] uppercase">{label}</p>
      <p className={`font-mono text-sm ${highlight ? 'text-rarity-sr font-semibold' : 'text-text'}`}>
        {value !== null ? `${value.toFixed(2)} €` : '—'}
      </p>
    </div>
  );
}
