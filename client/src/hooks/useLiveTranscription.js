import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Inlined AudioWorklet Processor code as a self-contained string.
 * This guarantees that AudioWorklet loads instantly without network roundtrips,
 * MIME type errors, or iframe sandbox cross-origin fetch restrictions.
 */
const WORKLET_PROCESSOR_CODE = `
class PCMWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    let outputSamples;
    if (sampleRate === this.targetSampleRate) {
      outputSamples = channelData;
    } else {
      // Linear interpolation downsampling to 16,000 Hz
      const ratio = sampleRate / this.targetSampleRate;
      const newLength = Math.floor(channelData.length / ratio);
      outputSamples = new Float32Array(newLength);
      for (let i = 0; i < newLength; i++) {
        const originalIndex = i * ratio;
        const low = Math.floor(originalIndex);
        const high = Math.min(channelData.length - 1, Math.ceil(originalIndex));
        const fraction = originalIndex - low;
        outputSamples[i] = channelData[low] * (1 - fraction) + channelData[high] * fraction;
      }
    }

    if (outputSamples.length === 0) return true;

    // Convert Float32 (-1.0 to 1.0) to 16-bit signed Linear PCM Little-Endian
    const pcm16 = new Int16Array(outputSamples.length);
    for (let i = 0; i < outputSamples.length; i++) {
      const s = Math.max(-1, Math.min(1, outputSamples[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}

registerProcessor('pcm-worklet-processor', PCMWorkletProcessor);
`;

// ---------------------------------------------------------------------------
// Module-level helpers (plain functions, no React state of their own). They
// are passed every ref/setter they need so the hook keeps a single source of
// truth. Behavior is identical to the inline code they were extracted from.
// ---------------------------------------------------------------------------

// Resolve the transcription WebSocket URL from env / build mode / page origin.
function getWebSocketUrl() {
  let wsUrl = import.meta.env.VITE_WS_URL;
  if (!wsUrl) {
    if (import.meta.env.DEV) {
      wsUrl = 'ws://localhost:5000/ws/transcribe';
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws/transcribe`;
    }
  }
  return wsUrl;
}

// Map a getUserMedia DOMException name to the user-facing message.
function getUserMediaErrorMessage(err) {
  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
    return 'Microphone permission was denied. Please allow microphone access in your browser settings.';
  }
  if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
    return 'No microphone device was detected on your computer.';
  }
  if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
    return 'Microphone is currently in use by another application.';
  }
  return 'Failed to access microphone.';
}

// Request the mono, echo-cancelled microphone stream and track it in a ref.
async function openMediaStream(mediaStreamRef) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });
  mediaStreamRef.current = stream;
  return stream;
}

// Shared 1-second elapsed timer used by both the Gemini and Web Speech paths.
function runDurationTimer(timerRef, setDuration) {
  setDuration(0);
  if (timerRef.current) clearInterval(timerRef.current);
  timerRef.current = setInterval(() => {
    setDuration((prev) => prev + 1);
  }, 1000);
}

// Build the capture pipeline (AnalyserNode for level metering + AudioWorklet
// with a ScriptProcessor fallback) that streams 16-bit PCM to the WebSocket.
// Throws on failure so the caller can switch to the Web Speech fallback.
async function buildAudioPipeline({
  stream,
  ws,
  audioContextRef,
  analyserRef,
  workletNodeRef,
  scriptProcessorRef,
  animFrameRef,
  timerRef,
  isRecordingRef,
  setAudioLevel,
  setDuration,
  setIsRecording
}) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let audioCtx;
  try {
    audioCtx = new AudioContextClass({ sampleRate: 16000 });
  } catch {
    audioCtx = new AudioContextClass();
  }
  audioContextRef.current = audioCtx;

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const source = audioCtx.createMediaStreamSource(stream);

  // AnalyserNode for live visual volume level.
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  analyserRef.current = analyser;

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  const updateVolume = () => {
    if (!isRecordingRef.current) return;
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
    animFrameRef.current = requestAnimationFrame(updateVolume);
  };
  animFrameRef.current = requestAnimationFrame(updateVolume);

  // Attempt AudioWorklet using inlined Blob.
  let workletSuccess = false;
  if (audioCtx.audioWorklet) {
    try {
      const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      await audioCtx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      const workletNode = new AudioWorkletNode(audioCtx, 'pcm-worklet-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (audioEvent) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(audioEvent.data);
        }
      };

      source.connect(workletNode);
      workletSuccess = true;
    } catch (workletErr) {
      console.warn('AudioWorklet inline failed, falling back to ScriptProcessor:', workletErr);
    }
  }

  // ScriptProcessor fallback for 100% browser compatibility.
  if (!workletSuccess) {
    const bufferSize = 4096;
    const scriptNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);
    scriptProcessorRef.current = scriptNode;

    scriptNode.onaudioprocess = (audioProcessingEvent) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const inputBuffer = audioProcessingEvent.inputBuffer;
      const channelData = inputBuffer.getChannelData(0);

      // Downsample to 16,000 Hz if needed.
      const currentSampleRate = audioCtx.sampleRate;
      const targetSampleRate = 16000;
      let downsampled;

      if (currentSampleRate === targetSampleRate) {
        downsampled = channelData;
      } else {
        const ratio = currentSampleRate / targetSampleRate;
        const newLength = Math.floor(channelData.length / ratio);
        downsampled = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
          const originalIndex = i * ratio;
          const low = Math.floor(originalIndex);
          const high = Math.min(channelData.length - 1, Math.ceil(originalIndex));
          const fraction = originalIndex - low;
          downsampled[i] = channelData[low] * (1 - fraction) + channelData[high] * fraction;
        }
      }

      // Convert to 16-bit PCM Int16Array.
      const pcm16 = new Int16Array(downsampled.length);
      for (let i = 0; i < downsampled.length; i++) {
        const s = Math.max(-1, Math.min(1, downsampled[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      ws.send(pcm16.buffer);
    };

    source.connect(scriptNode);
    scriptNode.connect(audioCtx.destination);
  }

  // Start duration timer and flip UI into recording state.
  runDurationTimer(timerRef, setDuration);
  setIsRecording(true);
}

// Open the backend WebSocket, wire up the transcript/status handlers and drive
// the Gemini audio pipeline. Any pre-confirmation failure routes to the
// Web Speech fallback (startWebSpeechFallback) so recording still works.
function connectTranscriptionSocket({
  stream,
  wsRef,
  language,
  audioContextRef,
  analyserRef,
  workletNodeRef,
  scriptProcessorRef,
  animFrameRef,
  timerRef,
  isRecordingRef,
  setStatus,
  setStatusMessage,
  setEngine,
  setInterimTranscript,
  setFinalTranscript,
  setAudioLevel,
  setDuration,
  setIsRecording,
  setError,
  startWebSpeechFallback,
  stopTracksAndAudio
}) {
  const wsUrl = getWebSocketUrl();
  let connectionConfirmed = false;

  try {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Timeout guard: if neither Gemini Live nor error responds in 8s, fallback to Web Speech
    const connectTimeout = setTimeout(() => {
      if (!connectionConfirmed) {
        console.warn('Gemini Live session start timed out. Switching to Web Speech fallback...');
        try { ws.close(); } catch {}
        startWebSpeechFallback(stream);
      }
    }, 8000);

    ws.onopen = () => {
      setStatusMessage('WebSocket opened. Initializing gemini-3.5-transcribe-live...');
      ws.send(JSON.stringify({
        type: 'start',
        language: language
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'status') {
          if (data.status === 'connecting') {
            setStatusMessage('Establishing live bidirectional streaming session with Gemini...');
          } else if (data.status === 'recording') {
            connectionConfirmed = true;
            clearTimeout(connectTimeout);

            setStatus('recording');
            setStatusMessage(`Live stream active (${data.model || 'gemini-3.5-transcribe-live'}) — speak now!`);
            setEngine('gemini');

            // Set up AudioContext with robust fallback
            try {
              await buildAudioPipeline({
                stream,
                ws,
                audioContextRef,
                analyserRef,
                workletNodeRef,
                scriptProcessorRef,
                animFrameRef,
                timerRef,
                isRecordingRef,
                setAudioLevel,
                setDuration,
                setIsRecording
              });
            } catch (audioErr) {
              console.error('Audio capture pipeline failed, switching to Web Speech fallback:', audioErr);
              try { ws.close(); } catch {}
              startWebSpeechFallback(stream);
            }
          } else if (data.status === 'stopped') {
            setStatus('idle');
            setStatusMessage('Microphone ready');
            setIsRecording(false);
          }
        } else if (data.type === 'interim') {
          if (data.text) {
            setInterimTranscript(data.text);
          }
        } else if (data.type === 'final') {
          if (data.text) {
            setFinalTranscript((prev) => {
              const trimmed = data.text.trim();
              if (!trimmed) return prev;
              return prev ? `${prev} ${trimmed}` : trimmed;
            });
            setInterimTranscript('');
          }
        } else if (data.type === 'error') {
          console.warn('Backend speech error:', data.message);
          if (!connectionConfirmed) {
            clearTimeout(connectTimeout);
            try { ws.close(); } catch {}
            startWebSpeechFallback(stream);
          } else {
            setError(data.message || 'Speech recognition encountered an error.');
          }
        }
      } catch (parseErr) {
        console.warn('Error reading WebSocket message:', parseErr);
      }
    };

    ws.onerror = (e) => {
      console.warn('WebSocket error:', e);
      if (!connectionConfirmed) {
        clearTimeout(connectTimeout);
        try { ws.close(); } catch {}
        startWebSpeechFallback(stream);
      } else {
        setError('WebSocket connection error during live streaming.');
        setStatus('error');
        stopTracksAndAudio();
      }
    };

    ws.onclose = () => {
      if (!connectionConfirmed) {
        clearTimeout(connectTimeout);
        startWebSpeechFallback(stream);
      } else {
        setIsRecording(false);
        setStatus('idle');
        setStatusMessage('Microphone ready');
        stopTracksAndAudio();
      }
    };
  } catch (wsErr) {
    console.warn('Failed to open WebSocket, starting Web Speech fallback:', wsErr);
    startWebSpeechFallback(stream);
  }
}

export function useLiveTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('idle'); // 'idle' | 'requesting' | 'connecting' | 'recording' | 'stopping' | 'error'
  const [statusMessage, setStatusMessage] = useState('Microphone ready');
  const [engine, setEngine] = useState('none'); // 'gemini' | 'webspeech' | 'none'
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [language, setLanguage] = useState('auto'); // 'auto' | 'en' | 'hi' | 'en-hi'
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [engineNotice, setEngineNotice] = useState('');
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 100 for visual live sound wave

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const workletNodeRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const timerRef = useRef(null);
  const webSpeechRecognitionRef = useRef(null);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (webSpeechRecognitionRef.current) {
        try { webSpeechRecognitionRef.current.abort(); } catch {}
      }
    };
  }, []);

  const clearTranscript = useCallback(() => {
    setFinalTranscript('');
    setInterimTranscript('');
    setDuration(0);
    setError(null);
  }, []);

  // Set sample note text for instant testing
  const loadSampleTranscript = useCallback((sampleText) => {
    setFinalTranscript(sampleText || 'Hello, kaise ho aap log? Main aaj ek important project ke baare mein baat kar raha hoon.');
    setInterimTranscript('');
    setDuration(12);
  }, []);

  const stopTracksAndAudio = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);

    if (workletNodeRef.current) {
      try { workletNodeRef.current.disconnect(); } catch {}
      workletNodeRef.current = null;
    }

    if (scriptProcessorRef.current) {
      try { scriptProcessorRef.current.disconnect(); } catch {}
      scriptProcessorRef.current = null;
    }

    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch {}
      analyserRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }

    if (webSpeechRecognitionRef.current) {
      try { webSpeechRecognitionRef.current.stop(); } catch {}
      webSpeechRecognitionRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    setStatus('stopping');
    setStatusMessage('Stopping recording and finalizing transcript...');
    stopTracksAndAudio();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'stop' }));
      } catch {}

      setTimeout(() => {
        if (wsRef.current) {
          try { wsRef.current.close(); } catch {}
          wsRef.current = null;
        }
        setInterimTranscript('');
        setIsRecording(false);
        setStatus('idle');
        setStatusMessage('Microphone ready');
      }, 400);
    } else {
      setInterimTranscript('');
      setIsRecording(false);
      setStatus('idle');
      setStatusMessage('Microphone ready');
    }
  }, [stopTracksAndAudio]);

  /**
   * Browser Web Speech API fallback when Gemini Live API is unreachable
   */
  const startWebSpeechFallback = useCallback((stream) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Gemini Live API is unreachable and this browser does not support Web Speech API. Please use Google Chrome or Edge.');
      setStatus('error');
      setStatusMessage('Speech recognition unavailable');
      stopTracksAndAudio();
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      webSpeechRecognitionRef.current = recognition;

      recognition.continuous = true;
      recognition.interimResults = true;

      if (language === 'hi') recognition.lang = 'hi-IN';
      else if (language === 'en') recognition.lang = 'en-US';
      else recognition.lang = 'en-IN'; // Indian English / Hinglish

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const piece = event.results[i][0].transcript.trim();
            if (piece) {
              setFinalTranscript((prev) => (prev ? `${prev} ${piece}` : piece));
            }
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        setInterimTranscript(interim);
      };

      recognition.onerror = (event) => {
        console.warn('Web Speech fallback event:', event.error);
        if (event.error !== 'no-speech') {
          setError(`Web Speech notice: ${event.error}`);
        }
      };

      recognition.onend = () => {
        if (isRecordingRef.current) {
          try { recognition.start(); } catch {}
        }
      };

      recognition.start();
      setEngine('webspeech');
      setEngineNotice('Notice: Running on Web Speech API Fallback. Real-time Gemini Live WebSocket could not be reached.');
      setStatus('recording');
      setStatusMessage('Listening via Web Speech API fallback — speak now!');
      setIsRecording(true);

      // Duration timer (shared with the Gemini path)
      runDurationTimer(timerRef, setDuration);
    } catch (fallbackErr) {
      setError(`Fallback failed: ${fallbackErr.message}`);
      setStatus('error');
      setStatusMessage('Error starting speech recognition');
      stopTracksAndAudio();
    }
  }, [language, stopTracksAndAudio]);

  /**
   * Main Start Recording: Connects to backend WebSocket and initiates Gemini Live
   */
  const startRecording = useCallback(async () => {
    setError(null);
    setEngineNotice('');
    setInterimTranscript('');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Microphone access is not supported by your browser. Please use Chrome, Edge, Safari, or Firefox.';
      setError(msg);
      setStatus('error');
      setStatusMessage(msg);
      return;
    }

    setStatus('requesting');
    setStatusMessage('Requesting microphone permission from browser...');

    let stream;
    try {
      stream = await openMediaStream(mediaStreamRef);
    } catch (err) {
      const errMsg = getUserMediaErrorMessage(err);
      setError(errMsg);
      setStatus('error');
      setStatusMessage(errMsg);
      return;
    }

    setStatus('connecting');
    setStatusMessage('Connecting to backend Gemini Live WebSocket relay...');

    connectTranscriptionSocket({
      stream,
      wsRef,
      language,
      audioContextRef,
      analyserRef,
      workletNodeRef,
      scriptProcessorRef,
      animFrameRef,
      timerRef,
      isRecordingRef,
      setStatus,
      setStatusMessage,
      setEngine,
      setInterimTranscript,
      setFinalTranscript,
      setAudioLevel,
      setDuration,
      setIsRecording,
      setError,
      startWebSpeechFallback,
      stopTracksAndAudio
    });
  }, [language, stopTracksAndAudio, startWebSpeechFallback]);

  return {
    isRecording,
    status,
    statusMessage,
    engine, // 'gemini' | 'webspeech' | 'none'
    finalTranscript,
    interimTranscript,
    language,
    setLanguage,
    duration,
    error,
    engineNotice,
    audioLevel,
    startRecording,
    stopRecording,
    clearTranscript,
    loadSampleTranscript,
    setFinalTranscript
  };
}

export default useLiveTranscription;
