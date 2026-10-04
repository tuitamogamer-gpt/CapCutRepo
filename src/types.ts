export type MediaKind = "video" | "image" | "audio" | "text" | "sticker";
export interface Asset {
  id: string;
  name: string;
  type: "video" | "image" | "audio";
  src: string;
  thumbnail: string;
  duration: number;
  category?: string;
}
export type AnimationPreset =
  "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "rise";
export interface TransformKeyframe {
  time: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}
export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: string;
}
export interface Clip {
  id: string;
  assetId?: string;
  name: string;
  type: MediaKind;
  src: string;
  thumbnail?: string;
  start: number;
  duration: number;
  sourceOffset: number;
  track: number;
  text?: string;
  fontSize: number;
  color: string;
  fontFamily: string;
  bold: boolean;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  volume: number;
  speed: number;
  brightness: number;
  contrast: number;
  saturation: number;
  filter: string;
  fadeIn: number;
  fadeOut: number;
  flipX?: boolean;
  flipY?: boolean;
  fit?: "cover" | "contain";
  crop?: { top: number; right: number; bottom: number; left: number };
  animation?: AnimationPreset;
  keyframes?: TransformKeyframe[];
  textAlign?: "left" | "center" | "right";
  textBackground?: string;
  textStroke?: number;
  lineSpacing?: number;
  isCaption?: boolean;
}
export interface Project {
  id?: string;
  markers?: TimelineMarker[];
  name: string;
  clips: Clip[];
  assets: Asset[];
  aspectRatio: string;
  background: string;
}
export const DEFAULT_CLIP: Omit<
  Clip,
  "id" | "name" | "type" | "src" | "start" | "duration" | "track"
> = {
  sourceOffset: 0,
  fontSize: 66,
  color: "#ffffff",
  fontFamily: "Inter",
  bold: true,
  x: 0,
  y: 0,
  scale: 100,
  rotation: 0,
  opacity: 100,
  volume: 80,
  speed: 1,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  filter: "None",
  fadeIn: 0,
  fadeOut: 0,
};
export const FILTERS = [
  "None",
  "Golden hour",
  "Cinematic",
  "Vintage",
  "B&W",
  "Cool blue",
  "Vivid",
  "Fade",
];
export function filterStyle(clip: Clip) {
  const preset: Record<string, string> = {
    "Golden hour": "sepia(.25) saturate(1.3)",
    Cinematic: "contrast(1.15) saturate(.7)",
    Vintage: "sepia(.55) contrast(.9)",
    "B&W": "grayscale(1)",
    "Cool blue": "hue-rotate(15deg) saturate(.7)",
    Vivid: "saturate(1.65)",
    Fade: "contrast(.8) brightness(1.15)",
  };
  return `brightness(${clip.brightness}%) contrast(${clip.contrast}%) saturate(${clip.saturation}%) ${preset[clip.filter] || ""}`;
}
export function formatTime(seconds: number) {
  const n = Math.max(0, seconds);
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(Math.floor(n % 60)).padStart(2, "0")}:${String(Math.floor((n % 1) * 30)).padStart(2, "0")}`;
}
export function projectDuration(clips: Clip[]) {
  return Math.max(1, ...clips.map((c) => c.start + c.duration));
}
export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
