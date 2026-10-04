import { useState, useEffect, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import {
  ChevronDown,
  Check,
  Cloud,
  Download,
  Film,
  Music2,
  Type,
  Smile,
  Sparkles,
  Blend,
  SlidersHorizontal,
  Captions,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize,
  Volume2,
  VolumeX,
  X,
  FolderOpen,
  FilePlus2,
  Save,
  Keyboard,
  CircleHelp,
  Upload,
  ArrowUpRight,
  CheckCircle2,
  LoaderCircle,
  Undo2,
  MoreHorizontal,
  Monitor,
  Diamond,
  Plus,
  Mic,
  Camera,
  Layers,
  Scissors,
} from "lucide-react";
import type { Clip, Asset, Project } from "./types";
import {
  DEFAULT_CLIP,
  uid,
  projectDuration,
  formatTime,
  filterStyle,
} from "./types";
import { createDemoProject } from "./demo";
import MediaLibrary from "./components/MediaLibrary";
import Timeline from "./components/Timeline";
import Inspector from "./components/Inspector";
import {
  exportVideo,
  downloadBlob,
  exportFrame,
  getExportFormats,
} from "./exportVideo";
import { evaluateClip, clipTransformAt, sliceKeyframes } from "./animation";
import {
  loadCurrentProject,
  saveCurrentProject,
  saveProjectCopy,
} from "./projectStorage";
import ProjectLibrary from "./components/ProjectLibrary";
import CaptionsPanel from "./components/CaptionsPanel";
import RecorderPanel from "./components/RecorderPanel";

const NAV = [
  { name: "Media", icon: Film },
  { name: "Audio", icon: Music2 },
  { name: "Text", icon: Type },
  { name: "Stickers", icon: Smile },
  { name: "Effects", icon: Sparkles },
  { name: "Transitions", icon: Blend },
  { name: "Filters", icon: SlidersHorizontal },
  { name: "Captions", icon: Captions },
];
function IconButton({
  children,
  title,
  onClick,
  className = "",
  disabled = false,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button ${className}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function clipFade(clip: Clip, time: number) {
  const local = time - clip.start;
  const fadeIn =
    clip.fadeIn > 0 ? Math.max(0, Math.min(1, local / clip.fadeIn)) : 1;
  const fadeOut =
    clip.fadeOut > 0
      ? Math.max(0, Math.min(1, (clip.duration - local) / clip.fadeOut))
      : 1;
  return fadeIn * fadeOut;
}
function MediaElement({
  clip,
  time,
  playing,
  muted,
  onSelect,
}: {
  clip: Clip;
  time: number;
  playing: boolean;
  muted: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const active = time >= clip.start && time < clip.start + clip.duration;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const envelope = clipFade(clip, time);
    el.volume = muted
      ? 0
      : Math.min(1, Math.max(0, clip.volume / 100)) * envelope;
    el.playbackRate = clip.speed;
    const target = Math.max(
      0,
      clip.sourceOffset + (time - clip.start) * clip.speed,
    );
    if (active) {
      if (Math.abs(el.currentTime - target) > 0.32) el.currentTime = target;
      if (playing) void el.play().catch(() => {});
      else el.pause();
    } else el.pause();
  }, [time, playing, active, clip, muted]);
  if (clip.type === "audio")
    return <audio ref={ref} src={clip.src} preload="auto" />;
  const fade = clipFade(clip, time);
  const evaluated = evaluateClip(clip, time);
  const crop = clip.crop;
  const style: CSSProperties = {
    display: active ? "block" : "none",
    filter: filterStyle(clip),
    opacity: (evaluated.opacity / 100) * Math.max(0, fade),
    objectFit: clip.fit || "cover",
    clipPath: crop
      ? `inset(${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%)`
      : undefined,
    transform: `translate(${evaluated.x}%, ${evaluated.y}%) rotate(${evaluated.rotation}deg) scale(${(evaluated.scale / 100) * (clip.flipX ? -1 : 1)}, ${(evaluated.scale / 100) * (clip.flipY ? -1 : 1)})`,
  };
  return clip.type === "video" ? (
    <video
      ref={ref}
      className="preview-media"
      src={clip.src}
      preload="auto"
      playsInline
      style={style}
      onClick={onSelect}
    />
  ) : (
    <img
      className="preview-media"
      src={clip.src}
      draggable={false}
      alt={clip.name}
      style={style}
      onClick={onSelect}
    />
  );
}
function Preview({
  project,
  currentTime,
  playing,
  muted,
  selectedId,
  onSelect,
  onChange,
}: {
  project: Project;
  currentTime: number;
  playing: boolean;
  muted: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<Clip>) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(640);
  const [a, b] = project.aspectRatio.split(":").map(Number);
  useEffect(() => {
    if (!stage.current) return;
    const ro = new ResizeObserver((entries) =>
      setStageWidth(entries[0].contentRect.width),
    );
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, []);
  const drag = (e: React.PointerEvent, original: Clip) => {
    const clip = evaluateClip(original, currentTime);
    e.stopPropagation();
    onSelect(clip.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    const startX = e.clientX,
      startY = e.clientY;
    const rect = stage.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) =>
      onChange(clip.id, {
        x: Math.round(clip.x + ((ev.clientX - startX) / rect.width) * 100),
        y: Math.round(clip.y + ((ev.clientY - startY) / rect.height) * 100),
      });
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  };
  return (
    <div className="stage-wrap">
      <div
        className="preview-stage"
        ref={stage}
        style={{
          aspectRatio: `${a}/${b}`,
          background: project.background,
          maxWidth: a / b < 1 ? "32vh" : "100%",
          width: "100%",
        }}
      >
        {project.clips
          .filter(
            (c) =>
              c.type === "image" || c.type === "video" || c.type === "audio",
          )
          .sort((x, y) => x.track - y.track || x.start - y.start)
          .map((c) => (
            <MediaElement
              key={c.id}
              clip={c}
              time={currentTime}
              playing={playing}
              muted={muted}
              onSelect={() => onSelect(c.id)}
            />
          ))}
        {project.clips
          .filter(
            (c) =>
              (c.type === "text" || c.type === "sticker") &&
              currentTime >= c.start &&
              currentTime < c.start + c.duration,
          )
          .sort((x, y) => x.start - y.start)
          .map((original) => {
            const c = evaluateClip(original, currentTime);
            const fade = clipFade(c, currentTime);
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                aria-label={`Edit ${c.type}: ${c.text}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelect(c.id);
                }}
                onPointerDown={(e) => drag(e, original)}
                className={`preview-text ${selectedId === c.id ? "selected" : ""}`}
                style={{
                  left: `${50 + c.x}%`,
                  top: `${50 + c.y}%`,
                  color: c.color,
                  filter: filterStyle(c),
                  fontFamily: c.fontFamily,
                  fontSize: `${(c.fontSize * stageWidth) / 960}px`,
                  fontWeight: c.bold ? 700 : 400,
                  textAlign: c.textAlign || "center",
                  background: c.textBackground || "transparent",
                  lineHeight: c.lineSpacing || 1.09,
                  padding: `${(8 * stageWidth) / 960}px ${(13 * stageWidth) / 960}px`,
                  WebkitTextStroke: c.textStroke
                    ? `${(c.textStroke * stageWidth) / 960}px #000`
                    : undefined,
                  paintOrder: "stroke fill",
                  opacity: (c.opacity / 100) * Math.max(0, fade),
                  transform: `translate(-50%,-50%) rotate(${c.rotation}deg) scale(${(c.scale / 100) * (c.flipX ? -1 : 1)}, ${(c.scale / 100) * (c.flipY ? -1 : 1)})`,
                }}
              >
                {c.text}
              </div>
            );
          })}
        {project.clips.filter((c) => c.type !== "audio").length === 0 && (
          <div className="empty-stage">
            <Film size={38} />
            <p>Your next great story starts here</p>
            <span>Import media to start creating</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [project, setProject] = useState<Project>(() => ({
    ...createDemoProject(),
    id: uid(),
    markers: [],
  }));
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => createDemoProject().clips.find((c) => c.track === 0)?.id || null,
  );
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("Media");
  const [libraryOpen, setLibraryOpen] = useState(() => window.innerWidth > 640);
  const [currentTime, setCurrentTime] = useState(1.8);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<
    "export" | "shortcuts" | "projects" | "record" | null
  >(null);
  const [toast, setToast] = useState("");
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resolution, setResolution] = useState("1080");
  const [fps, setFps] = useState("30");
  const [exportDone, setExportDone] = useState(false);
  const [exportFormat, setExportFormat] = useState<"webm" | "mp4">(
    () => getExportFormats()[0]?.id || "webm",
  );
  const [frameExporting, setFrameExporting] = useState(false);
  const [loop, setLoop] = useState(false);
  const [formats] = useState(getExportFormats);
  const exportAbort = useRef<AbortController | null>(null);
  const lastEdit = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectRef = useRef(project);
  const previewRef = useRef<HTMLDivElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const duration = projectDuration(project.clips);
  const selected = project.clips.find((c) => c.id === selectedId) || null;
  useEffect(() => {
    loadCurrentProject()
      .then((p) => {
        if (p && Array.isArray(p.clips) && Array.isArray(p.assets)) {
          setProject(p);
          setSelectedId(p.clips.find((c) => c.track === 0)?.id || null);
          setCurrentTime(0);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    projectRef.current = project;
    if (!ready) return;
    setSaved(false);
    const t = setTimeout(() => {
      saveCurrentProject(project)
        .then(() => setSaved(true))
        .catch(() =>
          notify("Browser storage is full. Save a project file from the menu."),
        );
    }, 700);
    saveTimer.current = t;
    return () => {
      clearTimeout(t);
      saveTimer.current = null;
    };
  }, [project, ready]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3600);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = useCallback((message: string) => setToast(message), []);
  const commit = useCallback(
    (change: Project | ((prev: Project) => Project), group = false) => {
      const prev = projectRef.current;
      const next = typeof change === "function" ? change(prev) : change;
      const now = Date.now();
      if (!group || now - lastEdit.current > 450)
        setUndoStack((s) => [...s.slice(-59), prev]);
      lastEdit.current = now;
      setRedoStack([]);
      projectRef.current = next;
      setProject(next);
    },
    [],
  );
  const updateClip = useCallback(
    (id: string, patch: Partial<Clip>) =>
      commit(
        (p) => ({
          ...p,
          clips: p.clips.map((c) => {
            if (c.id !== id) return c;
            const adjusted = { ...patch };
            if (patch.speed !== undefined && patch.duration === undefined) {
              adjusted.duration = (c.duration * c.speed) / patch.speed;
              if (c.keyframes?.length && patch.keyframes === undefined)
                adjusted.keyframes = c.keyframes.map((k) => ({
                  ...k,
                  time: (k.time * c.speed) / patch.speed!,
                }));
            }
            if (
              (c.keyframes?.length ||
                (c.animation && c.animation !== "none")) &&
              patch.keyframes === undefined &&
              ["x", "y", "scale", "rotation", "opacity"].some(
                (key) => key in patch,
              )
            ) {
              const sample = clipTransformAt(c, currentTime);
              const keyframe = {
                ...sample,
                ...Object.fromEntries(
                  Object.entries(patch).filter(([key]) =>
                    ["x", "y", "scale", "rotation", "opacity"].includes(key),
                  ),
                ),
              };
              adjusted.keyframes = [
                ...(c.keyframes?.length
                  ? c.keyframes
                  : sliceKeyframes(c, 0, c.duration) || []
                ).filter((k) => Math.abs(k.time - sample.time) > 1 / 60),
                keyframe,
              ].sort((a, b) => a.time - b.time);
              adjusted.animation = "none";
            }
            if (patch.text !== undefined)
              adjusted.name = patch.text.slice(0, 32) || "Text";
            return { ...c, ...adjusted };
          }),
        }),
        true,
      ),
    [commit, currentTime],
  );
  const undo = useCallback(() => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((s) => [...s, project]);
    setUndoStack((s) => s.slice(0, -1));
    setProject(prev);
  }, [undoStack, project]);
  const redo = useCallback(() => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((s) => [...s, project]);
    setRedoStack((s) => s.slice(0, -1));
    setProject(next);
  }, [redoStack, project]);
  const deleteClip = useCallback(() => {
    if (!selectedId) return;
    commit((p) => ({
      ...p,
      clips: p.clips.filter((c) => c.id !== selectedId),
    }));
    setSelectedId(null);
    notify("Clip deleted");
  }, [selectedId, commit, notify]);
  const duplicate = useCallback(() => {
    if (!selected) return;
    const c = {
      ...selected,
      id: uid(),
      start: selected.start + selected.duration,
    };
    commit((p) => ({ ...p, clips: [...p.clips, c] }));
    setSelectedId(c.id);
    notify("Clip duplicated");
  }, [selected, commit, notify]);
  const split = useCallback(() => {
    if (!selected) {
      notify("Select a clip to split");
      return;
    }
    if (
      currentTime <= selected.start + 0.1 ||
      currentTime >= selected.start + selected.duration - 0.1
    ) {
      notify("Move the playhead inside the selected clip");
      return;
    }
    const local = currentTime - selected.start;
    const first: Clip = {
      ...selected,
      duration: local,
      keyframes: sliceKeyframes(selected, 0, local),
      animation: "none",
    };
    const second: Clip = {
      ...selected,
      keyframes: sliceKeyframes(selected, local, selected.duration),
      animation: "none",
      id: uid(),
      start: currentTime,
      duration: selected.start + selected.duration - currentTime,
      sourceOffset:
        selected.sourceOffset + (currentTime - selected.start) * selected.speed,
    };
    commit((p) => ({
      ...p,
      clips: p.clips.flatMap((c) =>
        c.id === selected.id ? [first, second] : [c],
      ),
    }));
    setSelectedId(second.id);
    notify("Clip split at playhead");
  }, [selected, currentTime, commit, notify]);
  const togglePlay = useCallback(() => {
    if (currentTime >= duration - 0.05) setCurrentTime(0);
    setPlaying((p) => !p);
  }, [currentTime, duration]);
  useEffect(() => {
    if (!playing) return;
    let frame: number,
      last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      setCurrentTime((t) => {
        if (t + delta >= duration) {
          if (loop) return 0;
          setPlaying(false);
          return duration;
        }
        return t + delta;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, loop]);
  useEffect(() => {
    if (currentTime > duration) setCurrentTime(duration);
  }, [duration, currentTime]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      if (e.key === "Escape") {
        exportAbort.current?.abort();
        setModal(null);
        setMenuOpen(false);
        setSelectedId(null);
      }
      if (modal) return;
      if (e.key.toLowerCase() === "m" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        addMarker();
      }
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteClip();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentTime((t) =>
          Math.min(duration, t + (e.shiftKey ? 1 : 1 / 30)),
        );
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentTime((t) => Math.max(0, t - (e.shiftKey ? 1 : 1 / 30)));
      }
      if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) split();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        downloadBlob(
          new Blob([JSON.stringify(projectRef.current)], {
            type: "application/json",
          }),
          `${projectRef.current.name}.capcut.json`,
        );
        notify("Project downloaded");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    togglePlay,
    deleteClip,
    split,
    undo,
    redo,
    duplicate,
    duration,
    notify,
    modal,
    currentTime,
  ]);
  const addAsset = useCallback(
    (asset: Asset, overlay = false) => {
      const p = projectRef.current;
      const track = asset.type === "audio" ? 2 : overlay ? 3 : 0;
      const start =
        track === 0
          ? Math.max(
              0,
              ...p.clips
                .filter((c) => c.track === 0)
                .map((c) => c.start + c.duration),
            )
          : currentTime;
      const clip: Clip = {
        ...DEFAULT_CLIP,
        id: uid(),
        assetId: asset.id,
        name: asset.name,
        type: asset.type,
        src: asset.src,
        thumbnail: asset.thumbnail,
        start,
        duration: asset.duration || 5,
        track,
        ...(overlay ? { scale: 35, x: 28, y: 25 } : {}),
      };
      commit((prev) => ({
        ...prev,
        assets: prev.assets.some((a) => a.id === asset.id)
          ? prev.assets
          : [...prev.assets, asset],
        clips: [...prev.clips, clip],
      }));
      setSelectedId(clip.id);
      setCurrentTime(start);
      notify("Added to timeline");
    },
    [commit, currentTime, notify],
  );
  const addText = useCallback(
    (text = "Your story starts here") => {
      const c: Clip = {
        ...DEFAULT_CLIP,
        id: uid(),
        name: text.slice(0, 25),
        type: "text",
        src: "",
        text,
        start: currentTime,
        duration: Math.max(3, Math.min(5, duration - currentTime)),
        track: 1,
      };
      commit((p) => ({ ...p, clips: [...p.clips, c] }));
      setSelectedId(c.id);
      setActiveTab("Text");
      notify("Text added. Drag it in the preview to reposition.");
    },
    [commit, currentTime, duration, notify],
  );
  const addSticker = (emoji: string) => {
    const c: Clip = {
      ...DEFAULT_CLIP,
      id: uid(),
      name: emoji + " Sticker",
      type: "sticker",
      src: "",
      text: emoji,
      fontSize: 100,
      start: currentTime,
      duration: 4,
      track: 1,
    };
    commit((p) => ({ ...p, clips: [...p.clips, c] }));
    setSelectedId(c.id);
  };
  const importFiles = async (files: FileList | File[]) => {
    const imported: Asset[] = [];
    for (const f of Array.from(files)) {
      const type = f.type.startsWith("video/")
        ? "video"
        : f.type.startsWith("audio/")
          ? "audio"
          : f.type.startsWith("image/")
            ? "image"
            : null;
      if (!type) {
        notify(`Unsupported file: ${f.name}`);
        continue;
      }
      try {
        const src = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(f);
        });
        let mediaDuration = 5,
          thumbnail = type === "image" ? src : "";
        if (type !== "image") {
          const el = document.createElement(
            type === "video" ? "video" : "audio",
          );
          el.preload = "metadata";
          el.src = src;
          await new Promise<void>((resolve, reject) => {
            el.onloadedmetadata = () => {
              mediaDuration = Number.isFinite(el.duration) ? el.duration : 10;
              resolve();
            };
            el.onerror = () => reject(new Error("Cannot read media"));
          });
          if (type === "video") {
            const video = el as HTMLVideoElement;
            video.currentTime = Math.min(0.1, mediaDuration / 2);
            await new Promise<void>((resolve) => {
              video.onseeked = () => resolve();
              setTimeout(resolve, 800);
            });
            const canvas = document.createElement("canvas");
            canvas.width = 320;
            canvas.height = 180;
            canvas.getContext("2d")?.drawImage(video, 0, 0, 320, 180);
            thumbnail = canvas.toDataURL("image/jpeg", 0.75);
          }
          el.removeAttribute("src");
          el.load();
        }
        imported.push({
          id: uid(),
          name: f.name,
          type,
          src,
          thumbnail,
          duration: mediaDuration,
        });
      } catch {
        notify(`Could not import ${f.name}. Try another format.`);
      }
    }
    if (imported.length) {
      commit((p) => ({ ...p, assets: [...p.assets, ...imported] }));
      setActiveTab("Media");
      notify(
        `${imported.length} file${imported.length > 1 ? "s" : ""} imported. Click + to add to your timeline.`,
      );
    }
  };
  const applyFilter = (name: string) => {
    const target =
      selected && (selected.type === "image" || selected.type === "video")
        ? selected
        : project.clips.find(
            (c) =>
              c.track === 0 &&
              currentTime >= c.start &&
              currentTime < c.start + c.duration,
          );
    if (!target) {
      notify("Select a video or image clip first");
      return;
    }
    updateClip(target.id, { filter: name });
    setSelectedId(target.id);
    notify(`${name} filter applied`);
  };
  const applyTransition = (seconds: number) => {
    if (!selected) {
      notify("Select a clip to apply a fade");
      return;
    }
    updateClip(selected.id, { fadeIn: seconds, fadeOut: seconds });
    notify(
      seconds ? "Fade added to the start and end of the clip" : "Fade removed",
    );
  };
  const saveFile = () => {
    downloadBlob(
      new Blob([JSON.stringify(project, null, 2)], {
        type: "application/json",
      }),
      `${project.name}.capcut.json`,
    );
    setMenuOpen(false);
    notify("Project file downloaded");
  };
  const openFile = async (file: File) => {
    try {
      const p = JSON.parse(await file.text()) as Project;
      const kinds = ["image", "video", "audio", "text", "sticker"];
      if (
        !p.name ||
        !Array.isArray(p.clips) ||
        !Array.isArray(p.assets) ||
        !["16:9", "9:16", "1:1", "4:3", "4:5", "21:9"].includes(
          p.aspectRatio,
        ) ||
        !p.clips.every(
          (c) =>
            kinds.includes(c.type) &&
            Number.isFinite(c.start) &&
            Number.isFinite(c.duration) &&
            c.start >= 0 &&
            c.duration > 0 &&
            typeof c.src === "string",
        )
      )
        throw new Error();
      await saveCurrentProject(projectRef.current);
      if (
        !(await openProject({
          ...p,
          id: uid(),
          clips: p.clips.map((c) => ({ ...DEFAULT_CLIP, ...c })),
        }))
      )
        return;
      setCurrentTime(0);
      setPlaying(false);
      setSelectedId(p.clips[0]?.id || null);
      notify("Project opened");
    } catch {
      notify("This is not a valid CapCut Studio project file.");
    }
  };
  const openProject = async (next: Project) => {
    const normalized = {
      ...next,
      id: next.id || uid(),
      markers: next.markers || [],
    };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await saveCurrentProject(normalized);
      projectRef.current = normalized;
      setProject(normalized);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedId(normalized.clips[0]?.id || null);
      setCurrentTime(0);
      setPlaying(false);
      setModal(null);
      return true;
    } catch {
      notify(
        "Could not save this project. Your current project is still open.",
      );
      return false;
    }
  };
  const newProject = async () => {
    try {
      await saveCurrentProject(projectRef.current);
      const opened = await openProject({
        id: uid(),
        name: "Untitled project",
        clips: [],
        assets: [],
        aspectRatio: "16:9",
        background: "#000000",
        markers: [],
      });
      if (!opened) return;
      notify("New project created. Your previous project is in My projects.");
    } catch {
      notify(
        "Could not save the current project. Download a backup before creating a new one.",
      );
    }
  };
  const addMarker = () =>
    commit((p) => ({
      ...p,
      markers: [
        ...(p.markers || []),
        {
          id: uid(),
          time: currentTime,
          label: `Marker ${(p.markers?.length || 0) + 1}`,
          color: "#f5b85c",
        },
      ],
    }));
  const addSelectedOverlay = () => {
    if (!selected || !["video", "image"].includes(selected.type)) {
      notify("Select a photo or video to add it as an overlay");
      return;
    }
    const clip = {
      ...selected,
      id: uid(),
      name: `${selected.name} overlay`,
      track: 3,
      scale: 35,
      x: 28,
      y: 25,
      start: currentTime,
      keyframes: [],
      animation: "none" as const,
    };
    commit((p) => ({ ...p, clips: [...p.clips, clip] }));
    setSelectedId(clip.id);
    notify("Picture-in-picture overlay added");
  };
  const extractAudio = () => {
    if (selected?.type !== "video") {
      notify("Select a video to detach its audio");
      return;
    }
    const audio: Clip = {
      ...selected,
      id: uid(),
      name: `${selected.name} audio`,
      type: "audio",
      track: 2,
      keyframes: [],
      animation: "none",
    };
    commit((p) => ({
      ...p,
      clips: [
        ...p.clips.map((c) => (c.id === selected.id ? { ...c, volume: 0 } : c)),
        audio,
      ],
    }));
    setSelectedId(audio.id);
    notify("Audio detached. The original video is muted.");
  };
  const snapshot = async (insert: boolean) => {
    setPlaying(false);
    setMenuOpen(false);
    setFrameExporting(true);
    try {
      const [a, b] = project.aspectRatio.split(":").map(Number);
      const width = a >= b ? 1920 : 1080;
      const height = Math.round((width * b) / a);
      const blob = await exportFrame(project, currentTime, { width, height });
      if (!insert) {
        downloadBlob(blob, `${project.name}-${currentTime.toFixed(2)}s.png`);
        notify("Frame downloaded as PNG");
      } else {
        const src = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const asset: Asset = {
          id: uid(),
          name: `Freeze frame ${currentTime.toFixed(2)}s.png`,
          type: "image",
          src,
          thumbnail: src,
          duration: 3,
        };
        const clip: Clip = {
          ...DEFAULT_CLIP,
          id: uid(),
          assetId: asset.id,
          name: asset.name,
          type: "image",
          src,
          thumbnail: src,
          start: currentTime,
          duration: 3,
          track: 0,
        };
        commit((p) => ({
          ...p,
          assets: [...p.assets, asset],
          markers: p.markers?.map((m) =>
            m.time >= currentTime ? { ...m, time: m.time + 3 } : m,
          ),
          clips: [
            ...p.clips.flatMap((c) => {
              if (c.start >= currentTime) return [{ ...c, start: c.start + 3 }];
              if (c.start + c.duration <= currentTime) return [c];
              const cut = currentTime - c.start;
              return [
                {
                  ...c,
                  duration: cut,
                  keyframes: sliceKeyframes(c, 0, cut),
                  animation: "none" as const,
                },
                {
                  ...c,
                  id: uid(),
                  start: currentTime + 3,
                  duration: c.duration - cut,
                  sourceOffset: c.sourceOffset + cut * c.speed,
                  keyframes: sliceKeyframes(c, cut, c.duration),
                  animation: "none" as const,
                },
              ];
            }),
            clip,
          ],
        }));
        setSelectedId(clip.id);
        notify("3-second freeze frame inserted at the playhead");
      }
    } catch (error) {
      notify((error as Error).message || "Could not capture this frame");
    } finally {
      setFrameExporting(false);
    }
  };
  const startExport = async () => {
    setPlaying(false);
    setExporting(true);
    setExportDone(false);
    setProgress(0);
    exportAbort.current = new AbortController();
    const [a, b] = project.aspectRatio.split(":").map(Number);
    const base = Number(resolution);
    const width = Math.round((a >= b ? (base * a) / b : base) / 2) * 2;
    const height = Math.round((a >= b ? base : (base * b) / a) / 2) * 2;
    try {
      const blob = await exportVideo(project, {
        width,
        height,
        fps: Number(fps),
        format: exportFormat,
        onProgress: setProgress,
        signal: exportAbort.current.signal,
      });
      downloadBlob(blob, `${project.name}.${exportFormat}`);
      setExportDone(true);
      notify("Your video is ready. Download started.");
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        notify(
          (error as Error).message ||
            "Video export failed. Try a lower resolution.",
        );
    } finally {
      setExporting(false);
    }
  };
  const fullscreen = () => {
    if (!document.fullscreenElement)
      void previewRef.current
        ?.requestFullscreen()
        .catch(() => notify("Fullscreen is unavailable in this browser"));
    else void document.exitFullscreen();
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <div
          className="brand"
          onClick={() => setModal("projects")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setModal("projects")}
          aria-label="Open projects"
        >
          <svg width="29" height="25" viewBox="0 0 36 30" fill="none">
            <path
              d="M4 5H32L4 25H32M4 5L32 25"
              stroke="currentColor"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>CapCut</span>
          <span className="brand-divider" />
        </div>
        <div className="menu-holder">
          <button
            className="menu-button"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            Menu
            <ChevronDown size={13} />
          </button>
          {menuOpen && (
            <>
              <div
                className="menu-backdrop"
                onClick={() => setMenuOpen(false)}
              />
              <div className="dropdown main-menu">
                <button
                  onClick={() => {
                    setModal("projects");
                    setMenuOpen(false);
                  }}
                >
                  <FolderOpen size={16} />
                  My projects
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    void newProject();
                  }}
                >
                  <FilePlus2 size={16} />
                  New project
                </button>
                <button
                  onClick={() => {
                    projectInput.current?.click();
                    setMenuOpen(false);
                  }}
                >
                  <Upload size={16} />
                  Open project file
                </button>
                <button onClick={saveFile}>
                  <Save size={16} />
                  Download project<span>⌘ S</span>
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setPlaying(false);
                    setModal("record");
                  }}
                >
                  <Mic size={16} />
                  Record voice or screen
                </button>
                <button
                  onClick={() => void snapshot(false)}
                  disabled={frameExporting}
                >
                  <Camera size={16} />
                  Export current frame
                </button>
                <button
                  onClick={() => void snapshot(true)}
                  disabled={frameExporting}
                >
                  <Film size={16} />
                  Insert freeze frame
                </button>
                <button
                  onClick={() => {
                    void saveCurrentProject(projectRef.current)
                      .then(() => saveProjectCopy(projectRef.current))
                      .then((copy) => {
                        openProject(copy);
                        notify("Project duplicated");
                      })
                      .catch(() => notify("Could not duplicate project"));
                    setMenuOpen(false);
                  }}
                >
                  <Layers size={16} />
                  Duplicate project
                </button>
                <button
                  onClick={() => {
                    void saveCurrentProject(projectRef.current)
                      .then(() =>
                        openProject({
                          ...createDemoProject(),
                          id: uid(),
                          markers: [],
                        }),
                      )
                      .catch(() => notify("Could not save current project"));
                    setMenuOpen(false);
                  }}
                >
                  {" "}
                  <Film size={16} />
                  Open Bali demo
                </button>
                <div className="dropdown-rule" />
                <button
                  onClick={() => {
                    setModal("shortcuts");
                    setMenuOpen(false);
                  }}
                >
                  <Keyboard size={16} />
                  Keyboard shortcuts
                </button>
              </div>
            </>
          )}
        </div>
        <div className="project-heading">
          <input
            aria-label="Project name"
            value={project.name}
            onChange={(e) =>
              commit((p) => ({ ...p, name: e.target.value }), true)
            }
            onBlur={() => {
              if (!project.name.trim())
                commit((p) => ({ ...p, name: "Untitled project" }));
            }}
          />
          <span
            className="project-saved"
            title={saved ? "Saved in this browser" : "Saving…"}
          >
            {saved ? (
              <Cloud size={16} />
            ) : (
              <LoaderCircle size={15} className="spin" />
            )}
            <span>{saved ? "Saved" : "Saving"}</span>
          </span>
        </div>
        <div className="header-actions">
          <IconButton
            title="Keyboard shortcuts"
            onClick={() => setModal("shortcuts")}
          >
            <Keyboard size={18} />
          </IconButton>
          <span className="header-separator" />
          <button
            className="avatar"
            onClick={() => setModal("projects")}
            title="My local projects"
          >
            ME
          </button>
          <button
            className="export-button"
            onClick={() => {
              setExportDone(false);
              setModal("export");
            }}
          >
            <Upload size={15} />
            Export
            <ChevronDown size={13} />
          </button>
        </div>
      </header>
      <input
        ref={projectInput}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void openFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <div
        className={`workspace ${inspectorOpen ? "mobile-inspector-open" : ""}`}
      >
        <nav className="tool-rail" aria-label="Editor tools">
          {NAV.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`rail-item ${activeTab === name ? "active" : ""}`}
              onClick={() => {
                setActiveTab(name);
                setLibraryOpen(true);
                setInspectorOpen(false);
              }}
            >
              <Icon size={21} strokeWidth={1.65} />
              <span>{name}</span>
              {name === "Effects" && <span className="tiny-dot" />}
            </button>
          ))}
          <div className="rail-bottom">
            <IconButton
              title="Editor guide"
              onClick={() => setModal("shortcuts")}
            >
              <CircleHelp size={19} />
            </IconButton>
          </div>
        </nav>
        {libraryOpen && (
          <button
            className="mobile-library-backdrop"
            aria-label="Close media library"
            onClick={() => setLibraryOpen(false)}
          />
        )}
        {libraryOpen &&
          (activeTab === "Captions" ? (
            <CaptionsPanel
              clips={project.clips}
              currentTime={currentTime}
              onChange={(clips) => commit((p) => ({ ...p, clips }))}
              onSelect={setSelectedId}
              onSeek={setCurrentTime}
              onNotify={notify}
            />
          ) : (
            <MediaLibrary
              assets={project.assets}
              onAddAsset={addAsset}
              onImport={importFiles}
              onAddText={addText}
              onAddSticker={addSticker}
              onApplyFilter={applyFilter}
              onApplyTransition={applyTransition}
              activeTab={activeTab}
              onRecord={() => {
                setPlaying(false);
                setModal("record");
              }}
              onAddOverlay={(asset) => addAsset(asset, true)}
            />
          ))}
        <main className="preview-panel" ref={previewRef}>
          <div className="panel-heading">
            <div className="preview-heading">
              <IconButton
                title={
                  libraryOpen
                    ? "Collapse media library"
                    : "Expand media library"
                }
                onClick={() => setLibraryOpen(!libraryOpen)}
              >
                {libraryOpen ? (
                  <PanelLeftClose size={16} />
                ) : (
                  <PanelLeftOpen size={16} />
                )}
              </IconButton>
              <span>Player</span>
            </div>
            <button
              className="mobile-properties-button icon-button"
              title="Clip properties"
              aria-label="Clip properties"
              onClick={() => {
                setInspectorOpen(!inspectorOpen);
                setLibraryOpen(false);
              }}
            >
              <SlidersHorizontal size={17} />
            </button>
            <div className="player-tools">
              <IconButton
                title="Record voice or screen"
                onClick={() => {
                  setPlaying(false);
                  setModal("record");
                }}
              >
                <Mic size={15} />
              </IconButton>
              <IconButton
                title="Export current frame as PNG"
                disabled={frameExporting}
                onClick={() => void snapshot(false)}
              >
                {frameExporting ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Camera size={15} />
                )}
              </IconButton>
              <IconButton
                title={loop ? "Disable loop playback" : "Loop playback"}
                className={loop ? "active" : ""}
                onClick={() => setLoop(!loop)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <path d="M17 2l4 4-4 4M3 11V8a2 2 0 012-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 01-2 2H3" />
                </svg>
              </IconButton>
            </div>
            <div className="quality-label">
              <span className="quality-dot" />
              Full quality
              <ChevronDown size={12} />
            </div>
          </div>
          <div className="preview-body">
            <Preview
              project={project}
              currentTime={currentTime}
              playing={playing}
              muted={muted}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={updateClip}
            />
          </div>
          <div className="player-controls">
            <div className="time-display">
              <span>{formatTime(currentTime)}</span>
              <span className="time-divider">/</span>
              <span className="total-time">{formatTime(duration)}</span>
            </div>
            <div className="play-controls">
              <IconButton
                title="Previous clip"
                onClick={() => {
                  const starts = project.clips
                    .filter((c) => c.track === 0 && c.start < currentTime - 0.1)
                    .map((c) => c.start);
                  setCurrentTime(starts.length ? Math.max(...starts) : 0);
                }}
              >
                <SkipBack size={16} />
              </IconButton>
              <IconButton
                title={playing ? "Pause (Space)" : "Play (Space)"}
                onClick={togglePlay}
                className="main-play"
              >
                {playing ? (
                  <Pause size={21} fill="currentColor" />
                ) : (
                  <Play size={20} fill="currentColor" />
                )}
              </IconButton>
              <IconButton
                title="Next clip"
                onClick={() => {
                  const starts = project.clips
                    .filter((c) => c.track === 0 && c.start > currentTime + 0.1)
                    .map((c) => c.start);
                  setCurrentTime(
                    starts.length ? Math.min(...starts) : duration,
                  );
                }}
              >
                <SkipForward size={16} />
              </IconButton>
            </div>
            <div className="preview-actions">
              <select
                aria-label="Canvas aspect ratio"
                value={project.aspectRatio}
                onChange={(e) =>
                  commit((p) => ({ ...p, aspectRatio: e.target.value }))
                }
              >
                {["16:9", "9:16", "1:1", "4:3", "4:5", "21:9"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <IconButton
                title={muted ? "Unmute preview" : "Mute preview"}
                onClick={() => setMuted(!muted)}
              >
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </IconButton>
              <IconButton title="Fullscreen preview" onClick={fullscreen}>
                <Maximize size={16} />
              </IconButton>
            </div>
          </div>
        </main>
        {inspectorOpen && (
          <button
            className="mobile-inspector-backdrop"
            aria-label="Close clip properties"
            onClick={() => setInspectorOpen(false)}
          />
        )}
        <Inspector
          clip={selected}
          currentTime={currentTime}
          onSeek={setCurrentTime}
          background={project.background}
          onBackground={(background) => commit((p) => ({ ...p, background }))}
          onChange={(patch) => selected && updateClip(selected.id, patch)}
          aspectRatio={project.aspectRatio}
          onAspectRatio={(ratio) =>
            commit((p) => ({ ...p, aspectRatio: ratio }))
          }
          onReset={() => {
            if (selected)
              updateClip(selected.id, {
                ...DEFAULT_CLIP,
                sourceOffset: selected.sourceOffset,
                keyframes: [],
                animation: "none",
                flipX: false,
                flipY: false,
                fit: "cover",
                crop: { top: 0, right: 0, bottom: 0, left: 0 },
                textBackground: undefined,
                textStroke: 0,
                textAlign: "center",
                lineSpacing: 1.09,
              });
          }}
        />
      </div>
      <Timeline
        assets={project.assets}
        markers={project.markers || []}
        onMarkersChange={(markers) => commit((p) => ({ ...p, markers }))}
        onAddOverlay={addSelectedOverlay}
        onExtractAudio={extractAudio}
        clips={project.clips}
        selectedId={selectedId}
        currentTime={currentTime}
        duration={duration}
        playing={playing}
        onSelect={setSelectedId}
        onSeek={setCurrentTime}
        onChange={(clips) => commit((p) => ({ ...p, clips }))}
        onPlay={togglePlay}
        onSplit={split}
        onDelete={deleteClip}
        onDuplicate={duplicate}
        onUndo={undo}
        onRedo={redo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
      />
      <footer className="statusbar">
        <span>
          <span className="status-dot" />
          {saved ? "All changes saved locally" : "Saving your changes…"}
        </span>
        <span className="status-center">Create your next great story.</span>
        <button onClick={() => setModal("shortcuts")}>
          <Keyboard size={13} />
          Shortcuts<span>?</span>
        </button>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !exporting) setModal(null);
          }}
        >
          <section
            className={`modal ${modal === "shortcuts" ? "shortcuts-modal" : modal === "projects" ? "project-library-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => {
                if (exporting) {
                  exportAbort.current?.abort();
                }
                setModal(null);
              }}
            >
              <X size={19} />
            </button>
            {modal === "export" && (
              <>
                <div className="modal-icon">
                  <Upload size={24} />
                </div>
                <h2 id="modal-title">
                  {exportDone ? "Your story is ready." : "Ready for the world?"}
                </h2>
                <p className="modal-description">
                  {exportDone
                    ? "Your video has been exported and downloaded."
                    : "Give your creation the finish it deserves."}
                </p>
                <div className="export-preview">
                  <div
                    className="export-thumb"
                    style={{
                      backgroundImage: `url(${project.clips.find((c) => c.track === 0)?.thumbnail || project.clips.find((c) => c.track === 0)?.src})`,
                    }}
                  >
                    <Play size={19} fill="white" />
                  </div>
                  <div>
                    <strong>{project.name}</strong>
                    <span>
                      {formatTime(duration)} · {project.aspectRatio} ·{" "}
                      {project.clips.length} clips
                    </span>
                  </div>
                </div>
                {!exportDone && (
                  <>
                    <label className="form-row">
                      <span>Resolution</span>
                      <select
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        disabled={exporting}
                      >
                        <option value="720">720p · HD</option>
                        <option value="1080">1080p · Full HD</option>
                        <option value="1440">1440p · 2K</option>
                      </select>
                    </label>
                    <label className="form-row">
                      <span>Frame rate</span>
                      <select
                        value={fps}
                        onChange={(e) => setFps(e.target.value)}
                        disabled={exporting}
                      >
                        <option value="24">24 fps</option>
                        <option value="30">30 fps</option>
                        <option value="60">60 fps</option>
                      </select>
                    </label>
                    <div className="form-row">
                      <span>Format</span>
                      <select
                        aria-label="Export format"
                        value={exportFormat}
                        disabled={exporting}
                        onChange={(e) =>
                          setExportFormat(e.target.value as "webm" | "mp4")
                        }
                      >
                        {formats.map((format) => (
                          <option value={format.id} key={format.id}>
                            {format.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="export-note">
                      Rendered on your device, with audio. Keep this tab open
                      while your video exports.
                    </p>
                  </>
                )}
                {exporting ? (
                  <>
                    <div className="export-progress">
                      <span
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                    <div className="progress-label">
                      <span>Creating your video…</span>
                      <span>{Math.round(progress * 100)}%</span>
                    </div>
                    <button
                      className="secondary-button full-width"
                      onClick={() => exportAbort.current?.abort()}
                    >
                      Cancel export
                    </button>
                  </>
                ) : exportDone ? (
                  <button
                    className="primary-button full-width"
                    onClick={() => setModal(null)}
                  >
                    <Check size={18} />
                    Back to editing
                  </button>
                ) : (
                  <button
                    className="primary-button full-width"
                    onClick={startExport}
                  >
                    <Download size={17} />
                    Export video
                  </button>
                )}
              </>
            )}
            {modal === "shortcuts" && (
              <>
                <div className="modal-icon">
                  <Keyboard size={24} />
                </div>
                <h2 id="modal-title">A shortcut to your best work.</h2>
                <p className="modal-description">
                  Less clicking. More creating.
                </p>
                <div className="shortcut-list">
                  {[
                    ["Play / pause", "Space"],
                    ["Split selected clip", "S"],
                    ["Add timeline marker", "M"],
                    ["Delete selected clip", "Delete"],
                    ["Undo", "⌘ / Ctrl + Z"],
                    ["Redo", "⌘ / Ctrl + Shift + Z"],
                    ["Duplicate clip", "⌘ / Ctrl + D"],
                    ["Save project file", "⌘ / Ctrl + S"],
                    ["Previous / next frame", "← / →"],
                    ["Jump one second", "Shift + ← / →"],
                  ].map(([label, key]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <kbd>{key}</kbd>
                    </div>
                  ))}
                </div>
                <p className="help-note">
                  Drag media onto the timeline. Drag clip edges to trim. Select
                  text in the player to move it. Your project is saved
                  automatically in this browser.
                </p>
              </>
            )}
            {modal === "projects" && (
              <ProjectLibrary
                currentProject={project}
                onOpen={openProject}
                onNew={newProject}
                onImport={() => projectInput.current?.click()}
                onClose={() => setModal(null)}
                onNotify={notify}
              />
            )}
            {modal === "record" && (
              <RecorderPanel
                onRecorded={(asset) => {
                  const clip: Clip = {
                    ...DEFAULT_CLIP,
                    id: uid(),
                    assetId: asset.id,
                    name: asset.name,
                    type: asset.type,
                    src: asset.src,
                    thumbnail: asset.thumbnail,
                    start: currentTime,
                    duration: asset.duration,
                    track: asset.type === "audio" ? 2 : 0,
                  };
                  commit((p) => ({
                    ...p,
                    assets: [...p.assets, asset],
                    clips: [...p.clips, clip],
                  }));
                  setSelectedId(clip.id);
                }}
                onClose={() => setModal(null)}
                onNotify={notify}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
