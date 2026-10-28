# Speech Notes ("Your voice, in words.")

Real-time multilingual speech-to-text web application built for the **Procucev AI** tech hiring assignment.

- **Live Deployed App**: [https://ais-pre-wojtatwrexka7omhmaqpbc-2275519414.asia-southeast1.run.app](https://ais-pre-wojtatwrexka7omhmaqpbc-2275519414.asia-southeast1.run.app)
- **Backend Health Check**: [https://ais-pre-wojtatwrexka7omhmaqpbc-2275519414.asia-southeast1.run.app/api/health](https://ais-pre-wojtatwrexka7omhmaqpbc-2275519414.asia-southeast1.run.app/api/health)
- **GitHub Repository**: [https://github.com/atishpawar/speech-notes](https://github.com/atishpawar/speech-notes)

---

## 1. Project Audit & Root-Cause Analysis

### Audit Findings
1. **Database Schema & Resource Naming**: Aligned table to `transcripts` (`id`, `title`, `content`, `language`, `duration_seconds`, `created_at`, `updated_at`) and REST endpoints to `/api/transcripts` with pagination (`page`, `limit`), while retaining `/api/transcriptions` and `transcript_text` for backward compatibility.
2. **`ENOTFOUND base` Root Cause**: In Node.js, `ENOTFOUND <host>` occurs when `dns.lookup()` fails to resolve a hostname. If a configuration or environment file specifies a placeholder database host (e.g. `postgresql://user:password@base:5432/...`) or if an API URL is unanchored (e.g. `fetch("base/api/health")`), the HTTP/database client treats `"base"` as an unqualified remote hostname and attempts a DNS query, triggering `getaddrinfo ENOTFOUND base`. The codebase now strictly sanitizes URL bases and provides a safe in-memory fallback if `DATABASE_URL` is unconfigured or points to an unresolved placeholder.
3. **Real-Time Streaming Engine**: Audio is captured via browser `getUserMedia`, processed through an AudioWorklet (`/pcm-worklet.js`) to downsample and encode into mono 16-bit linear PCM at 16,000 Hz, and streamed over a WebSocket (`/ws/transcribe`) to Gemini Live API (`gemini-3.5-transcribe-live`, with fallback to `gemini-3.1-flash-live-preview` and `gemini-3.8-live`).
4. **Transparent Fallback**: If Gemini Live API access is unavailable or quota-limited, the application gracefully activates the browser Web Speech API fallback, with an explicit, honest banner alerting the user rather than falsely claiming Gemini is connected.

---

## 2. Architecture Overview

```text
+-----------------------------------------------------------------------------------+
|                                  BROWSER (CLIENT)                                 |
|                                                                                   |
|  [getUserMedia (Mic)] --> [AudioWorklet: 16kHz Mono PCM16]                        |
|                                     |                                             |
|                                     v (Binary WS Frame)                           |
|       +--------------------------------------------------------------------+      |
|       |                     useLiveTranscription Hook                      |      |
|       |  - Interim Text (italics, replaced in real time)                   |      |
|       |  - Final Text (normal, appended once)                              |      |
|       |  - Fallback: Browser Web Speech API if Live API unreachable        |      |
|       +--------------------------------------------------------------------+      |
|                                     |                                             |
+-------------------------------------|---------------------------------------------+
                                      | WebSocket (/ws/transcribe)
                                      | HTTP REST (/api/transcripts)
                                      v
+-----------------------------------------------------------------------------------+
|                             NODE.JS + EXPRESS BACKEND                             |
|                                                                                   |
|  [liveSocket.js]                                                                  |
|   - Origin Validation (CLIENT_URL)                                                |
|   - Concurrency Limiter (Max 3 sessions)                                         |
|   - Session Timeout Guard (5 min cap)                                             |
|   - Relays 16kHz PCM audio to Gemini Live API via @google/genai                   |
|                                                                                   |
|  [speechService.js] (Abstraction Layer)                                           |
|   - Candidate 1: gemini-3.5-transcribe-live (Verified)                           |
|   - Candidate 2: gemini-3.8-live (Verified)                                       |
|   - Candidate 3: gemini-3.1-flash-live-preview                                   |
|                                                                                   |
|  [transcriptionController.js] (REST CRUD)                                         |
|   - Parameterized queries with UUID validation                                    |
|   - Pagination (page, limit) and ILIKE search                                     |
|   - Central error handler (no stack trace or credential leak)                     |
+-------------------------------------|---------------------------------------------+
                                      | pg Pool (SSL enabled)
                                      v
+-----------------------------------------------------------------------------------+
|                           NEON POSTGRESQL DATABASE                                |
|   - Table: transcripts (UUID PK, title, content, language, duration_seconds)      |
|   - Index: idx_transcripts_created_at_desc                                        |
+-----------------------------------------------------------------------------------+
```

---

## 3. Directory Structure

```text
speech-notes/
├── client/
│   ├── public/
│   │   └── pcm-worklet.js              # AudioWorklet processor: downsamples & converts Float32 to PCM16
│   ├── src/
│   │   ├── components/
│   │   │   ├── Recorder.jsx            # Mic button, timer, language selector, live transcript, engine badge
│   │   │   ├── TranscriptList.jsx      # Searchable cards, badges, date/duration, action buttons
│   │   │   ├── TranscriptModal.jsx     # Read-only view with copy action + edit modal
│   │   │   └── ConfirmDelete.jsx       # Irreversible deletion modal
│   │   ├── hooks/
│   │   │   └── useLiveTranscription.js # Manages mic, AudioContext, worklet, WebSocket & Web Speech fallback
│   │   ├── services/
│   │   │   └── api.js                  # Clean fetch wrapper for REST API endpoints
│   │   ├── App.jsx                     # Single dashboard composition & state
│   │   ├── main.jsx                    # React 19 entry point
│   │   └── styles.css                  # Lightweight, responsive plain CSS
│   ├── .env.example
│   ├── vercel.json                     # Vercel SPA rewrite config
│   └── package.json
├── server/
│   ├── src/
│   │   ├── db/
│   │   │   ├── pool.js                 # pg Pool with SSL + fallback in-memory emulator
│   │   │   └── schema.sql              # PostgreSQL schema with UUID primary keys & indexes
│   │   ├── routes/
│   │   │   └── transcriptionRoutes.js  # REST routes (/api/transcripts)
│   │   ├── controllers/
│   │   │   └── transcriptionController.js # Input validation, 400/404 handling, pagination
│   │   ├── services/
│   │   │   └── speechService.js        # Speech provider interface (Gemini Live candidate models)
│   │   ├── ws/
│   │   │   └── liveSocket.js           # WebSocket relay, abuse protection, session caps
│   │   ├── app.js                      # Express configuration & CORS
│   │   └── server.js                   # Standalone HTTP + WS server entry
│   ├── .env.example
│   └── package.json
├── server.ts                           # Unified full-stack runner for development & testing
├── .gitignore
└── README.md
```

---

## 4. Database Setup (Neon PostgreSQL)

1. Create a project on [Neon](https://neon.tech).
2. Open the **SQL Editor** in your Neon dashboard.
3. Paste and run the schema from `server/src/db/schema.sql`:
   ```sql
   CREATE EXTENSION IF NOT EXISTS "pgcrypto";

   CREATE TABLE IF NOT EXISTS transcripts (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       title VARCHAR(200) NOT NULL,
       content TEXT NOT NULL,
       language VARCHAR(50) NOT NULL DEFAULT 'auto',
       duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   CREATE INDEX IF NOT EXISTS idx_transcripts_created_at_desc ON transcripts (created_at DESC);

   -- Backward compatibility view if older queries reference transcriptions
   CREATE OR REPLACE VIEW transcriptions AS 
   SELECT id, title, content AS transcript_text, content, language, duration_seconds, created_at, updated_at 
   FROM transcripts;
   ```
4. Copy the connection string (prefer the **Pooled** connection string with `?sslmode=require`).

---

## 5. Local Setup & Running

### Windows (PowerShell)

```powershell
# 1. Clone repository
git clone https://github.com/atishpawar/speech-notes.git
cd speech-notes

# 2. Install dependencies
npm install

# 3. Configure environment variables
Copy-Item .env.example .env
# Edit .env with your GEMINI_API_KEY and DATABASE_URL

# 4. Start full-stack development server
npm run dev
```

### Linux / macOS (Bash)

```bash
# 1. Clone repository
git clone https://github.com/atishpawar/speech-notes.git
cd speech-notes

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your keys

# 4. Start development server
npm run dev
```

The unified app opens at `http://localhost:3000`.

---

## 6. REST API Endpoints & Verification

### Endpoints
- `GET /api/health` — Returns status, timestamp, and database connectivity.
- `GET /api/transcripts` — Returns newest transcripts first. Supports `?search=term` and pagination `?page=1&limit=20`.
- `GET /api/transcripts/:id` — Returns single transcript by UUID.
- `POST /api/transcripts` — Creates transcript (`{ title, content, language, duration_seconds }`).
- `PUT /api/transcripts/:id` — Updates transcript title, content, language, and `updated_at`.
- `DELETE /api/transcripts/:id` — Deletes transcript by UUID.

### curl & PowerShell Test Commands

```bash
# Health Check
curl -X GET http://localhost:3000/api/health

# Create Transcript
curl -X POST http://localhost:3000/api/transcripts \
  -H "Content-Type: application/json" \
  -d '{"title":"Engineering Standup","content":"Today we deployed real-time Hinglish speech-to-text.","language":"en-hi","duration_seconds":30}'

# List Transcripts with Search and Pagination
curl -X GET "http://localhost:3000/api/transcripts?search=Standup&page=1&limit=10"

# Fetch by ID
curl -X GET http://localhost:3000/api/transcripts/<UUID>

# Update by ID
curl -X PUT http://localhost:3000/api/transcripts/<UUID> \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Standup","content":"Updated content verified.","language":"en"}'

# Delete by ID
curl -X DELETE http://localhost:3000/api/transcripts/<UUID>

# Error Handling Validation (400 on empty body, 400 on invalid UUID, 404 on missing UUID)
curl -i -X POST http://localhost:3000/api/transcripts -H "Content-Type: application/json" -d '{}'
curl -i -X GET http://localhost:3000/api/transcripts/invalid-uuid
curl -i -X GET http://localhost:3000/api/transcripts/00000000-0000-0000-0000-000000000000
```

---

## 7. Testing Microphone & Hinglish Transcription

1. Open the app in **Google Chrome**, **Edge**, or **Safari** over `http://localhost:3000` or HTTPS.
2. Select language from the dropdown:
   - **English + Hindi (Hinglish)**: Configures language hints for mixed Hindi and English speech (`en-IN`, `hi-IN`).
   - **Hindi (हिंदी)**: Optimizes for Devanagari script.
   - **English**: Optimizes for English vocabulary.
   - **Auto-Detect**: Automatic detection.
3. Click the large green **Microphone** button or **"Start Speaking"**.
4. Speak naturally: *"Aaj hum speech-to-text project deliver kar rahe hain with PostgreSQL and Gemini Live."*
5. Watch the live transcript card:
   - **Interim text**: Shows in muted italics as you speak and continuously updates.
   - **Final text**: Commits into normal style without duplicate sentences.
6. Click **Stop Recording**. The mic track stops immediately, and the final text remains preserved.
7. Edit the auto-suggested title if desired, and click **Save Transcript**.
8. The note immediately appears at the top of the **Saved Transcripts** list below.

---

## 8. Deployment Guide

### A. Neon (Database)
1. In Neon dashboard, copy your **Pooled Connection String**.
2. Run `server/src/db/schema.sql` in Neon SQL Editor.

### B. Render (Backend Server)
1. Create a **New Web Service** connected to your GitHub repo.
2. Set:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/server.js`
   - **Health Check Path**: `/api/health`
3. Environment variables:
   - `DATABASE_URL`: Your Neon pooled connection string.
   - `GEMINI_API_KEY`: Your Google Gen AI key.
   - `CLIENT_URL`: `https://your-app.vercel.app` (your frontend URL).
4. Render provides an HTTPS URL (e.g. `https://speech-notes-api.onrender.com`).

### C. Vercel (Frontend Client)
1. Create a **New Project** on Vercel from your GitHub repository.
2. Set:
   - **Root Directory**: `client`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Environment variables:
   - `VITE_API_URL`: `https://speech-notes-api.onrender.com/api`
   - `VITE_WS_URL`: `wss://speech-notes-api.onrender.com/ws/transcribe`
4. Deploy. Copy your Vercel URL and ensure it matches `CLIENT_URL` in Render.

---

## 9. Swapping with Open-Source Speech Engines

All provider code is isolated in `server/src/services/speechService.js`. To replace Gemini Live with an open-source engine (such as [faster-whisper](https://github.com/SYSTRAN/faster-whisper) or [whisper.cpp](https://github.com/ggerganov/whisper.cpp) running on a GPU instance):

1. Expose a WebSocket on the open-source runner taking 16kHz PCM chunks.
2. Update `SpeechService` in `server/src/services/speechService.js` to pipe PCM buffers to that runner.
3. The rest of the app (`liveSocket.js`, `useLiveTranscription.js`, `Recorder.jsx`, and the UI) requires zero modifications because it relies strictly on the 6 standard interface methods:
   - `startSession(options)`
   - `sendAudio(chunk)`
   - `onInterim(callback)`
   - `onFinal(callback)`
   - `onError(callback)`
   - `close()`

---

## 10. Implemented Features & Honest Limitations

### Implemented Features
- **Real-Time Live Audio Streaming**: Browser AudioWorklet captures mic audio, downsamples/converts to mono 16-bit linear PCM at 16,000 Hz, and streams over WebSockets.
- **Dual Hypothesis Separation**: Interim speculative hypotheses are rendered in muted italics; final speech segments are appended cleanly without duplicate sentences.
- **Multilingual Support**: Supports English, Hindi, and mixed English + Hindi (Hinglish) with language hints.
- **Transparent Web Speech API Fallback**: If Gemini Live API access is unavailable or quota-limited, gracefully falls back to browser Web Speech API with an honest UI notification banner.
- **Full PostgreSQL CRUD**: Parameterized SQL queries on Neon with UUID primary keys, ILIKE search, pagination, title/content validation, and timestamps.
- **Abuse Protection**: Client origin verification, concurrent session cap (max 3), 5-minute session timeout enforcement, and automatic cleanup on browser socket disconnects.
- **Single Page Responsive UX**: Status pill showing real-time backend/database reachability, timer, copy-to-clipboard, view/edit modals, and delete confirmations.

### Honest Limitations
- **Render Free Tier Spin-Down**: Free Render instances sleep after 15 minutes of inactivity; initial cold starts can take 30–50 seconds.
- **Gemini Live Availability**: The dedicated `gemini-3.5-transcribe-live` model may require specific API tier access; fallback models (`gemini-3.1-flash-live-preview`, `gemini-3.8-live`) or browser Web Speech API are used if unavailable.
- **Hinglish Script Rendering**: Mixed Hindi and English speech may transcribe some words in Devanagari (e.g. "नमस्ते") and others in Latin script ("Hello") based on model token probabilities.
- **Shared History**: As required for this MVP, there is no user login system; the transcription history in PostgreSQL is shared across users.
