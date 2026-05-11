interface Props {
  imageUrl: string | null | undefined;
  className?: string;
}

export default function CardMatchPreview({ imageUrl, className }: Props) {
  if (!imageUrl) return null;
  return (
    <div
      className={`bg-white/10 backdrop-blur-sm rounded-lg p-1 shadow-md ${className ?? ''}`.trim()}
      aria-label="Carte matchée par l'API"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        aria-hidden
        className="aspect-[5/7] w-24 rounded object-contain"
      />
    </div>
  );
}
