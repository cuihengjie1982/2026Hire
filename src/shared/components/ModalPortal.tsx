import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ModalPortalProps = {
  open: boolean;
  children: ReactNode;
};

/** Render modal overlays on document.body to escape layout overflow/filter stacking contexts. */
export const ModalPortal = ({ open, children }: ModalPortalProps) => {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;
  return createPortal(children, document.body);
};
