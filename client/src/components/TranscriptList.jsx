import { formatDateTime, getLanguageBadge } from '../utils/transcriptFormat.js';

export function TranscriptList({
  transcriptions,
  searchQuery,
  onSearchChange,
  isLoading,
  error,
  onView,
  onEdit,
  onDelete
}) {
  const items = transcriptions || [];

  return (
    <aside className="right-sidebar" id="history-section">
      <div className="history-sidebar-header">
        <h2 className="history-sidebar-title">
          {/* Green document icon */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Transcription History
        </h2>
        <p className="history-sidebar-subtitle">Your saved transcripts and notes</p>
      </div>

      <div className="search-box-wrapper">
        <svg className="search-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          className="search-input-field"
          placeholder="Search by title or content..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8', fontSize: '0.85rem' }}>
          Loading saved transcripts...
        </div>
      )}

      {!isLoading && error && (
        <div style={{ padding: '0.75rem', background: '#fef2f2', color: '#991b1b', borderRadius: '8px', fontSize: '0.8rem' }}>
          {error}
        </div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94a3b8', fontSize: '0.85rem' }}>
          {searchQuery ? 'No transcripts match your search.' : 'No saved transcripts yet. Speak and click Save Transcript!'}
        </div>
      )}

      {!isLoading && !error && items.length > 0 && (
        <div className="history-items-list">
          {items.map((item) => (
            <div key={item.id} className="history-item-card">
              <div className="history-card-top">
                <div className="doc-badge-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>

                <div className="history-title-area">
                  <h4 className="history-title-text" title={item.title}>
                    {item.title}
                  </h4>
                </div>

                <div className="history-actions-row">
                  <button
                    type="button"
                    className="icon-action-btn"
                    onClick={() => onView(item)}
                    title="View note"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="icon-action-btn"
                    onClick={() => onEdit(item)}
                    title="Edit note"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="icon-action-btn delete"
                    onClick={() => onDelete(item)}
                    title="Delete note"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>

              <p className="history-card-snippet">
                {item.content || item.transcript_text}
              </p>

              <div className="history-card-bottom">
                <span className={`lang-pill-badge ${getLanguageBadge(item.language).className}`}>
                  {getLanguageBadge(item.language).label}
                </span>
                <span className="history-date-text">
                  {formatDateTime(item.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

export default TranscriptList;
