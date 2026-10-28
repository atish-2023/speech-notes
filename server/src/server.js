import http from 'http';
import 'dotenv/config';
import app from './app.js';
import { setupLiveSocket } from './ws/liveSocket.js';

const port = process.env.PORT || 5000;
const server = http.createServer(app);

// Attach the WebSocket server for real-time live transcription
setupLiveSocket(server);

server.listen(port, () => {
  console.log(`Speech Notes Server listening on port ${port}`);
  console.log(`- Health Check: http://localhost:${port}/api/health`);
  console.log(`- Transcriptions API: http://localhost:${port}/api/transcriptions`);
  console.log(`- WebSocket Live: ws://localhost:${port}/ws/transcribe`);
});
