// js/claudeHighlights.js
//
// Sends the pasted transcript straight to the Anthropic API from the
// browser, using the person's own API key (see README for why this is
// the standard "bring your own key" pattern for a backend-less site).
// Nothing here touches any server other than api.anthropic.com.

const MODEL = "claude-sonnet-5";
const API_URL = "https://api.anthropic.com/v1/messages";

function buildPrompt(transcript, clipCount, targetLength) {
  return [
    "You are helping a video editor find the best short highlight clips",
    "from a transcript.",
    "",
    "Transcript (lines may start with a [MM:SS] or [HH:MM:SS] timestamp):",
    '"""',
    transcript.trim(),
    '"""',
    "",
    `Find the ${clipCount} most engaging, quotable, or emotionally`,
    `resonant moments. Each clip should be roughly ${targetLength} seconds`,
    "long and make sense on its own without extra context. Prefer moments",
    "with a clear beginning and end over cutting mid-sentence.",
    "",
    "Respond with ONLY a JSON array and nothing else — no markdown fences,",
    "no commentary before or after. Each item must look like:",
    '{"start": "MM:SS", "end": "MM:SS", "title": "short punchy title, under 8 words", "reason": "one sentence on why this moment stands out"}',
    "",
    "If the transcript has no timestamps, estimate positions from the",
    "order things are said, and mention in the reason that timing is",
    "approximate.",
  ].join("\n");
}

function parseJsonResponse(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error("The AI response was not valid JSON — try running it again.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected response shape from the AI.");
  }
  return parsed;
}

export function timestampToSeconds(ts) {
  const parts = String(ts).split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

export async function findHighlights({ apiKey, transcript, clipCount, targetLength }) {
  if (!apiKey) {
    throw new Error("Add your Anthropic API key in Settings first.");
  }
  if (!transcript || !transcript.trim()) {
    throw new Error("Paste a transcript first — it is what the AI reads to find highlights.");
  }

  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        messages: [
          { role: "user", content: buildPrompt(transcript, clipCount, targetLength) },
        ],
      }),
    });
  } catch (err) {
    throw new Error("Could not reach the Anthropic API — check your connection.");
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (body && body.error && body.error.message) message = body.error.message;
    } catch (err) {
      // ignore — fall back to the generic message above
    }
    if (response.status === 401) {
      message = "That API key was rejected. Double-check it in Settings.";
    }
    throw new Error(message);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("The AI response had no text in it.");

  const raw = parseJsonResponse(textBlock.text);
  return raw.map((h, i) => ({
    start: h.start,
    end: h.end,
    title: h.title || `Highlight ${i + 1}`,
    reason: h.reason || "",
    startSeconds: timestampToSeconds(h.start),
    endSeconds: timestampToSeconds(h.end),
    id: `highlight-${i}`,
  }));
}
