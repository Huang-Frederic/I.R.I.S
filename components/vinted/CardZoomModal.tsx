'use client';

import { X } from 'lucide-react';
import MagnifierLoupe from '@/components/ui/MagnifierLoupe';
import Modal from '@/components/ui/Modal';

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

export default function CardZoomModal({ src, alt, onClose }: Props) {
  return (
    <Modal
      open={true}
      onClose={onClose}
      ariaLabel="Aperçu carte"
      backdropClass="bg-black/80"
      className="relative w-full max-w-md max-h-[calc(100vh-6rem)] overflow-hidden"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="bg-surface text-text-muted hover:text-text absolute -top-12 right-0 z-10 rounded-full p-2"
      >
        <X className="h-5 w-5" />
      </button>
      {/* MagnifierLoupe constrained to viewport via max-h-* on inner.
        The card aspect (~600x840) blows past mobile viewport otherwise:
        on a 640px-tall phone with a 64px BottomNav, the bottom of the
        card was clipped behind the menu (z-30 < z-100 but the image
        itself rendered past the modal bounds). */}
      <div className="max-h-[calc(100vh-6rem)] overflow-hidden">
        <MagnifierLoupe src={src} alt={alt} className="bg-surface-off max-h-[calc(100vh-6rem)]" />
      </div>
    </Modal>
  );
}
