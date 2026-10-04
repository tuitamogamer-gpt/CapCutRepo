import type { Clip } from "./types";

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

function parseTimestamp(value: string): number | null {
  const match = /^(?:(\d{2,}):)?(\d{2}):(\d{2})[.,](\d{1,3})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes >= 60 || seconds >= 60) return null;
  const result =
    hours * 3600 +
    minutes * 60 +
    seconds +
    Number(match[4].padEnd(3, "0")) / 1000;
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function plainSubtitleText(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    nbsp: " ",
    quot: '"',
    apos: "'",
    lrm: "\u200e",
    rlm: "\u200f",
  };
  // Subtitle markup is never interpreted as HTML. Decode after stripping tags so
  // escaped angle brackets remain literal caption text.
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>\n]*>/g, "")
    .replace(
      /&(#x[\da-f]+|#\d+|amp|lt|gt|nbsp|quot|apos|lrm|rlm);/gi,
      (original, entity: string) => {
        const name = entity.toLowerCase();
        if (!name.startsWith("#")) return entities[name] ?? original;
        const code = name.startsWith("#x")
          ? parseInt(name.slice(2), 16)
          : Number(name.slice(1));
        return code > 0 &&
          code <= 0x10ffff &&
          !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : original;
      },
    )
    .trim();
}

/** Read SRT or WebVTT, returning recoverable problems alongside valid cues. */
export function parseSubtitles(text: string): {
  cues: SubtitleCue[];
  warnings: string[];
} {
  const cues: SubtitleCue[] = [];
  const warnings: string[] = [];
  const source = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!source) return { cues, warnings: ["The subtitle file is empty."] };
  const blocks = source.split(/\n[\t ]*\n+/);
  const isVtt = /^WEBVTT(?:[\t ]|\n|$)/.test(source);
  for (let index = 0; index < blocks.length; index++) {
    let lines = blocks[index].split("\n");
    if (index === 0 && isVtt) {
      lines = lines.slice(1);
      // Header metadata is valid. Also recover files with no blank line between
      // the WebVTT header and their first cue.
      const firstTiming = lines.findIndex((line) => line.includes("-->"));
      if (firstTiming === -1) continue;
      lines = lines.slice(firstTiming);
    }
    if (
      !lines.length ||
      (isVtt && /^(NOTE(?:[\t ]|$)|STYLE$|REGION$)/.test(lines[0].trim()))
    )
      continue;
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    const label = `Block ${index + 1}`;
    if (timingIndex < 0 || timingIndex > 1) {
      warnings.push(
        `${label}: skipped because a valid cue timing line is missing.`,
      );
      continue;
    }
    const timing = /^\s*(\S+)\s*-->\s*(\S+)(?:[\t ]+.*)?$/.exec(
      lines[timingIndex],
    );
    const start = timing ? parseTimestamp(timing[1]) : null;
    const end = timing ? parseTimestamp(timing[2]) : null;
    if (start === null || end === null || end <= start) {
      warnings.push(
        `${label}: skipped invalid timing; use a nonnegative start and an end after the start.`,
      );
      continue;
    }
    const payload = lines.slice(timingIndex + 1);
    if (payload.some((line) => line.includes("-->"))) {
      warnings.push(
        `${label}: skipped because cues must be separated by a blank line.`,
      );
      continue;
    }
    const content = plainSubtitleText(payload.join("\n"));
    if (!content) {
      warnings.push(`${label}: skipped an empty caption.`);
      continue;
    }
    cues.push({ start, end, text: content });
  }
  if (!cues.length && !warnings.length)
    warnings.push("No timed captions were found in this file.");
  return { cues: cues.sort((a, b) => a.start - b.start), warnings };
}

function timestamp(milliseconds: number, format: "srt" | "vtt"): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const seconds = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${format === "srt" ? "," : "."}${String(milliseconds % 1000).padStart(3, "0")}`;
}

export function serializeSubtitles(
  clips: Clip[],
  format: "srt" | "vtt",
): string {
  const captions = clips
    .filter(
      (clip) =>
        clip.type === "text" &&
        clip.isCaption &&
        clip.text?.trim() &&
        Number.isFinite(clip.start) &&
        clip.start >= 0 &&
        Number.isFinite(clip.duration) &&
        clip.duration > 0,
    )
    .sort((a, b) => a.start - b.start);
  const body = captions
    .map((clip, index) => {
      const start = Math.round(clip.start * 1000);
      const end = Math.max(
        start + 1,
        Math.round((clip.start + clip.duration) * 1000),
      );
      const content = clip
        .text!.trim()
        .replace(/\r\n?/g, "\n")
        .replace(/\n[\t ]*\n+/g, "\n")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `${index + 1}\n${timestamp(start, format)} --> ${timestamp(end, format)}\n${content}`;
    })
    .join("\n\n");
  return `${format === "vtt" ? "WEBVTT\n\n" : ""}${body}${body ? "\n" : ""}`;
}
