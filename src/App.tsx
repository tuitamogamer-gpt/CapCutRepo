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
import { exportVideo, downloadBlob } from "./exportVideo";

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
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("capcut-studio", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("projects");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function storeProject(project: Project) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(project, "current");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
async function loadProject(): Promise<Project | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction("projects")
      .objectStore("projects")
      .get("current");
    req.onsuccess = () => {
      db.close();
      resolve(req.result || null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}
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
    const envelope = Math.max(
      0,
      Math.min(
        1,
        clip.fadeIn > 0 ? (time - clip.start) / clip.fadeIn : 1,
        clip.fadeOut > 0
          ? (clip.start + clip.duration - time) / clip.fadeOut
          : 1,
      ),
    );
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
  const fade = Math.min(
    1,
    clip.fadeIn > 0 ? (time - clip.start) / clip.fadeIn : 1,
    clip.fadeOut > 0 ? (clip.start + clip.duration - time) / clip.fadeOut : 1,
  );
  const style: CSSProperties = {
    display: active ? "block" : "none",
    filter: filterStyle(clip),
    opacity: (clip.opacity / 100) * Math.max(0, fade),
    transform: `translate(${clip.x}%, ${clip.y}%) rotate(${clip.rotation}deg) scale(${clip.scale / 100})`,
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
  const drag = (e: React.PointerEvent, clip: Clip) => {
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
          .sort((x, y) => x.track - y.track)
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
          .map((c) => {
            const fade = Math.min(
              1,
              c.fadeIn > 0 ? (currentTime - c.start) / c.fadeIn : 1,
              c.fadeOut > 0
                ? (c.start + c.duration - currentTime) / c.fadeOut
                : 1,
            );
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                aria-label={`Edit ${c.type}: ${c.text}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelect(c.id);
                }}
                onPointerDown={(e) => drag(e, c)}
                className={`preview-text ${selectedId === c.id ? "selected" : ""}`}
                style={{
                  left: `${50 + c.x}%`,
                  top: `${50 + c.y}%`,
                  color: c.color,
                  filter: filterStyle(c),
                  fontFamily: c.fontFamily,
                  fontSize: `${(c.fontSize * stageWidth) / 960}px`,
                  fontWeight: c.bold ? 700 : 400,
                  opacity: (c.opacity / 100) * Math.max(0, fade),
                  transform: `translate(-50%,-50%) rotate(${c.rotation}deg) scale(${c.scale / 100})`,
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
  const [project, setProject] = useState<Project>(createDemoProject);
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
    "export" | "shortcuts" | "projects" | null
  >(null);
  const [toast, setToast] = useState("");
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resolution, setResolution] = useState("1080");
  const [fps, setFps] = useState("30");
  const [exportDone, setExportDone] = useState(false);
  const exportAbort = useRef<AbortController | null>(null);
  const lastEdit = useRef(0);
  const projectRef = useRef(project);
  const previewRef = useRef<HTMLDivElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const duration = projectDuration(project.clips);
  const selected = project.clips.find((c) => c.id === selectedId) || null;
  useEffect(() => {
    loadProject()
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
      storeProject(project)
        .then(() => setSaved(true))
        .catch(() =>
          notify("Browser storage is full. Save a project file from the menu."),
        );
    }, 700);
    return () => clearTimeout(t);
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
            if (patch.speed !== undefined && patch.duration === undefined)
              adjusted.duration = (c.duration * c.speed) / patch.speed;
            if (patch.text !== undefined)
              adjusted.name = patch.text.slice(0, 32) || "Text";
            return { ...c, ...adjusted };
          }),
        }),
        true,
      ),
    [commit],
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
    const first = { ...selected, duration: currentTime - selected.start };
    const second = {
      ...selected,
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
          setPlaying(false);
          return duration;
        }
        return t + delta;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);
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
  }, [togglePlay, deleteClip, split, undo, redo, duplicate, duration, notify]);
  const addAsset = useCallback(
    (asset: Asset) => {
      const p = projectRef.current;
      const track = asset.type === "audio" ? 2 : 0;
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
      };
      commit((prev) => ({ ...prev, clips: [...prev.clips, clip] }));
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
      commit(p);
      setCurrentTime(0);
      setPlaying(false);
      setSelectedId(p.clips[0]?.id || null);
      notify("Project opened");
    } catch {
      notify("This is not a valid CapCut Studio project file.");
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
        onProgress: setProgress,
        signal: exportAbort.current.signal,
      });
      downloadBlob(blob, `${project.name}.webm`);
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
                    saveFile();
                    commit({
                      name: "Untitled project",
                      clips: [],
                      assets: project.assets,
                      aspectRatio: "16:9",
                      background: "#000000",
                    });
                    setCurrentTime(0);
                    setSelectedId(null);
                    setPlaying(false);
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
        {libraryOpen && (
          <MediaLibrary
            assets={project.assets}
            onAddAsset={addAsset}
            onImport={importFiles}
            onAddText={addText}
            onAddSticker={addSticker}
            onApplyFilter={applyFilter}
            onApplyTransition={applyTransition}
            activeTab={activeTab}
          />
        )}
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
          onChange={(patch) => selected && updateClip(selected.id, patch)}
          aspectRatio={project.aspectRatio}
          onAspectRatio={(ratio) =>
            commit((p) => ({ ...p, aspectRatio: ratio }))
          }
          onReset={() => {
            if (selected) updateClip(selected.id, { ...DEFAULT_CLIP });
          }}
        />
      </div>
      <Timeline
        assets={project.assets}
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
            className={`modal ${modal === "shortcuts" ? "shortcuts-modal" : ""}`}
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
                      <span className="format-pill">WebM</span>
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
              <>
                <div className="modal-icon">
                  <FolderOpen size={24} />
                </div>
                <h2 id="modal-title">Make room for your next idea.</h2>
                <p className="modal-description">
                  Your creative space, saved on this device.
                </p>
                <div className="project-card">
                  <span className="project-card-icon">
                    <Film size={23} />
                  </span>
                  <div>
                    <strong>{project.name}</strong>
                    <span>Current project · {formatTime(duration)}</span>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => setModal(null)}
                  >
                    Continue
                    <ArrowUpRight size={14} />
                  </button>
                </div>
                <button
                  className="primary-button full-width"
                  onClick={() => {
                    saveFile();
                    commit({
                      name: "Untitled project",
                      clips: [],
                      assets: [],
                      aspectRatio: "16:9",
                      background: "#000000",
                    });
                    setCurrentTime(0);
                    setSelectedId(null);
                    setPlaying(false);
                    setModal(null);
                    notify(
                      "New project created. Previous project downloaded as a backup.",
                    );
                  }}
                >
                  <Plus size={18} />
                  New project
                </button>
                <button
                  className="secondary-button full-width"
                  onClick={() => {
                    projectInput.current?.click();
                    setModal(null);
                  }}
                >
                  <FolderOpen size={17} />
                  Open a project file
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    const p = createDemoProject();
                    saveFile();
                    commit(p);
                    setSelectedId(
                      p.clips.find((c) => c.track === 0)?.id || null,
                    );
                    setCurrentTime(1.8);
                    setPlaying(false);
                    setModal(null);
                    notify(
                      "Demo opened. Previous project downloaded as a backup.",
                    );
                  }}
                >
                  Explore the Bali demo <ArrowUpRight size={13} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
