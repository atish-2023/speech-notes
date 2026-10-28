import { useState, useEffect } from 'react';

function formatTimer(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function Recorder({
  isRecording,
  status,
  statusMessage,
  engine,
  finalTranscript,
  interimTranscript,
  language,
  setLanguage,
  duration,
  error,
  activeModel,
  engineNotice,
  audioLevel = 0,
  startRecording,
  stopRecording,
  clearTranscript,
  loadSampleTranscript,
  setFinalTranscript,
  onSave
}) {
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Auto-fill title from first few words if user hasn't typed anything
  useEffect(() => {
    if (!title && finalTranscript) {
      const words = finalTranscript.trim().split(/\s+/);
      const suggested = words.slice(0, 5).join(' ');
      if (suggested) {
        setTitle(suggested.length > 45 ? `${suggested.slice(0, 42)}...` : suggested);
      }
    }
  }, [finalTranscript, title]);

  const handleSaveClick = async () => {
    const fullText = [finalTranscript?.trim(), interimTranscript?.trim()].filter(Boolean).join(' ');
    if (!fullText) return;

    const saveTitle = title.trim() || fullText.split(/\s+/).slice(0, 5).join(' ') || 'Speech Note';

    setIsSaving(true);
    try {
      await onSave({
        title: saveTitle,
        content: fullText,
        transcript_text: fullText,
        language: language,
        duration_seconds: duration
      });
      setTitle('');
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadSample = () => {
    if (typeof loadSampleTranscript === 'function') {
      loadSampleTranscript('Hello, kaise ho aap log? Main aaj ek important project ke baare mein baat kar raha hoon.');
      setTitle('Project Discussion');
    }
  };

  const hasAnyText = Boolean((finalTranscript || interimTranscript)?.trim());

  return (
    <div>
      {/* Notice / Error banners */}
      {engineNotice && (
        <div style={{
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          color: '#92400e',
          padding: '0.65rem 1rem',
          borderRadius: '8px',
          fontSize: '0.82rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span>{engineNotice}</span>
        </div>
      )}

      {error && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          padding: '0.65rem 1rem',
          borderRadius: '8px',
          fontSize: '0.82rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span>{error}</span>
        </div>
      )}

      {/* Main Click to Start Speaking Card */}
      <div className="dash-card">
        <div className="recorder-box">
          <div className="mic-hero-wrapper">
            {/* Outer light green halo matching screenshot */}
            <div className="mic-hero-halo" />
            
            {isRecording && (
              <div
                className="mic-hero-ring"
                style={{
                  transform: `scale(${1 + (audioLevel / 100) * 0.4})`,
                  borderColor: isRecording ? '#ef4444' : '#059669'
                }}
              />
            )}

            <button
              type="button"
              className={`mic-hero-btn ${isRecording ? 'recording' : ''}`}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={status === 'requesting' || status === 'connecting' || status === 'stopping'}
              aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
            >
              {isRecording ? (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
          </div>

          <h3 className="recorder-hero-title">
            {isRecording ? 'Listening to speech...' : 'Click to start speaking'}
          </h3>
          <p className="recorder-hero-sub">
            {statusMessage || 'Your words will appear here in real-time'}
          </p>

          <div className="recorder-action-buttons">
            <button
              type="button"
              className="btn-start-speaking"
              onClick={startRecording}
              disabled={isRecording || status === 'requesting' || status === 'connecting'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              {status === 'connecting'
                ? 'Connecting...'
                : status === 'requesting'
                ? 'Requesting Mic...'
                : 'Start Speaking'}
            </button>

            <button
              type="button"
              className="btn-stop-speaking"
              onClick={stopRecording}
              disabled={!isRecording && status !== 'recording'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
              Stop
            </button>
          </div>

          <div className="recorder-indicators-row">
            <div className="indicator-item">
              <span className={`status-dot ${isRecording ? 'recording' : 'online'}`} />
              <span>{isRecording ? 'Microphone active' : 'Microphone ready'}</span>
            </div>

            <div className="indicator-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1-4-10z" />
              </svg>
              <span>Language:</span>
              <select
                className="select-clean"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isRecording}
              >
                <option value="auto">Auto Detect</option>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="en-hi">English + Hindi (Hinglish)</option>
              </select>
            </div>

            <div className="indicator-item">
              <span className={`status-dot ${engine === 'webspeech' ? 'warning' : 'online'}`} />
              <span>
                {engine === 'webspeech'
                  ? 'Web Speech Fallback'
                  : 'Connected to Gemini'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Transcript Card */}
      <div className="dash-card">
        <div className="card-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Soundwave / waveform icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="2" x2="12" y2="22" />
              <line x1="17" y1="6" x2="17" y2="18" />
              <line x1="7" y1="6" x2="7" y2="18" />
              <line x1="22" y1="10" x2="22" y2="14" />
              <line x1="2" y1="10" x2="2" y2="14" />
            </svg>
            <span>Live Transcript</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {!isRecording && !hasAnyText && (
              <button
                type="button"
                className="btn-sample-fill"
                onClick={handleLoadSample}
                title="Fill sample text to test saving to PostgreSQL"
              >
                Try Sample Speech Note
              </button>
            )}
            {hasAnyText && !isRecording && (
              <button
                type="button"
                className="btn-sample-fill"
                onClick={clearTranscript}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="transcript-display-box">
          <div className="transcript-box-top-row">
            <span className="label-final-result">Final result:</span>
            <span className="transcript-timer-tag">{formatTimer(duration)}</span>
          </div>

          {isEditing ? (
            <textarea
              className="transcript-edit-area"
              value={finalTranscript}
              onChange={(e) => setFinalTranscript(e.target.value)}
              placeholder="Edit or type transcript here..."
              rows={3}
            />
          ) : (
            <div
              className="final-text-content"
              onClick={() => setIsEditing(true)}
              title="Click to edit transcript text if needed"
            >
              {finalTranscript || (
                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                  {isRecording
                    ? 'Listening for speech...'
                    : 'Your words will appear here in real-time as you speak...'}
                </span>
              )}
            </div>
          )}

          {(interimTranscript || isRecording) && (
            <div className="interim-live-row">
              <div className="label-interim-live">Interim (live):</div>
              <div className="interim-text-content">
                {interimTranscript || (isRecording ? 'Listening...' : '')}
              </div>
            </div>
          )}
        </div>

        <div className="transcript-save-row">
          <input
            type="text"
            className="transcript-title-input"
            placeholder="Add a title for this transcript (optional)..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!hasAnyText || isSaving}
            maxLength={200}
          />

          <button
            type="button"
            className="btn-save-transcript"
            onClick={handleSaveClick}
            disabled={!hasAnyText || isSaving}
          >
            {/* Floppy / Save icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            {isSaving ? 'Saving to Database...' : 'Save Transcript'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Recorder;
