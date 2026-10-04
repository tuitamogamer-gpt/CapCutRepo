import type { Clip, TransformKeyframe } from "./types";

const TRANSFORM_FIELDS = ["x", "y", "scale", "rotation", "opacity"] as const;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Sample a clip's transform using a global timeline time. Keyframe times are local. */
export function clipTransformAt(clip: Clip, time: number): TransformKeyframe {
  const local = clamp(time - clip.start, 0, Math.max(0, clip.duration));
  const result: TransformKeyframe = {
    time: local,
    x: clip.x,
    y: clip.y,
    scale: clip.scale,
    rotation: clip.rotation,
    opacity: clip.opacity,
  };
  const frames = clip.keyframes
    ?.filter((frame) => Number.isFinite(frame.time))
    .slice()
    .sort((a, b) => a.time - b.time);
  if (frames?.length) {
    const left =
      [...frames].reverse().find((frame) => frame.time <= local) ?? frames[0];
    const right =
      frames.find((frame) => frame.time > local) ?? frames[frames.length - 1];
    const progress =
      right.time > left.time
        ? clamp((local - left.time) / (right.time - left.time), 0, 1)
        : 0;
    for (const field of TRANSFORM_FIELDS)
      result[field] = left[field] + (right[field] - left[field]) * progress;
    return result;
  }
  const progress = clip.duration > 0 ? local / clip.duration : 0;
  switch (clip.animation) {
    case "zoom-in":
      result.scale *= 1 + progress * 0.18;
      break;
    case "zoom-out":
      result.scale *= 1.18 - progress * 0.18;
      break;
    case "pan-left":
      result.x += (0.5 - progress) * 20;
      break;
    case "pan-right":
      result.x += (progress - 0.5) * 20;
      break;
    case "rise":
      result.y += (1 - progress) * 20;
      break;
  }
  return result;
}

export function evaluateClip(clip: Clip, time: number): Clip {
  const { time: _localTime, ...transform } = clipTransformAt(clip, time);
  return { ...clip, ...transform };
}

/** Preserve motion when trimming or splitting. The returned times start at zero. */
export function sliceKeyframes(
  clip: Clip,
  from: number,
  to: number,
): TransformKeyframe[] | undefined {
  if (!clip.keyframes?.length && (!clip.animation || clip.animation === "none"))
    return undefined;
  const start = clamp(from, 0, clip.duration);
  const end = clamp(to, start, clip.duration);
  const first = { ...clipTransformAt(clip, clip.start + start), time: 0 };
  if (end === start) return [first];
  const interior = (clip.keyframes ?? [])
    .filter((frame) => frame.time > start && frame.time < end)
    .sort((a, b) => a.time - b.time)
    .map((frame) => ({ ...frame, time: frame.time - start }));
  return [
    first,
    ...interior,
    { ...clipTransformAt(clip, clip.start + end), time: end - start },
  ];
}
