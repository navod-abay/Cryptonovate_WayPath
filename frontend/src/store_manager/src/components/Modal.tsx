import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import './Modal.css';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

/** Centered dialog with the dark navy overlay from the design. Esc / backdrop closes it. */
export default function Modal({ open, title, onClose, children, width = 718 }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="sm-modal__overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        className="sm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sm-modal-title"
        tabIndex={-1}
        style={{ width }}
      >
        <div className="sm-modal__head">
          <h2 id="sm-modal-title" className="sm-modal__title">{title}</h2>
          <button type="button" className="sm-modal__close" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
