// Clean API base: normalize leading/trailing slashes and ensure valid URL
let envApiUrl = import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');
if (envApiUrl.endsWith('/')) {
  envApiUrl = envApiUrl.slice(0, -1);
}
const API_BASE = envApiUrl;

/**
 * Handle API responses with clear JSON error extraction
 */
async function handleResponse(response) {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const data = await response.json();
      if (data && (data.error || data.message)) {
        errorMessage = data.error || data.message;
      }
    } catch {
      // response was not JSON
    }
    throw new Error(errorMessage);
  }

  // Handle empty bodies (e.g. 204 No Content)
  if (response.status === 204) return null;

  // Guard against the SPA returning index.html for an unknown or un-proxied
  // /api route. Parsing that HTML as JSON throws the cryptic
  // "Unexpected token '<', <!doctype ... is not valid JSON" error.
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 60);
    throw new Error(
      `API returned non-JSON (${contentType || 'unknown content-type'}): "${snippet}". ` +
      `Check that the backend is running and VITE_API_URL (or the /api dev proxy) points to it.`
    );
  }

  return response.json();
}

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return handleResponse(res);
}

export async function fetchTranscripts(search = '', page = 1, limit = 50) {
  const params = new URLSearchParams();
  if (search && search.trim()) params.append('search', search.trim());
  if (page) params.append('page', String(page));
  if (limit) params.append('limit', String(limit));

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/transcripts${queryStr}`);
  const result = await handleResponse(res);

  // Normalize both paginated object { data: [...] } and flat array [...]
  if (result && Array.isArray(result.data)) {
    return result.data;
  }
  return Array.isArray(result) ? result : [];
}

export async function createTranscript(data) {
  const payload = {
    title: data.title,
    content: data.content || data.transcript_text,
    language: data.language || 'auto',
    duration_seconds: data.duration_seconds || 0
  };

  const res = await fetch(`${API_BASE}/transcripts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleResponse(res);
}

export async function updateTranscript(id, data) {
  const payload = {
    title: data.title,
    content: data.content || data.transcript_text,
    language: data.language || 'auto'
  };

  const res = await fetch(`${API_BASE}/transcripts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleResponse(res);
}

export async function deleteTranscript(id) {
  const res = await fetch(`${API_BASE}/transcripts/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return handleResponse(res);
}
