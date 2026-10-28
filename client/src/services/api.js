const rawBaseUrl = import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');
const API_BASE = rawBaseUrl.replace(/\/$/, '');

// Parse a response, throwing a clear Error for non-OK or non-JSON bodies.
async function handleResponse(response) {
  if (!response.ok) {
    let message = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const data = await response.json();
      message = data?.error || data?.message || message;
    } catch {
      // error body was not JSON
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;

  // The SPA returns index.html for an unknown or un-proxied /api route. Parsing
  // that HTML as JSON throws the cryptic "Unexpected token '<'" error, so we
  // detect the non-JSON content type first and report a clear message instead.
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const snippet = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 60);
    throw new Error(
      `API returned non-JSON (${contentType || 'unknown content-type'}): "${snippet}". ` +
      'Check that the backend is running and VITE_API_URL (or the /api dev proxy) points to it.'
    );
  }

  return response.json();
}

// Single fetch wrapper: prefixes API_BASE and adds JSON headers only when a
// body is sent (so GET/DELETE stay simple requests with no CORS preflight).
async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : options.headers
  });
  return handleResponse(res);
}

export function checkHealth() {
  return request('/health');
}

export async function fetchTranscripts(search = '', page = 1, limit = 50) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search.trim()) params.set('search', search.trim());

  // Backend returns { data: [...] } when paginated, otherwise a flat array.
  const result = await request(`/transcripts?${params}`);
  return Array.isArray(result) ? result : (result?.data ?? []);
}

export function createTranscript(data) {
  const body = JSON.stringify({
    title: data.title,
    content: data.content || data.transcript_text,
    language: data.language || 'auto',
    duration_seconds: data.duration_seconds || 0
  });
  return request('/transcripts', { method: 'POST', body });
}

export function updateTranscript(id, data) {
  const body = JSON.stringify({
    title: data.title,
    content: data.content || data.transcript_text,
    language: data.language || 'auto'
  });
  return request(`/transcripts/${encodeURIComponent(id)}`, { method: 'PUT', body });
}

export function deleteTranscript(id) {
  return request(`/transcripts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
