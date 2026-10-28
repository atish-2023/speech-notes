import { GoogleGenAI } from '@google/genai';

/**
 * SpeechService provides an abstraction layer over live speech-to-text.
 * Model: gemini-3.5-transcribe-live
 */
export class SpeechService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.session = null;
    this.interimCallbacks = [];
    this.finalCallbacks = [];
    this.errorCallbacks = [];
    this.isOpen = false;
  }

  onInterim(cb) {
    if (typeof cb === 'function') this.interimCallbacks.push(cb);
  }

  onFinal(cb) {
    if (typeof cb === 'function') this.finalCallbacks.push(cb);
  }

  onError(cb) {
    if (typeof cb === 'function') this.errorCallbacks.push(cb);
  }

  emitInterim(text) {
    for (const cb of this.interimCallbacks) {
      try { cb(text); } catch (e) { console.error('Error in onInterim callback:', e); }
    }
  }

  emitFinal(text) {
    for (const cb of this.finalCallbacks) {
      try { cb(text); } catch (e) { console.error('Error in onFinal callback:', e); }
    }
  }

  emitError(err) {
    for (const cb of this.errorCallbacks) {
      try { cb(err); } catch (e) { console.error('Error in onError callback:', e); }
    }
  }

  /**
   * Connect to Gemini Live API with timeout protection and explicit close/error rejection
   */
  async _connectModelWithTimeout(ai, modelName, transcriptionConfig, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Live session connection to ${modelName} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      const handleMessage = (msg) => {
        try {
          const sc = msg.serverContent;
          if (!sc) return;

          // Check interim hypotheses
          const interimText =
            sc.interimInputTranscription?.text ||
            sc.interim_input_transcription?.text;

          if (interimText && interimText.trim() !== '') {
            this.emitInterim(interimText);
          }

          // Check finalized transcripts
          let finalText =
            sc.inputTranscription?.text ||
            sc.input_transcription?.text ||
            (sc.inputTranscription?.parts && sc.inputTranscription.parts.map(p => p.text).filter(Boolean).join(' ')) ||
            (sc.modelTurn?.parts && sc.modelTurn.parts.map(p => p.text).filter(Boolean).join(' '));

          if (finalText && finalText.trim() !== '') {
            this.emitFinal(finalText);
          }
        } catch (err) {
          console.error('Error parsing live transcription message:', err);
        }
      };

      ai.live.connect({
        model: modelName,
        config: {
          responseModalities: ['TEXT'],
          inputAudioTranscription: transcriptionConfig
        },
        callbacks: {
          onopen: () => {
            this.isOpen = true;
          },
          onmessage: handleMessage,
          onerror: (e) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              reject(e instanceof Error ? e : new Error(String(e || 'Live session error')));
            } else {
              this.emitError(e);
            }
          },
          onclose: (e) => {
            this.isOpen = false;
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              reject(new Error(`Live connection closed before setup complete: ${e?.reason || e?.code || 'Closed'}`));
            }
          }
        }
      })
        .then((session) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(session);
          }
        })
        .catch((err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(err);
          }
        });
    });
  }

  /**
   * Start a real-time transcription session.
   * @param {Object} options - { language: 'auto' | 'en' | 'hi' | 'en-hi' }
   */
  async startSession(options = {}) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured on the server. Please set it in your environment or Settings > Secrets.');
    }

    const ai = new GoogleGenAI({
      apiKey: this.apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const lang = options.language || 'auto';
    let languageCodes = [];
    if (lang === 'en') languageCodes = ['en-US', 'en'];
    else if (lang === 'hi') languageCodes = ['hi-IN', 'hi'];
    else if (lang === 'en-hi' || lang === 'hinglish') languageCodes = ['en-IN', 'hi-IN'];

    const transcriptionConfig = languageCodes.length > 0 ? { languageCodes } : {};

    const modelName = 'gemini-3.5-transcribe-live';
    try {
      this.session = await this._connectModelWithTimeout(ai, modelName, transcriptionConfig, 7000);
      this.isOpen = true;
      return { model: modelName };
    } catch (err) {
      this.emitError(err);
      throw err;
    }
  }

  /**
   * Send binary or base64 PCM16 audio chunk (16kHz, mono).
   * @param {Buffer|ArrayBuffer|string} chunk 
   */
  sendAudio(chunk) {
    if (!this.session || !this.isOpen) return;

    let base64Audio = '';
    if (Buffer.isBuffer(chunk)) {
      base64Audio = chunk.toString('base64');
    } else if (chunk instanceof ArrayBuffer) {
      base64Audio = Buffer.from(chunk).toString('base64');
    } else if (typeof chunk === 'string') {
      base64Audio = chunk;
    }

    if (!base64Audio) return;

    try {
      this.session.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType: 'audio/pcm;rate=16000'
        }
      });
    } catch (err) {
      console.error('Error sending audio frame to Gemini session:', err);
      this.emitError(err);
    }
  }

  /**
   * Closes the underlying session cleanly.
   */
  close() {
    this.isOpen = false;
    if (this.session) {
      try {
        if (typeof this.session.close === 'function') {
          this.session.close();
        }
      } catch (err) {
        console.warn('Error while closing Gemini live session:', err);
      }
      this.session = null;
    }
    this.interimCallbacks = [];
    this.finalCallbacks = [];
    this.errorCallbacks = [];
  }
}
