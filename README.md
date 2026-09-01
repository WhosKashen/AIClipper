# Keyframe

A highlight clipper that runs entirely in the browser — no backend, so
it deploys straight to GitHub Pages. It has two ways to pick highlights;
neither requires you to pay for anything to deploy the site itself.

## What it does

1. **Add a video** — upload a file, paste a direct video URL, or paste a
   YouTube link.
2. **Pick a method:**
   - **Free — pause detection.** Runs ffmpeg's silence detection on the
     audio, then builds clips out of the natural pauses, spread evenly
     across the video. No account, no key, no network call — everything
     happens on your device. Only works for an uploaded file or a direct
     video URL (see *Why no YouTube downloads*), and it has no idea what's
     actually interesting, just where the natural breaks are.
   - **AI.** Reads a transcript you paste in and asks Claude which moments
     are genuinely worth clipping. Smarter, but needs your own Anthropic
     API key (see *Getting an API key* — new accounts get a small one-time
     free credit, but it's not an ongoing free tier). For the transcript
     itself, either paste one in, or click **Auto-generate from video** to
     transcribe the audio right in the browser (see *Auto-transcribe*
     below) — free either way.
3. **Get clips**
   - Uploaded file / direct URL → real `.mp4` clips, cut in-browser with
     [ffmpeg.wasm](https://ffmpegwasm.netlify.app/) and downloaded straight
     to your device. The video is never uploaded anywhere.
   - YouTube link → **timestamped links** back to the original video
     (`youtu.be/ID?t=123`), not downloaded files. See *Why no YouTube
     downloads* below. Only the AI method is available for YouTube, since
     the free method needs the actual audio to analyze.

## Deploy to GitHub Pages

1. Create a new GitHub repo and push these files to it (keep the folder
   structure as-is — `index.html` at the root, `css/` and `js/` beside it).
   There's also a `.nojekyll` file included — keep it too, it tells GitHub
   Pages to serve the files as-is instead of running them through Jekyll.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a
   branch`, pick your default branch and `/ (root)`, then save.
4. GitHub gives you a URL like `https://yourname.github.io/reponame/` a
   minute or two later. That's it — no build step, no server.

## Auto-transcribe

Next to the transcript box (AI method, Upload/URL source) there's an
**Auto-generate from video** button. It pulls the audio out of the video
with ffmpeg.wasm, then transcribes it entirely in the browser using a
small Whisper model ([`Xenova/whisper-tiny.en`](https://huggingface.co/Xenova/whisper-tiny.en))
run through [Transformers.js](https://huggingface.co/docs/transformers.js) —
no server, no API key, nothing to pay for.

- The model (~80MB) downloads once from a CDN and is cached by the
  browser after that — the first run is the slow one.
- It's English-only and tiny on purpose, so it fits comfortably in a
  browser tab. Expect noticeably rougher accuracy than a full Whisper
  model or a paid transcription API, and expect it to take real time on
  longer videos — a few minutes is normal, entirely on CPU.
- It needs the actual audio, so — like the Free highlight method — it
  only works for an uploaded file or a direct video URL, never a
  YouTube link.
- Non-English content, or content youtube already has captions for, is
  usually faster and more accurate to grab from wherever it already
  exists (see the manual options below) than to re-transcribe here.

## Getting an API key (only needed for the AI method)

The Free method needs no key at all — skip this section if that's all
you're using. For the AI method, highlight-finding calls the Anthropic
API directly from your browser using a key you provide:

1. Go to [console.claude.com/settings/keys](https://console.claude.com/settings/keys)
   and create a key. New accounts get a small one-time trial credit
   (no credit card needed, phone verification required) — enough to test
   the AI method, though it's a trial, not an ongoing free allowance.
2. Paste it into Keyframe's Settings panel (gear icon, top right).

The key is saved only in your browser's `localStorage` and is sent
straight to `api.anthropic.com` — it never passes through any server of
ours, because there isn't one. That also means:

- Usage is billed to **your** Anthropic account.
- Anyone with access to that browser profile can read the key back out
  (open dev tools → Application → Local Storage). Don't use this on a
  shared or public computer with a key you care about.
- If you publish your copy of this site publicly, each visitor needs to
  paste in their *own* key — your key is never bundled into the code.

## Why no YouTube downloads

Keyframe never fetches YouTube's actual video or audio stream. Doing
that programmatically breaks YouTube's Terms of Service, regardless of
the tool doing it. So for YouTube sources, Keyframe only ever uses
YouTube's own public embed player and standard link parameters
(`?t=123s`, `?start=123`) — the same mechanism YouTube's own "share at
this point" button uses. You get precise timestamped links, not clip
files.

If you need actual clip files from a YouTube video, download it yourself
through a route you're authorized to use, then use the **Upload** tab.

## Known limitations

- **"Could not load the video engine" error.** This means ffmpeg.wasm
  itself failed to load — the app now shows the actual browser error
  alongside a likely cause. The two most common ones: (1) `cdn.jsdelivr.net`
  and `unpkg.com` are both blocked by an ad-blocker, school/work network
  filter, or firewall — try a different network, or disabling the blocker
  for this site; (2) an older or unusual browser without the features
  ffmpeg.wasm's single-thread build wants. Current Chrome, Edge, or
  Firefox on a normal home or mobile network should work. Opening the
  browser console (F12) shows the full underlying error if the on-page
  message isn't enough to go on.
- **The free method doesn't understand content.** It finds pauses and
  spreads clips evenly across the runtime — it can't tell a great story
  beat from a boring one. For genuinely picking the *best* moments, you
  need the AI method.
- **The free method needs the real audio track**, so it only works for
  an uploaded file or a direct video URL, never a YouTube link.
- **Direct video URLs** only work if the host sends permissive CORS
  headers. Many personal sites and CDNs don't, by default. If a URL
  fails, download the file and use the Upload tab instead.
- **ffmpeg.wasm runs single-threaded** here on purpose — the faster
  multi-threaded build needs `Cross-Origin-Opener-Policy` /
  `Cross-Origin-Embedder-Policy` response headers, which GitHub Pages
  doesn't let you set. Single-threaded is slower on long videos but
  needs zero server configuration.
- **Clip cuts use stream copy** (`-c copy`) for speed, so a cut may land
  on the nearest keyframe rather than the exact frame requested — usually
  within a fraction of a second.
- **No built-in transcription.** Claude's API doesn't accept raw audio,
  and browsers don't reliably transcribe pre-recorded audio client-side,
  so Keyframe asks you to paste a transcript rather than faking an
  "automatic" step that would be unreliable in practice.
- Large video files can be slow (or run out of memory) in an
  all-in-browser tool like this — it's most comfortable with clips up to
  roughly a half-hour or so, depending on the device.

## File structure

```
index.html              Page structure
css/style.css            All styling
js/app.js                 UI wiring + the main pipeline
js/ffmpegProcessor.js     Loads video, analyzes audio, cuts clips (ffmpeg.wasm)
js/claudeHighlights.js    AI method — calls the Anthropic API for timestamps
js/heuristicHighlights.js Free method — turns pause data into clip timestamps
js/transcriber.js         Auto-transcribe — runs Whisper in the browser
js/youtubeLinks.js        YouTube ID parsing + embed/share link building
```

Each module is independent, so it's a reasonable place to start if you
want to swap in a different AI provider, add a transcription step, or
change how clips are exported.
