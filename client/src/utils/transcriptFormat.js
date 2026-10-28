// Shared presentation helpers for transcript cards, modals and dashboard stats.

const LANGUAGE_BADGES = {
  en: { label: 'English', className: 'english' },
  english: { label: 'English', className: 'english' },
  hi: { label: 'Hindi', className: 'hindi' },
  hindi: { label: 'Hindi', className: 'hindi' },
  'en-hi': { label: 'English + Hindi', className: 'hinglish' },
  hinglish: { label: 'English + Hindi', className: 'hinglish' }
};
const DEFAULT_BADGE = { label: 'Auto Detect', className: 'multilingual' };

export function getLanguageBadge(lang) {
  return LANGUAGE_BADGES[(lang || '').toLowerCase()] || DEFAULT_BADGE;
}

// "Oct 28, 2026 • 1:34 PM" - used by the history list and dashboard stat.
export function formatDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} • ${time}`;
}

// Locale-aware full timestamp - used by the view modal footer.
export function formatFullDateTime(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
