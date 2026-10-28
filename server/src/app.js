import express from 'express';
import cors from 'cors';
import transcriptionRoutes from './routes/transcriptionRoutes.js';
import { healthCheck } from './controllers/transcriptionController.js';
import { getDbStatus } from './db/pool.js';

const app = express();

const clientUrl = process.env.CLIENT_URL;
const isProduction = process.env.NODE_ENV === 'production';

// CORS origins:
// - Production: ONLY the configured CLIENT_URL (fail closed if it is missing),
//   so random sites cannot call the API with credentials.
// - Development: CLIENT_URL (if set) plus any origin, so testing from other
//   localhost ports or a phone on the local network keeps working.
let corsOrigin;
if (isProduction) {
  corsOrigin = clientUrl || false;
} else {
  corsOrigin = clientUrl ? [clientUrl, 'http://localhost:5173', 'http://localhost:3000'] : true;
}

app.use(cors({
  origin: corsOrigin,
  credentials: true
}));

app.use(express.json());

// API health endpoint
app.get('/api/health', healthCheck);

// Primary assignment endpoints: /api/transcripts
app.use('/api/transcripts', transcriptionRoutes);

// Backward compatibility alias: /api/transcriptions
app.use('/api/transcriptions', transcriptionRoutes);

// Central Error Handler (never leaks stack traces or credentials)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Server error:', err.message || err);
  const status = err.status || 500;
  // Preserve clear, safe messages the app intentionally surfaces (e.g. a
  // 400 validation error or a 503 "data was NOT saved" database error),
  // while keeping generic wording for unexpected internal failures.
  const exposeMessage =
    status === 400 ||
    status === 503 ||
    err.code === 'DB_UNAVAILABLE';
  return res.status(status).json({
    error: exposeMessage
      ? err.message
      : 'Internal server error occurred.',
    database: err.code === 'DB_UNAVAILABLE' ? getDbStatus() : undefined
  });
});

export default app;
