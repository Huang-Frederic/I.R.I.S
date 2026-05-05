'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';

interface Props {
  src: string;
  alt: string;
  /** Optional override for zoom factor. Default 1.5×. */
  zoom?: number;
  /** Optional override for loupe size in px. Default 140. */
  loupeSize?: number;
  /** Optional className on the outer wrapper. */
  className?: string;
  /** Width hint for next/image. Defaults to 600. */
  width?: number;
  /** Height hint for next/image. Defaults to 840. */
  height?: number;
}

/**
 * Image with a hover/touch-driven magnifier loupe overlay.
 * Click + drag (or hover on desktop) to move the loupe; release to dismiss.
 */
export default function MagnifierLoupe({
  src,
  alt,
  zoom = 1.5,
  loupeSize = 140,
  className,
  width = 600,
  height = 840,
}: Props) {
  const [zoomPos, setZoomPos] = useState<{ x: number; y: number } | null>(null);
  const [imageDimensions, setImageDimensions] = useState({ w: 0, h: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  return (
    <div
      className={`relative select-none overflow-hidden rounded-xl ${className ?? ''}`}
      onMouseMove={(e) => {
        const target = e.currentTarget.getBoundingClientRect();
        setZoomPos({ x: e.clientX - target.left, y: e.clientY - target.top });
      }}
      onMouseLeave={() => setZoomPos(null)}
      onTouchMove={(e) => {
        const target = e.currentTarget.getBoundingClientRect();
        const touch = e.touches[0];
        if (touch) {
          setZoomPos({ x: touch.clientX - target.left, y: touch.clientY - target.top });
        }
      }}
      onTouchEnd={() => setZoomPos(null)}
    >
      <Image
        ref={imageRef}
        src={src}
        alt={alt}
        width={width}
        height={height}
        // max-h-full + object-contain lets a parent constrain height (e.g.
        // CardZoomModal on a phone with a tall image) without clipping or
        // stretching. h-auto preserves the aspect ratio when width is the
        // limiting dimension.
        className="h-auto w-full max-h-full object-contain"
        unoptimized
        onLoad={(e) => {
          const img = e.currentTarget;
          setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight });
        }}
      />
      {/* eslint-disable-next-line react-hooks/refs */}
      {zoomPos && imageDimensions.w > 0 && imageRef.current && (() => {
        const imgRect = imageRef.current.getBoundingClientRect();
        const displayedW = imgRect.width;
        const displayedH = imgRect.height;

        const clampedX = Math.min(Math.max(zoomPos.x, loupeSize / 2), displayedW - loupeSize / 2);
        const clampedY = Math.min(Math.max(zoomPos.y, loupeSize / 2), displayedH - loupeSize / 2);

        return (
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white shadow-2xl"
            style={{
              width: loupeSize,
              height: loupeSize,
              left: clampedX - loupeSize / 2,
              top: clampedY - loupeSize / 2,
              backgroundImage: `url(${src})`,
              backgroundSize: `${displayedW * zoom}px ${displayedH * zoom}px`,
              backgroundPosition: `-${zoomPos.x * zoom - loupeSize / 2}px -${zoomPos.y * zoom - loupeSize / 2}px`,
            }}
          />
        );
      })()}
    </div>
  );
}
