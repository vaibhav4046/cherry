/**
 * On-device speech-to-text: Whisper (tiny.en) running in the browser via
 * transformers.js — WebGPU when available, WASM otherwise. No API key, no
 * account, and audio never leaves the machine; the model weights download once
 * from the Hugging Face CDN and are cached by the browser.
 *
 * Honesty: this produces a DRAFT transcript. Small models mishear; the pasted
 * official transcript remains the exact source, and the human reviews the
 * draft in the textarea before anything is derived from it.
 */

import { formatWhisperChunks, type WhisperChunk } from './whisper-format.ts';

export interface TranscribeProgress {
  phase: 'loading-model' | 'transcribing' | 'done';
  /** 0..1 where known; null when the runtime gives no signal. */
  fraction: number | null;
  detail: string;
}

type ProgressCallback = (progress: TranscribeProgress) => void;

const MODEL_ID = 'Xenova/whisper-tiny.en';
const TARGET_SAMPLE_RATE = 16000;
export const MAX_LOCAL_MEDIA_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_LOCAL_MEDIA_DURATION_SECONDS = 30 * 60;

type ReadableMediaBlob = Pick<Blob, 'size' | 'arrayBuffer'>;

export function inspectLocalMediaBlob(blob: Pick<Blob, 'size'>): { ok: true } | { ok: false; error: string } {
  if (blob.size === 0) return { ok: false, error: 'That media file is empty. Choose another file.' };
  if (blob.size > MAX_LOCAL_MEDIA_FILE_BYTES) {
    return { ok: false, error: 'That media file is larger than 128 MiB. Choose a smaller clip.' };
  }
  return { ok: true };
}

/** Reject known-bad sizes before allocating, then enforce the real byte length. */
export async function readLocalMediaBytes(blob: ReadableMediaBlob): Promise<ArrayBuffer> {
  const inspected = inspectLocalMediaBlob(blob);
  if (!inspected.ok) throw new Error(inspected.error);
  const bytes = await blob.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error('That media file is empty. Choose another file.');
  if (bytes.byteLength > MAX_LOCAL_MEDIA_FILE_BYTES) {
    throw new Error('That media file is larger than 128 MiB. Choose a smaller clip.');
  }
  return bytes;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriberPromise: Promise<any> | null = null;

async function getTranscriber(onProgress: ProgressCallback) {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      const progress = (event: { status?: string; progress?: number }) => {
        if (event?.status === 'progress' && typeof event.progress === 'number') {
          onProgress({ phase: 'loading-model', fraction: event.progress / 100, detail: `Downloading model — ${Math.round(event.progress)}% (once, then cached)` });
        }
      };
      // WebGPU rejects the q8 decoder on some drivers; fall back to WASM q8.
      const attempts = [
        { device: 'webgpu', dtype: 'fp32' },
        { device: 'wasm', dtype: 'q8' },
      ] as const;
      let lastError: unknown = null;
      for (const attempt of attempts) {
        try {
          return await pipeline('automatic-speech-recognition', MODEL_ID, {
            device: attempt.device,
            dtype: attempt.dtype,
            progress_callback: progress,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        } catch (thrown) {
          lastError = thrown;
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    })();
    transcriberPromise.catch(() => {
      transcriberPromise = null;
    });
  }
  return transcriberPromise;
}

/** Decode any audio/video file (or recorded blob) to 16 kHz mono PCM. */
export async function decodeToMono16k(data: ArrayBuffer): Promise<Float32Array> {
  if (data.byteLength === 0) throw new Error('No audio data was captured. Try again.');
  if (data.byteLength > MAX_LOCAL_MEDIA_FILE_BYTES) throw new Error('The captured audio is larger than 128 MiB. Use a shorter clip.');
  const probeContext = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await probeContext.decodeAudioData(data);
  } finally {
    await probeContext.close();
  }
  if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) throw new Error('No readable audio was found in that file.');
  if (decoded.duration > MAX_LOCAL_MEDIA_DURATION_SECONDS) {
    throw new Error('That media is longer than 30 minutes. Choose a shorter clip.');
  }
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

/** Transcribe PCM audio on this device; returns Cherry's timestamped lines. */
export async function transcribePcm(
  pcm: Float32Array,
  onProgress: ProgressCallback,
  playbackRate = 1,
): Promise<string> {
  const transcriber = await getTranscriber(onProgress);
  const totalSeconds = pcm.length / TARGET_SAMPLE_RATE;
  onProgress({ phase: 'transcribing', fraction: null, detail: `Transcribing ${Math.round(totalSeconds / 60)} min of audio on this device…` });
  const output = await transcriber(pcm, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  const chunks = (output?.chunks ?? []) as WhisperChunk[];
  onProgress({ phase: 'done', fraction: 1, detail: 'Draft transcript ready — review it before deriving.' });
  return formatWhisperChunks(chunks, playbackRate);
}

export async function transcribeMediaFile(file: File, onProgress: ProgressCallback): Promise<string> {
  const pcm = await decodeToMono16k(await readLocalMediaBytes(file));
  return transcribePcm(pcm, onProgress);
}

export interface TabCapture {
  stop(): void;
  /** Resolves once the user stops sharing (or stop() is called). */
  result: Promise<Blob>;
}

/**
 * Record this tab's audio (the browser asks which surface to share — pick this
 * tab and enable "share tab audio"). Recording happens locally; nothing is
 * uploaded anywhere.
 */
export async function startTabAudioCapture(): Promise<TabCapture> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('No tab audio was shared. Pick this tab and tick "Also share tab audio".');
  }
  // Video track is required by the picker but unused; keep the recorder audio-only.
  const audioStream = new MediaStream(stream.getAudioTracks());
  const recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
  const parts: BlobPart[] = [];
  let capturedBytes = 0;
  let captureError: Error | null = null;
  recorder.ondataavailable = (event) => {
    if (event.data.size <= 0) return;
    capturedBytes += event.data.size;
    if (capturedBytes > MAX_LOCAL_MEDIA_FILE_BYTES) {
      captureError = new Error('The tab capture reached 128 MiB. Use a shorter clip.');
      if (recorder.state !== 'inactive') recorder.stop();
      return;
    }
    parts.push(event.data);
  };
  const result = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      window.clearTimeout(durationLimit);
      stream.getTracks().forEach((track) => track.stop());
      if (captureError) reject(captureError);
      else resolve(new Blob(parts, { type: 'audio/webm' }));
    };
  });
  const durationLimit = window.setTimeout(() => {
    captureError = new Error('The tab capture reached 30 minutes. Start a shorter capture.');
    if (recorder.state !== 'inactive') recorder.stop();
  }, MAX_LOCAL_MEDIA_DURATION_SECONDS * 1000);
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (recorder.state !== 'inactive') recorder.stop();
  });
  recorder.start(1000);
  return {
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop();
    },
    result,
  };
}
