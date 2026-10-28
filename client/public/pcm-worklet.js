/**
 * PCM AudioWorklet Processor
 * Receives microphone input, downsamples to 16kHz mono if needed,
 * converts Float32 samples to 16-bit Little-Endian Linear PCM,
 * and posts ArrayBuffer chunks to the main thread.
 */

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

    // If AudioContext is already 16kHz, use samples directly
    if (sampleRate === this.targetSampleRate) {
      outputSamples = channelData;
    } else {
      // Linear interpolation downsampling to 16000 Hz
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

    // Convert Float32 (-1.0 to 1.0) to 16-bit signed PCM
    const pcm16 = new Int16Array(outputSamples.length);
    for (let i = 0; i < outputSamples.length; i++) {
      const s = Math.max(-1, Math.min(1, outputSamples[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Transfer buffer to main thread
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}

registerProcessor('pcm-worklet-processor', PCMWorkletProcessor);
