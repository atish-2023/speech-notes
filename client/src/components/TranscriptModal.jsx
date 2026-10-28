import { TranscriptViewModal } from './TranscriptViewModal.jsx';
import { TranscriptEditModal } from './TranscriptEditModal.jsx';

/**
 * Public entry point kept for App.jsx. Chooses the view or edit dialog based on
 * `mode`. Both share ModalOverlay, so the chrome and close behavior stay
 * identical to the previous single component.
 */
export function TranscriptModal({ isOpen, mode = 'view', item, onClose, onSave }) {
  if (mode === 'edit') {
    return <TranscriptEditModal isOpen={isOpen} item={item} onClose={onClose} onSave={onSave} />;
  }
  return <TranscriptViewModal isOpen={isOpen} item={item} onClose={onClose} />;
}

export default TranscriptModal;
