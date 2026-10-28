import { useState, useEffect } from 'react';
import { ModalOverlay } from './ModalOverlay.jsx';
import { formatFullDateTime, getLanguageBadge } from '../utils/transcriptFormat.js';

export function TranscriptViewModal({ isOpen, item, onClose }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (item) setCopied(false);
  }, [item]);

  const currentContent = item?.content || item?.transcript_text || '';
  const languageBadge = getLanguageBadge(item?.language);

  if (!isOpen || !item) return null;

  const markCopied = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentContent);
      markCopied();
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = currentContent;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        markCopied();
      } catch {
        // Clipboard unavailable in this environment
      }
    }
  };

  return (
    <ModalOverlay isOpen={isOpen} item={item} onClose={onClose} heading={item?.title}>
      <>
        <div className="modal-body">
          <div className="modal-meta-row">
            <span className={`lang-pill-badge ${languageBadge.className}`}>
              {languageBadge.label}
            </span>
            <span className="modal-meta-date">
              Created: {formatFullDateTime(item.created_at)}
            </span>
            {item.updated_at && item.updated_at !== item.created_at && (
              <span className="modal-meta-date">
                • Updated: {formatFullDateTime(item.updated_at)}
              </span>
            )}
          </div>

          <div className="modal-transcript-box">
            {currentContent}
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCopy}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? 'Copied!' : 'Copy Text'}
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </>
    </ModalOverlay>
  );
}

export default TranscriptViewModal;
