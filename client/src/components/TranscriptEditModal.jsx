import { useState, useEffect } from 'react';
import { ModalOverlay } from './ModalOverlay.jsx';

export function TranscriptEditModal({ isOpen, item, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('auto');
  const [formError, setFormError] = useState('');
  const [titleError, setTitleError] = useState('');
  const [textError, setTextError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setTitle(item.title || '');
      setText(item.content || item.transcript_text || '');
      setLanguage(item.language || 'auto');
      setFormError('');
      setTitleError('');
      setTextError('');
    }
  }, [item]);

  if (!isOpen || !item) return null;

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
    <ModalOverlay isOpen={isOpen} item={item} onClose={onClose} busy={isSaving} heading="Edit Transcript">
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
    </ModalOverlay>
  );
}

export default TranscriptEditModal;
