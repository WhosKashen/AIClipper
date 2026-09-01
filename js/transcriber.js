// js/transcriber.js
//
// Generates a transcript straight from the loaded video's own audio,
// entirely in the browser, using a small Whisper model via Hugging
// Face's Transformers.js. No server, no API key, nothing to pay for \u2014
// the model (~80MB) downloads once from a CDN and is cached by the
// browser after that.

const LIB_VERSION = "4.2.0";
const MODEL_ID = "Xenova/whisper-tiny.en";
const CDN_HOSTS = ["https://cdn.jsdelivr.net/npm", "https://unpkg.com"];

let transcriberPromise = null;

async function importWithFallback(path) {
  let lastErr;
  for (const host of CDN_HOSTS) {
    try {
      return await import(`${host}/${path}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function getTranscriber(onStatus) {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline } = await importWithFallback(`@huggingface/transformers@${LIB_VERSION}`);
      if (onStatus) onStatus("Downloading the speech model (~80MB, first time only)\u2026");
      return pipeline("automatic-speech-recognition", MODEL_ID);
    })();
  }
  try {
    return await transcriberPromise;
  } catch (err) {
    transcriberPromise = null;
    const raw = err && err.message ? err.message : String(err);
    throw new Error(`Could not load the speech model \u2014 ${raw}. Check your connection, or that cdn.jsdelivr.net / unpkg.com aren't blocked.`);
  }
}

function secondsToLabel(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// wavBytes: a Uint8Array containing a 16kHz mono WAV file
// (see ffmpegProcessor.js's extractAudioForTranscription).
export async function transcribeAudio(wavBytes, onStatus) {
  const transcriber = await getTranscriber(onStatus);

  if (onStatus) onStatus("Decoding audio\u2026");
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass({ sampleRate: 16000 });
  let samples;
  try {
    const arrayBuffer = wavBytes.buffer.slice(
      wavBytes.byteOffset,
      wavBytes.byteOffset + wavBytes.byteLength
    );
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    samples = audioBuffer.getChannelData(0);
  } finally {
    audioContext.close().catch(() => {});
  }

  if (onStatus) onStatus("Transcribing\u2026 this can take a few minutes on longer videos.");
  const result = await transcriber(samples, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  });

  if (Array.isArray(result.chunks) && result.chunks.length) {
    const lines = result.chunks
      .map((chunk) => {
        const hasStart = Array.isArray(chunk.timestamp) && typeof chunk.timestamp[0] === "number";
        const start = hasStart ? chunk.timestamp[0] : null;
        const text = (chunk.text || "").trim();
        if (!text) return "";
        return start === null ? text : `[${secondsToLabel(start)}] ${text}`;
      })
      .filter(Boolean);
    if (lines.length) return lines.join("\n");
  }

  return (result.text || "").trim();
}
