// Shared presentation helpers for transcript cards and modals.
// Kept separate from components so the history list, the view/edit modal and
// the dashboard stats all format language badges and dates identically.

export function getLanguageBadge(lang) {
  const l = (lang || '').toLowerCase();
  if (l === 'en' || l === 'english') {
    return { label: 'English', className: 'english' };
  }
  if (l === 'hi' || l === 'hindi') {
    return { label: 'Hindi', className: 'hindi' };
  }
  if (l === 'en-hi' || l === 'hinglish') {
    return { label: 'English + Hindi', className: 'hinglish' };
  }
  if (l === 'auto') {
    return { label: 'Auto Detect', className: 'multilingual' };
  }
  return { label: 'Auto Detect', className: 'multilingual' };
}

// "Oct 28, 2026 • 1:34 PM" - used by the history list and dashboard stat.
export function formatDateTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }) + ' • ' + d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return isoString;
  }
}

// Locale-aware full timestamp - used by the view/edit modal footer.
export function formatFullDateTime(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoString;
  }
}
