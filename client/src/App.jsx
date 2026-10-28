import { useState, useEffect, useCallback } from 'react';
import { useLiveTranscription } from './hooks/useLiveTranscription.js';
import { Recorder } from './components/Recorder.jsx';
import { TranscriptList } from './components/TranscriptList.jsx';
import { TranscriptModal } from './components/TranscriptModal.jsx';
import { ConfirmDelete } from './components/ConfirmDelete.jsx';
import { formatDateTime } from './utils/transcriptFormat.js';
import {
  checkHealth,
  fetchTranscripts,
  createTranscript,
  updateTranscript,
  deleteTranscript
} from './services/api.js';
import './styles.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  // Live transcription state
  const {
    isRecording,
    status: liveStatus,
    statusMessage,
    engine,
    finalTranscript,
    interimTranscript,
    language,
    setLanguage,
    duration,
    error: liveError,
    engineNotice,
    audioLevel,
    startRecording,
    stopRecording,
    clearTranscript,
    loadSampleTranscript,
    setFinalTranscript
  } = useLiveTranscription();

  // Database / CRUD state
  const [transcripts, setTranscripts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState(null);
  const [serverHealth, setServerHealth] = useState({ online: false, db: null });
  const [notification, setNotification] = useState(null);

  // Modals state
  const [activeModal, setActiveModal] = useState(null); // { mode: 'view' | 'edit', item }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Ping server health
  const pingHealth = useCallback(async () => {
    try {
      const data = await checkHealth();
      setServerHealth({
        online: data.status === 'ok',
        db: data.database?.type || 'neon-postgresql'
      });
    } catch {
      setServerHealth({ online: false, db: null });
    }
  }, []);

  useEffect(() => {
    pingHealth();
    const interval = setInterval(pingHealth, 30000);
    return () => clearInterval(interval);
  }, [pingHealth]);

  // Load history list with optional search
  const loadTranscripts = useCallback(async (search = '') => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const data = await fetchTranscripts(search);
      setTranscripts(Array.isArray(data) ? data : []);
    } catch (err) {
      setListError(err.message || 'Could not load saved transcripts.');
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  // Initial fetch and search debouncing
  useEffect(() => {
    const timer = setTimeout(() => {
      loadTranscripts(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, loadTranscripts]);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  };

  // CRUD Actions - Explicitly persisting to PostgreSQL
  const handleSaveTranscript = async (data) => {
    try {
      const created = await createTranscript(data);
      showNotification(`Note "${created.title}" successfully saved to PostgreSQL database!`);
      clearTranscript();
      await loadTranscripts(searchQuery);
    } catch (err) {
      console.error('Save error:', err);
      showNotification(`Failed to save to database: ${err.message}`, 'error');
    }
  };

  const handleUpdateTranscript = async (id, data) => {
    try {
      const updated = await updateTranscript(id, data);
      showNotification(`Note "${updated.title}" updated in PostgreSQL.`);
      await loadTranscripts(searchQuery);
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteTranscript = async (id) => {
    setIsDeleting(true);
    try {
      await deleteTranscript(id);
      showNotification('Note deleted from database.');
      setDeleteTarget(null);
      await loadTranscripts(searchQuery);
    } catch (err) {
      showNotification(`Failed to delete note: ${err.message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Compute stats
  const totalTranscriptsCount = transcripts.length;
  const lastRecordedTime = transcripts[0]?.created_at ? formatDateTime(transcripts[0].created_at) : 'None yet';

  // Mobile bottom-navigation: reuse the existing activeTab state and scroll to
  // the matching section. This is presentational only (no data/API logic).
  const handleNav = (tab) => {
    setActiveTab(tab);
    const targetId = tab === 'history' ? 'history-section' : 'dashboard-section';
    const el = document.getElementById(targetId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="dashboard-layout">
      {/* 1. Left Sidebar */}
      <aside className="left-sidebar">
        <div>
          <div className="brand-section">
            <div className="brand-logo-badge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <div className="brand-info">
              <h2>Speech Notes</h2>
              <p>Your voice, in words.</p>
            </div>
          </div>

          <nav className="nav-menu">
            <button
              type="button"
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>History</span>
            </button>
          </nav>
        </div>

        <div className="sidebar-bottom-status">
          <div className="bottom-status-line">
            <span className="status-dot online" />
            <span>Ready to transcribe</span>
          </div>
          <div className="bottom-status-sub">Microphone access granted</div>
        </div>
      </aside>

      {/* Main Wrapper */}
      <div className="main-wrapper">
        {/* Top Navbar */}
        <header className="top-navbar">
          <div className="mobile-brand">
            <div className="brand-logo-badge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <span className="mobile-brand-title">Speech Notes</span>
          </div>

          <div className="top-status-pill">
            <span className={`status-dot ${serverHealth.online ? 'online' : 'recording'}`} />
            <span className="pill-label-full">{serverHealth.online ? 'Backend Connected' : 'Connecting Backend...'}</span>
            <span className="pill-label-compact">{serverHealth.online ? 'Connected' : 'Connecting'}</span>
          </div>

          <div className="avatar-circle" title="User Account">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        </header>

        {/* Global Notifications */}
        {notification && (
          <div className="notification-wrapper">
            <div className={`notification-banner ${notification.type}`}>
              <span>{notification.message}</span>
            </div>
          </div>
        )}

        {/* Two-column body: Center Canvas + Right Sidebar */}
        <div className="content-body">
          {/* Center Canvas */}
          <main className="center-canvas" id="dashboard-section">
            <div className="greeting-section">
              <h1 className="greeting-title">
                Hello! <span>👋</span>
              </h1>
              <p className="greeting-subtitle">Speak naturally in English, Hindi, or a mix of both.</p>
            </div>

            {/* Voice Recorder & Live Transcript Cards */}
            <Recorder
              isRecording={isRecording}
              status={liveStatus}
              statusMessage={statusMessage}
              engine={engine}
              finalTranscript={finalTranscript}
              interimTranscript={interimTranscript}
              language={language}
              setLanguage={setLanguage}
              duration={duration}
              error={liveError}
              engineNotice={engineNotice}
              audioLevel={audioLevel}
              startRecording={startRecording}
              stopRecording={stopRecording}
              clearTranscript={clearTranscript}
              loadSampleTranscript={loadSampleTranscript}
              setFinalTranscript={setFinalTranscript}
              onSave={handleSaveTranscript}
            />

            {/* Recent Transcripts Summary Card */}
            <div className="dash-card">
              <div className="recent-summary-header">
                <div className="summary-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>Recent Transcripts</span>
                </div>
                <button
                  type="button"
                  className="link-view-all"
                  style={{ background: 'none', border: 'none' }}
                  onClick={() => setActiveTab('history')}
                >
                  View all &rarr;
                </button>
              </div>

              <div className="stats-grid">
                {/* 1. Total Transcripts */}
                <div className="stat-item-card">
                  <div className="stat-icon-wrapper">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div className="stat-label">Total Transcripts</div>
                  <div className="stat-value">{totalTranscriptsCount}</div>
                </div>

                {/* 2. Languages Detected */}
                <div className="stat-item-card">
                  <div className="stat-icon-wrapper">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1-4-10z" />
                    </svg>
                  </div>
                  <div className="stat-label">Languages Detected</div>
                  <div className="stat-value-sub">Hindi, English, Hinglish</div>
                </div>

                {/* 3. Last Recorded */}
                <div className="stat-item-card">
                  <div className="stat-icon-wrapper">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div className="stat-label">Last Recorded</div>
                  <div className="stat-value-sub" style={{ fontSize: '0.78rem' }}>{lastRecordedTime}</div>
                </div>

                {/* 4. Database */}
                <div className="stat-item-card">
                  <div className="stat-icon-wrapper">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <ellipse cx="12" cy="5" rx="9" ry="3" />
                      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                    </svg>
                  </div>
                  <div className="stat-label">Database</div>
                  <div className="stat-value-sub" style={{ color: '#059669' }}>
                    {serverHealth.db === 'neon-postgresql' ? 'Neon PostgreSQL' : 'PostgreSQL'}
                  </div>
                </div>
              </div>
            </div>
          </main>

          {/* Right Sidebar: Transcription History */}
          <TranscriptList
            transcriptions={transcripts}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isLoading={isLoadingList}
            error={listError}
            onView={(item) => setActiveModal({ mode: 'view', item })}
            onEdit={(item) => setActiveModal({ mode: 'edit', item })}
            onDelete={(item) => setDeleteTarget(item)}
          />
        </div>
      </div>

      {/* Mobile bottom navigation (hidden on tablet & desktop via CSS) */}
      <nav className="bottom-nav" aria-label="Primary navigation">
        <button
          type="button"
          className={`bottom-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleNav('dashboard')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => handleNav('history')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>History</span>
        </button>
      </nav>

      {/* Modals */}
      <TranscriptModal
        isOpen={Boolean(activeModal)}
        mode={activeModal?.mode}
        item={activeModal?.item}
        onClose={() => setActiveModal(null)}
        onSave={handleUpdateTranscript}
      />

      <ConfirmDelete
        isOpen={Boolean(deleteTarget)}
        item={deleteTarget}
        isDeleting={isDeleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteTranscript}
      />
    </div>
  );
}
