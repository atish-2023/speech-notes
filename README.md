# Speech Notes

A real-time, multilingual speech-to-text notes app. Speak in English, Hindi, or
mixed Hinglish and watch the transcript appear live, then save it to a database,
search it, edit it, or delete it from the history.

- **Frontend:** React + Vite (`client/`)
- **Backend:** Node + Express + WebSocket (`server/`)
- **Speech:** Gemini Live API, with a browser Web Speech API fallback
- **Database:** PostgreSQL (Neon), with an ephemeral in-memory store when no database is configured

## Project structure

```text
speech-notes/
├── client/            # React + Vite single-page app
│   ├── src/
│   │   ├── components/    # Recorder, TranscriptList, modals, ConfirmDelete
│   │   ├── hooks/         # useLiveTranscription, useTranscripts, useServerHealth
│   │   ├── services/      # api.js (REST calls)
│   │   ├── utils/         # transcript formatting helpers
│   │   ├── App.jsx        # Layout / composition
│   │   └── main.jsx       # Entry point
│   └── vite.config.js     # Dev server + /api proxy to the backend
└── server/            # Express + WebSocket backend
    └── src/
        ├── server.js      # HTTP + WS entry
        ├── app.js         # Express app, CORS, error handling
        ├── routes/        # /api/transcripts CRUD routes
        ├── controllers/   # Validate -> query -> respond
        ├── db/            # pool.js (Neon), memoryStore.js, schema.sql
        ├── services/      # speechService.js (Gemini Live)
        └── ws/            # liveSocket.js (audio relay)
```

## Running locally

You need two terminals, one for the server and one for the client.

### Backend (`server/`)

```bash
cd server
npm install
npm run dev          # starts Express + WebSocket on http://localhost:5000
```

Copy `server/.env.example` to `server/.env` and fill in the values below.

### Frontend (`client/`)

```bash
cd client
pnpm install
pnpm run dev         # starts Vite on http://localhost:5173 (proxies /api to :5000)
```

In development the client proxies `/api` and `/ws` to the backend, so the client
usually needs no environment variables.

## Environment variables

All are read by the backend (`server/.env`). Use your real values locally; the
values below are **placeholders**.

| Variable        | Purpose                                                        | Example (fake)                                                        |
|-----------------|----------------------------------------------------------------|----------------------------------------------------------------------|
| `DATABASE_URL`  | Neon PostgreSQL connection string                              | `postgresql://user:pass@ep-fake-123456.neon.tech/neondb?sslmode=require` |
| `GEMINI_API_KEY`| Google Gemini API key for live transcription                   | `AIza-fake-key-1234567890`                                           |
| `CLIENT_URL`    | Allowed browser origin for CORS / WebSocket (production only)  | `https://speech-notes.vercel.app`                                    |
| `PORT`          | Backend port                                                   | `5000`                                                               |

```bash
# server/.env (PLACEHOLDER VALUES)
DATABASE_URL=postgresql://user:pass@ep-fake-123456.neon.tech/neondb?sslmode=require
GEMINI_API_KEY=AIza-fake-key-1234567890
CLIENT_URL=https://speech-notes.vercel.app
PORT=5000
```

If `DATABASE_URL` is missing or is a placeholder, the server runs in an
**ephemeral in-memory mode** (notes are lost on restart). Secrets are never
committed: `.env` files are git-ignored, only `.env.example` is tracked.

## API overview

| Method   | Route                  | Description                                   |
|----------|------------------------|-----------------------------------------------|
| `GET`    | `/api/health`          | Service + database status                     |
| `GET`    | `/api/transcripts`     | List (newest first); supports `?search&page&limit` |
| `POST`   | `/api/transcripts`     | Create `{ title, content, language, duration_seconds }` |
| `PUT`    | `/api/transcripts/:id` | Update title / content / language             |
| `DELETE` | `/api/transcripts/:id` | Delete by UUID                                |

Live audio streams over the WebSocket at `/ws/transcribe`.
