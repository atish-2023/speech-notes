import { query, getDbStatus, isUsingMemoryStore } from '../db/pool.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

export async function healthCheck(req, res) {
  const dbStatus = getDbStatus();
  return res.status(200).json({
    status: 'ok',
    service: 'Speech Notes API',
    timestamp: new Date().toISOString(),
    database: dbStatus
  });
}

/**
 * GET /api/transcripts
 * Lists transcripts with newest first, optional search, and pagination.
 */
export async function getTranscripts(req, res, next) {
  try {
    const { search, page, limit } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    let baseSql = 'FROM transcripts';
    const params = [];

    if (search && typeof search === 'string' && search.trim() !== '') {
      baseSql += ' WHERE title ILIKE $1 OR content ILIKE $1';
      params.push(`%${search.trim()}%`);
    }

    // Total count query (the count is always aliased as "total").
    const countSql = `SELECT COUNT(*) AS total ${baseSql}`;
    const countResult = await query(countSql, params);
    const totalCount = parseInt(countResult.rows[0]?.total ?? 0, 10);

    // Data query: same columns, newest first.
    let dataSql = `SELECT id, title, content, content AS transcript_text, language, duration_seconds, created_at, updated_at ${baseSql} ORDER BY created_at DESC`;

    // Append LIMIT/OFFSET using explicit 1-based placeholder indices so the
    // generated SQL stays obvious ($1 may already be taken by the search term).
    const limitParamIndex = params.length + 1;
    const offsetParamIndex = params.length + 2;
    params.push(limitNum, offset);
    dataSql += ` LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`;

    const result = await query(dataSql, params);

    // Set pagination headers
    res.setHeader('X-Total-Count', String(totalCount));
    res.setHeader('X-Page', String(pageNum));
    res.setHeader('X-Limit', String(limitNum));

    // When requested via pagination or standard API, return data with metadata or direct array
    // To maintain compatibility with both array consumers and pagination consumers:
    const rows = result.rows || [];
    
    if (page || limit) {
      return res.status(200).json({
        data: rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum)
        }
      });
    }

    return res.status(200).json(rows);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/transcripts/:id
 */
export async function getTranscriptById(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ error: 'Invalid transcript ID format. Must be a valid UUID.' });
    }

    const sql = 'SELECT id, title, content, content AS transcript_text, language, duration_seconds, created_at, updated_at FROM transcripts WHERE id = $1';
    const result = await query(sql, [id]);

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/transcripts
 */
export async function createTranscript(req, res, next) {
  try {
    const { title, content, transcript_text, language = 'auto', duration_seconds = 0 } = req.body;

    const actualContent = (content || transcript_text || '').trim();

    if (!actualContent) {
      return res.status(400).json({ error: 'Transcript content is required and cannot be empty.' });
    }

    // If title was left blank (as it is marked optional in UI), auto-derive title from speech content
    let finalTitle = typeof title === 'string' && title.trim() !== ''
      ? title.trim().slice(0, 200)
      : actualContent.split(/\s+/).slice(0, 6).join(' ') || 'Speech Note';

    if (finalTitle.length > 200) {
      finalTitle = finalTitle.slice(0, 197) + '...';
    }

    const cleanLanguage = typeof language === 'string' && language.trim() !== '' ? language.trim().slice(0, 50) : 'auto';
    const duration = Math.max(0, parseInt(duration_seconds, 10) || 0);

    const sql = `
      INSERT INTO transcripts (title, content, language, duration_seconds)
      VALUES ($1, $2, $3, $4)
      RETURNING id, title, content, content AS transcript_text, language, duration_seconds, created_at, updated_at
    `;
    const result = await query(sql, [finalTitle, actualContent, cleanLanguage, duration]);

    // When running in the ephemeral in-memory mode (no DATABASE_URL), make it
    // obvious to the client that the note was NOT persisted to Neon.
    if (isUsingMemoryStore()) {
      res.setHeader('X-Persistence', 'ephemeral');
      console.warn(
        'Saved a transcript to EPHEMERAL in-memory storage only (DATABASE_URL not set). It will be lost on restart.',
      );
    }

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/transcripts/:id
 */
export async function updateTranscript(req, res, next) {
  try {
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

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/transcripts/:id
 */
export async function deleteTranscript(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ error: 'Invalid transcript ID format. Must be a valid UUID.' });
    }

    const sql = 'DELETE FROM transcripts WHERE id = $1 RETURNING id';
    const result = await query(sql, [id]);

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    return res.status(200).json({ message: 'Transcript deleted successfully', id });
  } catch (err) {
    next(err);
  }
}
