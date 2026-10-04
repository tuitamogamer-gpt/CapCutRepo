import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  Undo2,
  Redo2,
  Scissors,
  Copy,
  Trash2,
  Magnet,
  Link2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Film,
  Type,
  Music2,
  Volume2,
  VolumeX,
  LockKeyhole,
  UnlockKeyhole,
  ChevronRight,
  Play,
  Pause,
} from "lucide-react";
import type { Asset, Clip } from "../types";
import { DEFAULT_CLIP, formatTime, uid } from "../types";
import "./Timeline.css";

export interface TimelineProps {
  clips: Clip[];
  assets?: Asset[];
  selectedId: string | null;
  currentTime: number;
  duration: number;
  playing: boolean;
  onSelect: (id: string | null) => void;
  onSeek: (time: number) => void;
  onChange: (clips: Clip[]) => void;
  onPlay: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const ROWS = [
  { track: 1, name: "Text", icon: Type },
  { track: 0, name: "Video", icon: Film },
  { track: 2, name: "Audio", icon: Music2 },
];
interface AudioPeaks {
  peaks: Float32Array;
  duration: number;
}
function extractAudioPeaks(buffer: AudioBuffer): AudioPeaks {
  const count = Math.min(1000, buffer.length);
  const peaks = new Float32Array(count);
  let loudest = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < count; i++) {
      const from = Math.floor((i * samples.length) / count);
      const to = Math.floor(((i + 1) * samples.length) / count);
      let peak = peaks[i];
      for (let sample = from; sample < to; sample++)
        peak = Math.max(peak, Math.abs(samples[sample]));
      peaks[i] = peak;
      loudest = Math.max(loudest, peak);
    }
  }
  if (loudest > 0) for (let i = 0; i < count; i++) peaks[i] /= loudest;
  return { peaks, duration: buffer.duration };
}
function waveformHeight(
  waveform: AudioPeaks,
  clip: Clip,
  index: number,
  count: number,
) {
  const fromTime =
    clip.sourceOffset + (index / count) * clip.duration * clip.speed;
  const toTime =
    clip.sourceOffset + ((index + 1) / count) * clip.duration * clip.speed;
  const from = Math.max(
    0,
    Math.floor((fromTime / waveform.duration) * waveform.peaks.length),
  );
  const to = Math.min(
    waveform.peaks.length,
    Math.max(
      from + 1,
      Math.ceil((toTime / waveform.duration) * waveform.peaks.length),
    ),
  );
  let peak = 0;
  for (let i = from; i < to; i++) peak = Math.max(peak, waveform.peaks[i]);
  return `${Math.max(3, peak * 95)}%`;
}
function rulerTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
function ToolButton({
  label,
  children,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      className={`tl-tool${active ? " active" : ""}`}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function Timeline({
  clips,
  assets = [],
  selectedId,
  currentTime,
  duration,
  playing,
  onSelect,
  onSeek,
  onChange,
  onPlay,
  onSplit,
  onDelete,
  onDuplicate,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: TimelineProps) {
  const [zoom, setZoom] = useState(1);
  const [snapping, setSnapping] = useState(true);
  const [linked, setLinked] = useState(false);
  const [locked, setLocked] = useState<number[]>([]);
  const [draft, setDraft] = useState<Clip[] | null>(null);
  const [dragTrack, setDragTrack] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const audioPeakCache = useRef(new Map<string, AudioPeaks | null>());
  const [, setAudioPeakVersion] = useState(0);
  const audioSourcesKey = useMemo(
    () =>
      JSON.stringify(
        [
          ...new Set(
            clips
              .filter((clip) => clip.type === "audio" && clip.src)
              .map((clip) => clip.src),
          ),
        ].sort(),
      ),
    [clips],
  );
  const pixelsPerSecond = 55 * zoom;
  const timelineSeconds = Math.max(30, Math.ceil((duration + 8) / 5) * 5);
  const canvasWidth = timelineSeconds * pixelsPerSecond;
  const displayedClips = draft || clips;
  const majorStep = zoom < 0.65 ? 10 : zoom > 1.7 ? 2 : 5;

  useEffect(() => () => dragCleanup.current?.(), []);
  useEffect(() => {
    const sources = (JSON.parse(audioSourcesKey) as string[]).filter(
      (src) => !audioPeakCache.current.has(src),
    );
    if (!sources.length || typeof AudioContext === "undefined") return;
    const controller = new AbortController();
    const context = new AudioContext();
    let cancelled = false;
    void Promise.all(
      sources.map(async (src) => {
        try {
          const response = await fetch(src, { signal: controller.signal });
          if (!response.ok) throw new Error("Audio could not be loaded");
          const decoded = await context.decodeAudioData(
            await response.arrayBuffer(),
          );
          if (cancelled) return;
          audioPeakCache.current.set(src, extractAudioPeaks(decoded));
        } catch {
          if (cancelled) return;
          audioPeakCache.current.set(src, null);
        }
        setAudioPeakVersion((version) => version + 1);
      }),
    ).finally(() => {
      if (context.state !== "closed") void context.close().catch(() => {});
    });
    return () => {
      cancelled = true;
      controller.abort();
      if (context.state !== "closed") void context.close().catch(() => {});
    };
  }, [audioSourcesKey]);
  useEffect(() => {
    const node = scroller.current;
    if (!node || !playing) return;
    const x = currentTime * pixelsPerSecond;
    if (x > node.scrollLeft + node.clientWidth - 60 || x < node.scrollLeft)
      node.scrollLeft = Math.max(0, x - node.clientWidth * 0.35);
  }, [currentTime, pixelsPerSecond, playing]);

  function seekFromPointer(event: ReactPointerEvent<HTMLElement>) {
    if (!scroller.current) return;
    const rect = scroller.current.getBoundingClientRect();
    const time = Math.max(
      0,
      Math.min(
        duration,
        (event.clientX - rect.left + scroller.current.scrollLeft) /
          pixelsPerSecond,
      ),
    );
    onSeek(time);
  }

  function beginScrub(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    seekFromPointer(event);
    const node = scroller.current;
    if (!node) return;
    const move = (e: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      onSeek(
        Math.max(
          0,
          Math.min(
            duration,
            (e.clientX - rect.left + node.scrollLeft) / pixelsPerSecond,
          ),
        ),
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    dragCleanup.current = up;
  }

  function startDrag(
    event: ReactPointerEvent<HTMLElement>,
    clip: Clip,
    mode: "move" | "left" | "right",
  ) {
    if (event.button !== 0 || locked.includes(clip.track)) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(clip.id);
    const initialX = event.clientX;
    const initialScroll = scroller.current?.scrollLeft || 0;
    const isTimedMedia = clip.type === "video" || clip.type === "audio";
    const sourceAsset = isTimedMedia
      ? assets.find((asset) => asset.id === clip.assetId)
      : undefined;
    const sourceSpeed = Math.max(0.01, clip.speed);
    const maxDuration =
      sourceAsset &&
      Number.isFinite(sourceAsset.duration) &&
      sourceAsset.duration > 0
        ? Math.max(0, (sourceAsset.duration - clip.sourceOffset) / sourceSpeed)
        : Infinity;
    const minDuration = Math.min(0.3, clip.duration, maxDuration);
    let updated = clips;
    const snapPoints = [
      0,
      currentTime,
      ...clips
        .filter((c) => c.id !== clip.id)
        .flatMap((c) => [c.start, c.start + c.duration]),
    ];
    const snap = (value: number) => {
      if (!snapping) return Math.round(value * 100) / 100;
      const nearest = snapPoints.reduce(
        (a, b) => (Math.abs(value - b) < Math.abs(value - a) ? b : a),
        snapPoints[0],
      );
      return Math.abs(value - nearest) < 8 / pixelsPerSecond
        ? nearest
        : Math.round(value * 10) / 10;
    };
    const move = (e: PointerEvent) => {
      const delta =
        (e.clientX -
          initialX +
          (scroller.current?.scrollLeft || 0) -
          initialScroll) /
        pixelsPerSecond;
      let patch: Partial<Clip> = {};
      if (mode === "move") {
        let next = snap(clip.start + delta);
        if (snapping) {
          const endSnapped =
            snap(clip.start + delta + clip.duration) - clip.duration;
          if (
            Math.abs(endSnapped - clip.start - delta) <
            Math.abs(next - clip.start - delta)
          )
            next = endSnapped;
        }
        patch = { start: Math.max(0, next) };
      } else if (mode === "right") {
        patch = {
          duration: Math.min(
            maxDuration,
            Math.max(
              minDuration,
              snap(clip.start + clip.duration + delta) - clip.start,
            ),
          ),
        };
      } else {
        const earliestStart = isTimedMedia
          ? Math.max(0, clip.start - clip.sourceOffset / sourceSpeed)
          : 0;
        const nextStart = Math.max(
          earliestStart,
          Math.min(
            clip.start + clip.duration - minDuration,
            snap(clip.start + delta),
          ),
        );
        const appliedDelta = nextStart - clip.start;
        patch = {
          start: nextStart,
          duration: clip.duration - appliedDelta,
          sourceOffset: Math.max(
            0,
            clip.sourceOffset + appliedDelta * sourceSpeed,
          ),
        };
      }
      const groupDelta = (patch.start ?? clip.start) - clip.start;
      updated = clips.map((c) =>
        c.id === clip.id
          ? { ...c, ...patch }
          : linked &&
              mode === "move" &&
              !locked.includes(c.track) &&
              c.start >= clip.start
            ? { ...c, start: Math.max(0, c.start + groupDelta) }
            : c,
      );
      setDraft(updated);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDraft(null);
      if (updated !== clips) onChange(updated);
      dragCleanup.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    dragCleanup.current = up;
  }

  function dropAsset(event: DragEvent<HTMLDivElement>, track: number) {
    event.preventDefault();
    setDragTrack(null);
    if (locked.includes(track)) return;
    try {
      const asset = JSON.parse(
        event.dataTransfer.getData("application/capcut-asset"),
      ) as Asset;
      if (!asset.src || !asset.type) return;
      const rect = scroller.current!.getBoundingClientRect();
      const start = Math.max(
        0,
        (event.clientX - rect.left + scroller.current!.scrollLeft) /
          pixelsPerSecond,
      );
      const clip: Clip = {
        ...DEFAULT_CLIP,
        id: uid(),
        assetId: asset.id,
        name: asset.name,
        type: asset.type,
        src: asset.src,
        thumbnail: asset.thumbnail,
        start: Math.round(start * 10) / 10,
        duration: asset.duration || 5,
        track: asset.type === "audio" ? 2 : 0,
      };
      onChange([...clips, clip]);
      onSelect(clip.id);
    } catch {
      /* Unsupported drag payload. */
    }
  }

  function toggleMute(track: number) {
    const trackClips = clips.filter((c) => c.track === track);
    const muted = trackClips.every((c) => c.volume === 0);
    onChange(
      clips.map((c) =>
        c.track === track ? { ...c, volume: muted ? 80 : 0 } : c,
      ),
    );
  }

  return (
    <section className="timeline" aria-label="Video timeline">
      <div className="tl-toolbar">
        <div className="tl-toolbar-group">
          <ToolButton
            label="Undo (Ctrl+Z)"
            onClick={onUndo}
            disabled={!canUndo}
          >
            <Undo2 size={17} />
          </ToolButton>
          <ToolButton
            label="Redo (Ctrl+Shift+Z)"
            onClick={onRedo}
            disabled={!canRedo}
          >
            <Redo2 size={17} />
          </ToolButton>
          <span className="tl-divider" />
          <ToolButton
            label="Split at playhead (S)"
            onClick={onSplit}
            disabled={!selectedId}
          >
            <Scissors size={17} />
          </ToolButton>
          <ToolButton
            label="Duplicate clip (Ctrl+D)"
            onClick={onDuplicate}
            disabled={!selectedId}
          >
            <Copy size={16} />
          </ToolButton>
          <ToolButton
            label="Delete selected clip (Delete)"
            onClick={onDelete}
            disabled={!selectedId}
          >
            <Trash2 size={17} />
          </ToolButton>
          <span className="tl-divider" />
          <ToolButton
            label={snapping ? "Disable snapping" : "Enable snapping"}
            onClick={() => setSnapping(!snapping)}
            active={snapping}
          >
            <Magnet size={17} />
          </ToolButton>
          <ToolButton
            label={linked ? "Disable ripple editing" : "Enable ripple editing"}
            onClick={() => setLinked(!linked)}
            active={linked}
          >
            <Link2 size={17} />
          </ToolButton>
        </div>
        <div className="tl-toolbar-end">
          <span className="tl-timing">
            <span>{formatTime(currentTime)}</span>
            <em>/</em>
            {formatTime(duration)}
          </span>
          <ToolButton
            label="Zoom out timeline"
            onClick={() => setZoom((z) => Math.max(0.35, z - 0.15))}
          >
            <ZoomOut size={16} />
          </ToolButton>
          <input
            className="tl-zoom"
            aria-label="Timeline zoom"
            title="Timeline zoom"
            type="range"
            min="0.35"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <ToolButton
            label="Zoom in timeline"
            onClick={() => setZoom((z) => Math.min(3, z + 0.15))}
          >
            <ZoomIn size={16} />
          </ToolButton>
          <ToolButton
            label="Fit timeline to screen"
            onClick={() =>
              setZoom(
                Math.max(
                  0.35,
                  Math.min(
                    3,
                    (scroller.current?.clientWidth || 800) /
                      ((duration + 2) * 55),
                  ),
                ),
              )
            }
          >
            <Maximize2 size={15} />
          </ToolButton>
        </div>
      </div>
      <div className="tl-body">
        <div className="tl-track-headers">
          <div className="tl-header-ruler">
            <button
              className="tl-play"
              title={playing ? "Pause (Space)" : "Play (Space)"}
              aria-label={playing ? "Pause timeline" : "Play timeline"}
              onClick={onPlay}
            >
              {playing ? (
                <Pause size={13} fill="currentColor" />
              ) : (
                <Play size={13} fill="currentColor" />
              )}
            </button>
            <span>Tracks</span>
            <ChevronRight size={11} />
          </div>
          {ROWS.map(({ track, name, icon: Icon }) => (
            <div className={`tl-track-header tl-row-${track}`} key={track}>
              <div className="tl-track-name">
                <Icon size={15} />
                <span>{name}</span>
              </div>
              <div className="tl-track-actions">
                <button
                  title={
                    locked.includes(track)
                      ? `Unlock ${name.toLowerCase()} track`
                      : `Lock ${name.toLowerCase()} track`
                  }
                  aria-label={
                    locked.includes(track)
                      ? `Unlock ${name.toLowerCase()} track`
                      : `Lock ${name.toLowerCase()} track`
                  }
                  className={locked.includes(track) ? "is-locked" : ""}
                  onClick={() =>
                    setLocked((prev) =>
                      prev.includes(track)
                        ? prev.filter((n) => n !== track)
                        : [...prev, track],
                    )
                  }
                >
                  {locked.includes(track) ? (
                    <LockKeyhole size={12} />
                  ) : (
                    <UnlockKeyhole size={12} />
                  )}
                </button>
                {track !== 1 && (
                  <button
                    title={`Mute or unmute ${name.toLowerCase()} track`}
                    aria-label={`Mute or unmute ${name.toLowerCase()} track`}
                    onClick={() => toggleMute(track)}
                  >
                    {clips
                      .filter((c) => c.track === track)
                      .every((c) => c.volume === 0) ? (
                      <VolumeX size={13} />
                    ) : (
                      <Volume2 size={13} />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="tl-scroll" ref={scroller}>
          <div
            className="tl-canvas"
            style={{ width: canvasWidth, minWidth: "100%" }}
          >
            <div className="tl-ruler" onPointerDown={beginScrub}>
              {Array.from(
                { length: Math.ceil(timelineSeconds) + 1 },
                (_, second) => (
                  <div
                    key={second}
                    className={`tl-tick${second % majorStep === 0 ? " major" : ""}`}
                    style={{ left: second * pixelsPerSecond }}
                  >
                    {second % majorStep === 0 && (
                      <span>{rulerTime(second)}</span>
                    )}
                  </div>
                ),
              )}
            </div>
            {ROWS.map(({ track, name }) => (
              <div
                key={track}
                className={`tl-track tl-row-${track}${dragTrack === track ? " drag-over" : ""}${locked.includes(track) ? " locked" : ""}`}
                aria-label={`${name} track`}
                onPointerDown={(event) => {
                  onSelect(null);
                  seekFromPointer(event);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragTrack(track);
                }}
                onDragLeave={() => setDragTrack(null)}
                onDrop={(event) => dropAsset(event, track)}
              >
                {!displayedClips.some((c) => c.track === track) && (
                  <span className="tl-empty-track">
                    {track === 1
                      ? "Add text and stickers"
                      : track === 0
                        ? "Drag your videos here to start creating"
                        : "Drag audio here"}
                  </span>
                )}
                {displayedClips
                  .filter((c) => c.track === track)
                  .map((clip) => {
                    const width = Math.max(12, clip.duration * pixelsPerSecond);
                    const waveform =
                      clip.type === "audio"
                        ? audioPeakCache.current.get(clip.src)
                        : undefined;
                    const waveformBars = Math.ceil(width / 4);
                    return (
                      <div
                        key={clip.id}
                        className={`tl-clip tl-clip-${clip.type}${selectedId === clip.id ? " selected" : ""}`}
                        style={
                          {
                            left: clip.start * pixelsPerSecond,
                            width,
                          } as CSSProperties
                        }
                        title={`${clip.name} · ${formatTime(clip.duration)}`}
                        onPointerDown={(event) =>
                          startDrag(event, clip, "move")
                        }
                        onDoubleClick={() => {
                          onSelect(clip.id);
                          onSeek(clip.start);
                        }}
                      >
                        {(clip.type === "video" || clip.type === "image") && (
                          <div className="tl-thumbnails" aria-hidden="true">
                            {Array.from(
                              { length: Math.ceil(width / 68) },
                              (_, i) => (
                                <img
                                  key={i}
                                  src={clip.thumbnail || clip.src}
                                  alt=""
                                  draggable={false}
                                />
                              ),
                            )}
                          </div>
                        )}
                        {clip.type === "audio" && (
                          <div
                            className="tl-waveform"
                            aria-hidden="true"
                            data-waveform={waveform ? "decoded" : "placeholder"}
                          >
                            {waveform ? (
                              Array.from({ length: waveformBars }, (_, i) => (
                                <i
                                  key={i}
                                  style={{
                                    height: waveformHeight(
                                      waveform,
                                      clip,
                                      i,
                                      waveformBars,
                                    ),
                                  }}
                                />
                              ))
                            ) : (
                              <span
                                style={{
                                  height: 1,
                                  width: "100%",
                                  background: "#37c6a7",
                                  opacity: 0.4,
                                }}
                              />
                            )}
                          </div>
                        )}
                        <div className="tl-clip-label">
                          {clip.type === "audio" ? (
                            <Music2 size={11} />
                          ) : clip.type === "text" ||
                            clip.type === "sticker" ? (
                            <Type size={11} />
                          ) : (
                            <Film size={11} />
                          )}
                          <span>
                            {clip.type === "text"
                              ? clip.text || clip.name
                              : clip.name}
                          </span>
                        </div>
                        <div
                          className="tl-trim tl-trim-left"
                          title="Trim clip start"
                          onPointerDown={(event) =>
                            startDrag(event, clip, "left")
                          }
                        >
                          <i />
                        </div>
                        <div
                          className="tl-trim tl-trim-right"
                          title="Trim clip end"
                          onPointerDown={(event) =>
                            startDrag(event, clip, "right")
                          }
                        >
                          <i />
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
            <div
              className="tl-playhead"
              style={{ left: currentTime * pixelsPerSecond }}
              onPointerDown={beginScrub}
            >
              <div className="tl-playhead-cap" />
              <div className="tl-playhead-line" />
            </div>
          </div>
        </div>
      </div>
      <div className="tl-bottom">
        <span>
          <i />
          {clips.length} clips <b>·</b> {rulerTime(duration)} total
        </span>
        <span>
          Drag to arrange <b>·</b> S to split <b>·</b> Space to play
        </span>
        <span>
          30 fps <b>·</b> {Math.round(zoom * 100)}%
        </span>
      </div>
    </section>
  );
}
