import crypto from 'crypto';

// In-memory fallback (starts empty) used ONLY when DATABASE_URL is missing.
// When DATABASE_URL is set but the connection fails, pool.js never calls into
// this module - it surfaces a clear error instead. This is a tiny SQL emulator
// that understands only the queries the transcripts controller issues.
const memoryDb = {
  transcripts: []
};

/**
 * Execute a transcripts query against the ephemeral in-memory store.
 * Returns a pg-like result object: { rows, rowCount }.
 */
export function runMemoryQuery(text, params = []) {
  const normalized = text.trim();
  const upper = normalized.toUpperCase();

  // SELECT NOW()
  if (upper.startsWith('SELECT NOW()')) {
    return { rows: [{ now: new Date().toISOString() }], rowCount: 1 };
  }

  // COUNT(*) FROM transcripts / transcriptions (checked before the generic SELECT)
  if (
    upper.includes('COUNT(*)') &&
    (upper.includes('FROM TRANSCRIPTS') || upper.includes('FROM TRANSCRIPTIONS'))
  ) {
    let list = [...memoryDb.transcripts];
    if (normalized.includes('ILIKE') && params[0]) {
      const term = String(params[0]).replace(/%/g, '').toLowerCase();
      list = list.filter((t) =>
        (t.title && t.title.toLowerCase().includes(term)) ||
        (t.content && t.content.toLowerCase().includes(term))
      );
    }
    return { rows: [{ count: String(list.length) }], rowCount: 1 };
  }

  // SELECT ... FROM transcripts / transcriptions
  if (
    upper.includes('SELECT') &&
    (upper.includes('FROM TRANSCRIPTS') || upper.includes('FROM TRANSCRIPTIONS'))
  ) {
    let list = [...memoryDb.transcripts];

    // Search by ID: WHERE id = $1
    const idMatch = normalized.match(/WHERE id = \$1/i);
    if (idMatch && params[0]) {
      const item = list.find((t) => t.id === params[0]);
      return { rows: item ? [item] : [], rowCount: item ? 1 : 0 };
    }

    // Search query (ILIKE)
    if (normalized.includes('ILIKE') && params[0]) {
      const term = String(params[0]).replace(/%/g, '').toLowerCase();
      list = list.filter((t) =>
        (t.title && t.title.toLowerCase().includes(term)) ||
        (t.content && t.content.toLowerCase().includes(term)) ||
        (t.transcript_text && t.transcript_text.toLowerCase().includes(term))
      );
    }

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Pagination: LIMIT $n OFFSET $m
    const limitMatch = normalized.match(/LIMIT \$(\d+)/i);
    const offsetMatch = normalized.match(/OFFSET \$(\d+)/i);

    if (limitMatch && offsetMatch) {
      const limitIdx = parseInt(limitMatch[1], 10) - 1;
      const offsetIdx = parseInt(offsetMatch[1], 10) - 1;
      const limit = parseInt(params[limitIdx], 10) || 20;
      const offset = parseInt(params[offsetIdx], 10) || 0;
      const paginated = list.slice(offset, offset + limit);
      return { rows: paginated, rowCount: list.length };
    }

    return { rows: list, rowCount: list.length };
  }

  // INSERT INTO transcripts / transcriptions
  if (upper.startsWith('INSERT INTO TRANSCRIPTS') || upper.startsWith('INSERT INTO TRANSCRIPTIONS')) {
    const [title, content, language, duration_seconds] = params;
    const now = new Date().toISOString();
    const newRecord = {
      id: crypto.randomUUID(),
      title,
      content,
      transcript_text: content, // compatibility alias
      language: language || 'auto',
      duration_seconds: duration_seconds || 0,
      created_at: now,
      updated_at: now
    };
    memoryDb.transcripts.unshift(newRecord);
    return { rows: [newRecord], rowCount: 1 };
  }

  // UPDATE transcripts / transcriptions
  if (upper.startsWith('UPDATE TRANSCRIPTS') || upper.startsWith('UPDATE TRANSCRIPTIONS')) {
    const [title, content, language, id] = params;
    const index = memoryDb.transcripts.findIndex((t) => t.id === id);
    if (index === -1) {
      return { rows: [], rowCount: 0 };
    }
    const updated = {
      ...memoryDb.transcripts[index],
      title,
      content,
      transcript_text: content, // compatibility alias
      language,
      updated_at: new Date().toISOString()
    };
    memoryDb.transcripts[index] = updated;
    return { rows: [updated], rowCount: 1 };
  }

  // DELETE FROM transcripts / transcriptions
  if (upper.startsWith('DELETE FROM TRANSCRIPTS') || upper.startsWith('DELETE FROM TRANSCRIPTIONS')) {
    const [id] = params;
    const index = memoryDb.transcripts.findIndex((t) => t.id === id);
    if (index === -1) {
      return { rows: [], rowCount: 0 };
    }
    const deleted = memoryDb.transcripts.splice(index, 1)[0];
    return { rows: [deleted], rowCount: 1 };
  }

  return { rows: [], rowCount: 0 };
}
