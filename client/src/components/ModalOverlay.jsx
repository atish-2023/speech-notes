import { useEffect } from 'react';

/**
 * Shared modal chrome: the dimmed overlay, the centered content card, the
 * header (title + close button) and the Escape-to-close / click-outside-to-
 * close behavior. `busy` (e.g. while saving) blocks closing, exactly like the
 * original combined modal did. Renders nothing when closed or when there is
 * no item, so callers can compute derived values defensively.
 */
export function ModalOverlay({ isOpen, item, onClose, busy = false, heading, children }) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, busy, onClose]);

  if (!isOpen || !item) return null;

  const handleOverlayClick = () => {
    if (!busy) onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{heading}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close modal"
            disabled={busy}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

export default ModalOverlay;
