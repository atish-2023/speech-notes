import { WebSocketServer, WebSocket } from 'ws';
import { SpeechService } from '../services/speechService.js';

const MAX_CONCURRENT_SESSIONS = 5;
const MAX_SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minutes

let activeSessionCount = 0;

/**
 * Validates the WebSocket request origin.
 * Enforcement is limited to production: in development any origin is allowed so
 * testing from localhost and other devices on the local network keeps working.
 */
function isOriginAllowed(origin) {
  // Development (and any non-production run): allow every origin.
  if (process.env.NODE_ENV !== 'production') return true;

  // Direct / same-origin / non-browser upgrades send no (or a "null") Origin.
  if (!origin || origin === 'null') return true;

  const clientUrl = process.env.CLIENT_URL;

  // Explicit wildcard keeps the previous allow-everyone behavior.
  if (clientUrl === '*') return true;

  // Production without a configured CLIENT_URL fails closed.
  if (!clientUrl) return false;

  try {
    return origin === new URL(clientUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Attach the WebSocket server to the HTTP server for real-time live transcription.
 */
export function setupLiveSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const hostHeader = request.headers.host || 'localhost';
    const { pathname } = new URL(request.url, `http://${hostHeader}`);

    if (pathname === '/ws/transcribe') {
      const origin = request.headers.origin;
      if (!isOriginAllowed(origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    if (activeSessionCount >= MAX_CONCURRENT_SESSIONS) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Server has reached maximum concurrent transcription sessions. Please try again shortly.'
      }));
      ws.close(1008, 'Max concurrent sessions exceeded');
      return;
    }

    activeSessionCount++;
    let speechService = null;
    let sessionTimeout = null;
    let isSessionActive = false;

    const sendJson = (payload) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    };

    const cleanup = () => {
      if (sessionTimeout) {
        clearTimeout(sessionTimeout);
        sessionTimeout = null;
      }
      if (speechService) {
        speechService.close();
        speechService = null;
      }
      if (isSessionActive) {
        isSessionActive = false;
        activeSessionCount = Math.max(0, activeSessionCount - 1);
      }
    };

    ws.on('message', async (message, isBinary) => {
      // NOTE: In Node ws library, message is always a Buffer, but isBinary is only true for binary frames!
      if (isBinary) {
        if (speechService && isSessionActive) {
          speechService.sendAudio(message);
        }
        return;
      }

      // Handle JSON control messages (text frames)
      try {
        const text = message.toString('utf8');
        const data = JSON.parse(text);

        if (data.type === 'start') {
          if (!process.env.GEMINI_API_KEY) {
            sendJson({
              type: 'error',
              message: 'GEMINI_API_KEY is missing on the server. Please check your environment variables.'
            });
            return;
          }

          cleanup();
          isSessionActive = true;
          speechService = new SpeechService();

          speechService.onInterim((interimText) => {
            sendJson({ type: 'interim', text: interimText });
          });

          speechService.onFinal((finalText) => {
            sendJson({ type: 'final', text: finalText });
          });

          speechService.onError((err) => {
            console.error('Speech service error:', err.message || err);
            sendJson({
              type: 'error',
              message: err.message || 'Speech recognition encountered an error.'
            });
          });

          sendJson({ type: 'status', status: 'connecting' });

          try {
            const { model } = await speechService.startSession({ language: data.language || 'auto' });

            sendJson({
              type: 'status',
              status: 'recording',
              model: model
            });

            // Enforce maximum session duration (5 minutes)
            sessionTimeout = setTimeout(() => {
              sendJson({
                type: 'error',
                message: 'Maximum session limit of 5 minutes reached. Session closed to prevent abuse.'
              });
              sendJson({ type: 'status', status: 'stopped' });
              cleanup();
            }, MAX_SESSION_DURATION_MS);
          } catch (err) {
            console.error('Failed to establish live session:', err.message);
            sendJson({
              type: 'error',
              message: err.message || 'Failed to start Gemini Live transcription session.'
            });
            cleanup();
          }
        } else if (data.type === 'audio' && data.data) {
          if (speechService && isSessionActive) {
            speechService.sendAudio(data.data);
          }
        } else if (data.type === 'stop') {
          sendJson({ type: 'status', status: 'stopped' });
          cleanup();
        }
      } catch (err) {
        console.error('Malformed WebSocket message:', err.message);
      }
    });

    ws.on('close', () => {
      cleanup();
    });

    ws.on('error', (err) => {
      console.warn('Client WebSocket error:', err.message);
      cleanup();
    });
  });

  return wss;
}
