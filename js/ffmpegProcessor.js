// js/ffmpegProcessor.js
//
// Wraps ffmpeg.wasm so the rest of the app can load a video, analyze it,
// and cut clips out of it without ever sending the video to a server.
// Uses the single-thread core on purpose: the multi-thread core needs
// Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy response
// headers, which GitHub Pages does not let you set. Single-thread is
// slower but works with zero server configuration.

const FFMPEG_VERSION = "0.12.10";
const UTIL_VERSION = "0.12.1";
const CORE_VERSION = "0.12.10";

let ffmpegInstance = null;
let loadPromise = null;
let utilModule = null;

// Swappable per-call handlers. ffmpeg.wasm only lets you attach listeners
// once in a useful way, so each exec() call points these at its own
// callback instead of adding/removing listeners.
let activeLogHandler = null;
let activeProgressHandler = null;

async function getUtil() {
  if (!utilModule) {
    utilModule = await import(
      `https://cdn.jsdelivr.net/npm/@ffmpeg/util@${UTIL_VERSION}/dist/esm/index.js`
    );
  }
  return utilModule;
}

function secondsToTimestamp(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(3);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${sec.padStart(6, "0")}`;
}

function inferExtension(nameOrUrl) {
  const match = /\.([a-zA-Z0-9]{2,4})(?:$|\?)/.exec(nameOrUrl || "");
  return match ? match[1].toLowerCase() : "mp4";
}

export async function loadFFmpeg(onStatus) {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (onStatus) onStatus("Loading the in-browser video engine\u2026");
    const { FFmpeg } = await import(
      `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/index.js`
    );
    const { toBlobURL } = await getUtil();

    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => {
      if (activeLogHandler) activeLogHandler(message);
    });
    ffmpeg.on("progress", ({ progress }) => {
      if (activeProgressHandler) activeProgressHandler(progress);
    });

    const baseURL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw new Error(
      "Could not load the video engine. Check your connection and try again."
    );
  }
}

// Loads a File or a remote URL into ffmpeg's virtual filesystem and returns
// the filename to reference in later exec() calls.
export async function loadSource(source, onStatus) {
  const ffmpeg = await loadFFmpeg(onStatus);
  const { fetchFile } = await getUtil();

  const nameHint = source instanceof File ? source.name : source;
  const ext = inferExtension(nameHint);
  const inputName = `input.${ext}`;

  if (onStatus) onStatus("Reading the video\u2026");

  let data;
  try {
    data = await fetchFile(source);
  } catch (err) {
    throw new Error(
      "Could not read that video. If it is a URL, the host likely blocks " +
      "cross-origin access \u2014 try downloading the file and uploading it instead."
    );
  }

  await ffmpeg.writeFile(inputName, data);
  return inputName;
}

// Runs a single pass over the audio track to find natural pause points
// (via ffmpeg's own silencedetect filter) and the video's total duration.
// This is the basis of the free, no-API-key highlight picker.
export async function analyzeAudio(inputName, onStatus) {
  if (!ffmpegInstance) throw new Error("The video has not finished loading yet.");
  const ffmpeg = ffmpegInstance;

  const silences = [];
  let pendingStart = null;
  let duration = 0;

  const durationRe = /Duration:\s*(\d+):(\d+):([\d.]+)/;
  const startRe = /silence_start:\s*([\d.]+)/;
  const endRe = /silence_end:\s*([\d.]+)/;

  activeLogHandler = (message) => {
    const d = durationRe.exec(message);
    if (d) duration = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);

    const s = startRe.exec(message);
    if (s) {
      pendingStart = parseFloat(s[1]);
      return;
    }
    const e = endRe.exec(message);
    if (e && pendingStart !== null) {
      silences.push({ start: pendingStart, end: parseFloat(e[1]) });
      pendingStart = null;
    }
  };
  activeProgressHandler = (progress) => {
    if (onStatus) {
      const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
      onStatus(`Scanning for natural pause points\u2026 ${pct}%`);
    }
  };

  if (onStatus) onStatus("Scanning for natural pause points\u2026");
  try {
    await ffmpeg.exec([
      "-i", inputName,
      "-af", "silencedetect=noise=-30dB:d=0.6",
      "-f", "null", "-",
    ]);
  } finally {
    activeLogHandler = null;
    activeProgressHandler = null;
  }

  return { silences, duration };
}

// Cuts [startSeconds, endSeconds) out of the loaded input and returns an
// object URL for the resulting clip plus a suggested filename.
export async function cutClip(inputName, startSeconds, endSeconds, index, onStatus) {
  if (!ffmpegInstance) {
    throw new Error("The video has not finished loading yet.");
  }
  const ffmpeg = ffmpegInstance;
  const outputName = `clip_${index}.mp4`;
  const start = secondsToTimestamp(startSeconds);
  const duration = Math.max(0.5, endSeconds - startSeconds).toFixed(3);

  activeProgressHandler = (progress) => {
    if (onStatus) {
      const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
      onStatus(`Cutting clip ${index + 1}\u2026 ${pct}%`);
    }
  };
  if (onStatus) onStatus(`Cutting clip ${index + 1}\u2026`);

  try {
    await ffmpeg.exec([
      "-ss", start,
      "-i", inputName,
      "-t", duration,
      "-c", "copy",
      "-avoid_negative_ts", "make_zero",
      outputName,
    ]);
  } finally {
    activeProgressHandler = null;
  }

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data.buffer], { type: "video/mp4" });
  await ffmpeg.deleteFile(outputName).catch(() => {});

  return {
    url: URL.createObjectURL(blob),
    filename: `keyframe-clip-${index + 1}.mp4`,
  };
}

export function isReady() {
  return Boolean(ffmpegInstance);
}
