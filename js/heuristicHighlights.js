// js/heuristicHighlights.js
//
// The free highlight picker. It has no idea what is actually interesting
// — it just finds natural pause points (from ffmpeg's silence detection)
// and builds well-bounded clips spread evenly across the whole video.
// Less clever than the AI mode, but needs no account, no key, and no
// network call at all.

function secondsToLabel(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Silence intervals -> the complementary "someone is talking" intervals.
function speechSegments(silences, duration) {
  const sorted = [...silences].sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = 0;
  sorted.forEach((gap) => {
    if (gap.start > cursor) segments.push({ start: cursor, end: gap.start });
    cursor = Math.max(cursor, gap.end);
  });
  if (cursor < duration) segments.push({ start: cursor, end: duration });
  return segments.filter((seg) => seg.end - seg.start > 0.4);
}

// Builds one clip inside [zoneStart, zoneEnd), bridging short pauses,
// aiming for targetLength, and snapping to real speech boundaries.
function buildClipInZone(segments, zoneStart, zoneEnd, targetLength) {
  const inZone = segments
    .filter((seg) => seg.end > zoneStart && seg.start < zoneEnd)
    .sort((a, b) => a.start - b.start);

  if (!inZone.length) {
    return { start: zoneStart, end: Math.min(zoneEnd, zoneStart + targetLength) };
  }

  let best = null;
  for (let i = 0; i < inZone.length; i += 1) {
    const start = Math.max(inZone[i].start, zoneStart);
    let end = Math.min(inZone[i].end, zoneEnd);
    for (let j = i + 1; j < inZone.length; j += 1) {
      const gap = inZone[j].start - end;
      if (gap > 1.5 || inZone[j].start >= zoneEnd) break;
      end = Math.min(inZone[j].end, zoneEnd);
      if (end - start >= targetLength) break;
    }
    const score = Math.abs(end - start - targetLength);
    if (!best || score < best.score) best = { start, end, score };
  }

  return { start: best.start, end: best.end };
}

export function findHeuristicHighlights({ silences, duration, clipCount, targetLength }) {
  if (!duration || duration <= 0) return [];

  const segments = speechSegments(silences, duration);
  const count = Math.max(1, Math.min(clipCount, Math.ceil(duration / 5)));
  const zoneWidth = duration / count;
  const highlights = [];

  for (let i = 0; i < count; i += 1) {
    const zoneStart = i * zoneWidth;
    const zoneEnd = (i + 1) * zoneWidth;
    const { start, end } = buildClipInZone(segments, zoneStart, zoneEnd, targetLength);
    if (end - start < 1) continue;
    highlights.push({
      start: secondsToLabel(start),
      end: secondsToLabel(end),
      startSeconds: start,
      endSeconds: end,
      title: `Moment ${highlights.length + 1}`,
      reason: "Auto-picked from a natural pause-to-pause segment \u2014 no AI involved.",
      id: `heuristic-${i}`,
    });
  }

  return highlights;
}
