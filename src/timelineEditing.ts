import type { Clip } from "./types";

interface Interval {
  start: number;
  end: number;
}

export interface TimelineEditResult {
  clips: Clip[];
  removedTime: number;
}

const EPSILON = 1e-7;

/** Find empty time without treating overlapping clips as gaps. */
function trackGaps(
  clips: Clip[],
  track: number,
  from: number,
  to: number,
): Interval[] {
  const intervals = clips
    .filter((clip) => clip.track === track)
    .map((clip) => ({ start: clip.start, end: clip.start + clip.duration }))
    .sort((a, b) => a.start - b.start);
  const gaps: Interval[] = [];
  let cursor = from;
  for (const interval of intervals) {
    if (interval.end <= cursor + EPSILON) continue;
    if (interval.start >= to) break;
    if (interval.start > cursor + EPSILON)
      gaps.push({ start: cursor, end: Math.min(interval.start, to) });
    cursor = Math.max(cursor, interval.end);
    if (cursor >= to) break;
  }
  if (cursor < to - EPSILON) gaps.push({ start: cursor, end: to });
  return gaps;
}

function removeEmptyTime(
  clips: Clip[],
  track: number,
  gaps: Interval[],
): TimelineEditResult {
  const removedTime = gaps.reduce(
    (total, gap) => total + gap.end - gap.start,
    0,
  );
  if (removedTime <= EPSILON) return { clips, removedTime: 0 };
  return {
    removedTime,
    clips: clips.map((clip) => {
      if (clip.track !== track) return clip;
      const shift = gaps.reduce(
        (total, gap) =>
          total + Math.max(0, Math.min(clip.start, gap.end) - gap.start),
        0,
      );
      // Moving a clip never trims its source or changes clip-local animation.
      return shift > EPSILON
        ? { ...clip, start: Math.max(0, clip.start - shift) }
        : clip;
    }),
  };
}

/** Delete a clip and remove only its now-empty time on the same track. */
export function rippleDeleteClip(
  clips: Clip[],
  selectedId: string,
): TimelineEditResult {
  const selected = clips.find((clip) => clip.id === selectedId);
  if (!selected) return { clips, removedTime: 0 };
  const remaining = clips.filter((clip) => clip.id !== selectedId);
  return removeEmptyTime(
    remaining,
    selected.track,
    trackGaps(
      remaining,
      selected.track,
      selected.start,
      selected.start + selected.duration,
    ),
  );
}

/** Pack a track from time zero, preserving every overlap and source range. */
export function closeTrackGaps(
  clips: Clip[],
  track: number,
): TimelineEditResult {
  const end = clips.reduce(
    (latest, clip) =>
      clip.track === track
        ? Math.max(latest, clip.start + clip.duration)
        : latest,
    0,
  );
  return removeEmptyTime(clips, track, trackGaps(clips, track, 0, end));
}
