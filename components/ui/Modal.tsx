'use client';

import { useEffect } from 'react';

type ModalLayout =
  /** Centered vertically and horizontally. Default. */
  | 'center'
  /** Bottom sheet on mobile, centered on >= sm. */
  | 'bottom-sheet'
  /** Fills the viewport (used by image zoom). No padding around the content. */
  | 'fullscreen'
  /** Slides in from the right edge. */
  | 'drawer-right';

interface ModalProps {
  open: boolean;
  /** Called when the user closes the modal (Escape, backdrop click, X button). */
  onClose: () => void;
  /** Used as `aria-label` on the dialog element. Required for screen readers. */
  ariaLabel: string;

  layout?: ModalLayout;
  /** Click outside the content closes the modal. Default `true`. */
  closeOnBackdrop?: boolean;
  /** Escape key closes the modal. Default `true`. */
  closeOnEscape?: boolean;
  /** Lock body scroll while open. Default `true`. */
  lockScroll?: boolean;
  /** Backdrop classes (override for fully transparent etc.). Default `bg-black/60`. */
  backdropClass?: string;

  /** className applied to the inner content wrapper — use it to size/pad. */
  className?: string;

  children: React.ReactNode;
}

const LAYOUT_OUTER_CLASSES: Record<ModalLayout, string> = {
  'center': 'items-center justify-center p-4',
  'bottom-sheet': 'items-end justify-center p-4 sm:items-center',
  'fullscreen': 'items-stretch justify-stretch p-0',
  'drawer-right': 'items-stretch justify-end p-0',
};

/**
 * Generic modal primitive — handles backdrop, Escape key, click-outside,
 * body scroll lock, and the WCAG dialog roles. Each call site is responsible
 * for the inner content (header, body, footer) and its visual styling.
 *
 * Renders nothing when `open` is false (mounting cost is paid only when shown).
 *
 * Usage:
 *   <Modal
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     ariaLabel="Confirmer l'action"
 *     className="bg-surface border-border w-full max-w-md rounded-lg border p-6"
 *   >
 *     <h2>Titre</h2>
 *     <p>Body</p>
 *     <div className="mt-4 flex justify-end gap-2">
 *       <button onClick={() => setOpen(false)}>Annuler</button>
 *       <button onClick={confirm}>Confirmer</button>
 *     </div>
 *   </Modal>
 */
export default function Modal({
  open,
  onClose,
  ariaLabel,
  layout = 'center',
  closeOnBackdrop = true,
  closeOnEscape = true,
  lockScroll = true,
  backdropClass = 'bg-black/60',
  className = '',
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeOnEscape, onClose]);

  useEffect(() => {
    if (!open || !lockScroll) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open, lockScroll]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className={`fixed inset-0 z-50 flex ${backdropClass} ${LAYOUT_OUTER_CLASSES[layout]}`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div className={className} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
