// js/youtubeLinks.js
//
// Keyframe never fetches or downloads YouTube's actual video/audio —
// doing that would break YouTube's Terms of Service. Instead, for YouTube
// sources this module only ever uses YouTube's own public embed player
// and standard link parameters to point at a moment in the original video.

export function extractYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const shortsMatch = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{6,})/);
    if (shortsMatch) return shortsMatch[1];
    const embedMatch = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{6,})/);
    if (embedMatch) return embedMatch[1];
  } catch (err) {
    return null;
  }
  return null;
}

export function buildEmbedUrl(videoId, startSeconds) {
  const params = new URLSearchParams({ start: Math.max(0, Math.floor(startSeconds || 0)) });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function buildClipEmbedUrl(videoId, startSeconds, endSeconds) {
  const params = new URLSearchParams({
    start: Math.max(0, Math.floor(startSeconds || 0)),
    end: Math.max(0, Math.floor(endSeconds || 0)),
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function buildShareUrl(videoId, startSeconds) {
  return `https://youtu.be/${videoId}?t=${Math.max(0, Math.floor(startSeconds || 0))}`;
}
