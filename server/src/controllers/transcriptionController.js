import { query, getDbStatus, isUsingMemoryStore } from '../db/pool.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

// Express 4 does not catch rejected async handlers, so forward any thrown error
// to the central error middleware instead of repeating try/catch in each one.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function healthCheck(req, res) {
  return res.status(200).json({
    status: 'ok',
    service: 'Speech Notes API',
    timestamp: new Date().toISOString(),
    database: getDbStatus()
  });
}

// GET /api/transcripts - newest first, optional search, with pagination.
export const getTranscripts = asyncHandler(async (req, res) => {
  const { search, page, limit } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  let whereSql = '';
  const params = [];
  if (search && typeof search === 'string' && search.trim() !== '') {
    whereSql = ' WHERE title ILIKE $1 OR content ILIKE $1';
    params.push(`%${search.trim()}%`);
  }

  const countResult = await query(`SELECT COUNT(*) AS total FROM transcripts${whereSql}`, params);
  const totalCount = parseInt(countResult.rows[0]?.total ?? 0, 10);

  // LIMIT/OFFSET placeholders continue after the search param ($1 if present).
  params.push(limitNum, offset);
  const dataSql =
    `SELECT id, title, content, content AS transcript_text, language, duration_seconds, created_at, updated_at ` +
    `FROM transcripts${whereSql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const result = await query(dataSql, params);

  res.setHeader('X-Total-Count', String(totalCount));
  res.setHeader('X-Page', String(pageNum));
  res.setHeader('X-Limit', String(limitNum));

  if (page || limit) {
    return res.status(200).json({
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum)
      }
    });
  }
  return res.status(200).json(result.rows);
});

// GET /api/transcripts/:id
export const getTranscriptById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({ error: 'Invalid transcript ID format. Must be a valid UUID.' });
  }

  const sql = 'SELECT id, title, content, content AS transcript_text, language, duration_seconds, created_at, updated_at FROM transcripts WHERE id = $1';
  const result = await query(sql, [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Transcript not found' });
  }
  return res.status(200).json(result.rows[0]);
});

// POST /api/transcripts
export const createTranscript = asyncHandler(async (req, res) => {
  const { title, content, transcript_text, language = 'auto', duration_seconds = 0 } = req.body;

  const actualContent = (content || transcript_text || '').trim();
  if (!actualContent) {
    return res.status(400).json({ error: 'Transcript content is required and cannot be empty.' });
  }

  // Title is optional in the UI: derive it from the first few spoken words.
  const derivedTitle = typeof title === 'string' && title.trim() !== ''
    ? title.trim()
    : actualContent.split(/\s+/).slice(0, 6).join(' ') || 'Speech Note';
  const finalTitle = derivedTitle.length > 200 ? derivedTitle.slice(0, 197) + '...' : derivedTitle;

  const cleanLanguage = typeof language === 'string' && language.trim() !== '' ? language.trim().slice(0, 50) : 'auto';

  // duration_seconds defaults to 0; when present it must be an integer in
  // [0, 3600], matching the DB CHECK and the 5-minute session cap.
  const duration = Number(duration_seconds);
  if (!Number.isInteger(duration) || duration < 0 || duration > 3600) {
    return res.status(400).json({ error: 'duration_seconds must be an integer between 0 and 3600.' });
  }

  const sql = `
    INSERT INTO transcripts (title, content, language, duration_seconds)
    VALUES ($1, $2, $3, $4)
    RETURNING id, title, content, content AS transcript_text, language, duration_seconds, created_at, updated_at
  `;
  const result = await query(sql, [finalTitle, actualContent, cleanLanguage, duration]);

  // In ephemeral in-memory mode (no DATABASE_URL), flag that the note was NOT
  // persisted to Neon so the client can warn the user.
  if (isUsingMemoryStore()) {
    res.setHeader('X-Persistence', 'ephemeral');
    console.warn(
      'Saved a transcript to EPHEMERAL in-memory storage only (DATABASE_URL not set). It will be lost on restart.',
    );
  }

  return res.status(201).json(result.rows[0]);
});

// PUT /api/transcripts/:id
export const updateTranscript = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({ error: 'Invalid transcript ID format. Must be a valid UUID.' });
  }

  const { title, content, transcript_text, language } = req.body;
  const actualContent = (content || transcript_text || '').trim();

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title cannot be empty.' });
  }
  if (!actualContent) {
    return res.status(400).json({ error: 'Transcript content cannot be empty.' });
  }

  const trimmedTitle = title.trim().slice(0, 200);
  const cleanLanguage = typeof language === 'string' && language.trim() !== '' ? language.trim().slice(0, 50) : 'auto';

  const sql = `
    UPDATE transcripts
    SET title = $1, content = $2, language = $3, updated_at = NOW()
    WHERE id = $4
    RETURNING id, title, content, content AS transcript_text, language, duration_seconds, created_at, updated_at
  `;
  const result = await query(sql, [trimmedTitle, actualContent, cleanLanguage, id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Transcript not found' });
  }
  return res.status(200).json(result.rows[0]);
});

// DELETE /api/transcripts/:id
export const deleteTranscript = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({ error: 'Invalid transcript ID format. Must be a valid UUID.' });
  }

  const result = await query('DELETE FROM transcripts WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Transcript not found' });
  }
  return res.status(200).json({ message: 'Transcript deleted successfully', id });
});
