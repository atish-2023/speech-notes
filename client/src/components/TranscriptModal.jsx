import { useState, useEffect } from 'react';
import { formatFullDateTime, getLanguageBadge } from '../utils/transcriptFormat.js';

export function TranscriptModal({
  isOpen,
  mode = 'view',
  item,
  onClose,
  onSave
}) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('auto');
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState('');
  const [titleError, setTitleError] = useState('');
  const [textError, setTextError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setTitle(item.title || '');
      setText(item.content || item.transcript_text || '');
      setLanguage(item.language || 'auto');
      setCopied(false);
      setFormError('');
      setTitleError('');
      setTextError('');
    }
  }, [item, mode]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSaving) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen || !item) return null;

  const currentContent = item.content || item.transcript_text || '';
  const languageBadge = getLanguageBadge(item.language);

  const handleOverlayClick = () => {
    if (!isSaving) onClose();
  };

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

  const validate = () => {
    let nextTitleError = '';
    let nextTextError = '';

    if (!title.trim()) {
      nextTitleError = 'Title is required.';
    } else if (title.length > 200) {
      nextTitleError = 'Title must be 200 characters or fewer.';
    }

    if (!text.trim()) {
      nextTextError = 'Transcript text is required.';
    }

    setTitleError(nextTitleError);
    setTextError(nextTextError);
    return !nextTitleError && !nextTextError;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    setFormError('');
    try {
      await onSave(item.id, {
        title: title.trim(),
        content: text.trim(),
        transcript_text: text.trim(),
        language: language
      });
      onClose();
    } catch (err) {
      setFormError(err.message || 'Failed to update transcript.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {mode === 'edit' ? 'Edit Transcript' : item.title}
          </h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close modal"
            disabled={isSaving}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {mode === 'view' ? (
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
        ) : (
          <form onSubmit={handleSave} noValidate>
            <div className="modal-body">
              {formError && (
                <div className="banner banner-error">
                  <span>{formError}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="edit-title">Title</label>
                <input
                  id="edit-title"
                  type="text"
                  className={`form-input${titleError ? ' is-invalid' : ''}`}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value.slice(0, 200));
                    if (titleError) setTitleError('');
                  }}
                  maxLength={200}
                  required
                />
                <div className="form-hint">{title.length}/200</div>
                {titleError && <div className="form-error">{titleError}</div>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-language">Language</label>
                <select
                  id="edit-language"
                  className="select-input"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="auto">Auto Detect</option>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="en-hi">English + Hindi</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-text">Transcript Text</label>
                <textarea
                  id="edit-text"
                  className={`form-textarea${textError ? ' is-invalid' : ''}`}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (textError) setTextError('');
                  }}
                  rows={8}
                  required
                />
                {textError && <div className="form-error">{textError}</div>}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default TranscriptModal;
