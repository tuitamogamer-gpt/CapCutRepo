import { useEffect, useRef, useState } from "react";
import { Captions, Clock3, Download, Plus, Trash2, Upload } from "lucide-react";
import { parseSubtitles, serializeSubtitles } from "../captions";
import { downloadBlob } from "../exportVideo";
import { DEFAULT_CLIP, uid, type Clip } from "../types";
import "./MediaLibrary.css";
import "./CaptionsPanel.css";

interface CaptionsPanelProps {
  clips: Clip[];
  currentTime: number;
  onChange: (clips: Clip[]) => void;
  onSelect: (id: string) => void;
  onSeek: (time: number) => void;
  onNotify: (message: string) => void;
}

const PRESETS = [
  {
    name: "Classic white",
    color: "#ffffff",
    textBackground: "transparent",
    textStroke: 2,
  },
  {
    name: "Yellow",
    color: "#ffe44d",
    textBackground: "transparent",
    textStroke: 2,
  },
  { name: "Boxed", color: "#ffffff", textBackground: "#161616", textStroke: 0 },
];
const timeValue = (value: number) => String(Math.round(value * 1000) / 1000);

function CaptionRow({
  clip,
  index,
  active,
  onUpdate,
  onSelect,
  onDelete,
}: {
  clip: Clip;
  index: number;
  active: boolean;
  onUpdate: (patch: Partial<Clip>) => void;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [content, setContent] = useState(clip.text || "");
  const [start, setStart] = useState(timeValue(clip.start));
  const [end, setEnd] = useState(timeValue(clip.start + clip.duration));
  const [error, setError] = useState("");
  useEffect(() => setContent(clip.text || ""), [clip.text]);
  useEffect(() => {
    setStart(timeValue(clip.start));
    setEnd(timeValue(clip.start + clip.duration));
    setError("");
  }, [clip.start, clip.duration]);

  function saveTiming() {
    const nextStart = Number(start);
    const nextEnd = Number(end);
    if (
      !start.trim() ||
      !end.trim() ||
      !Number.isFinite(nextStart) ||
      !Number.isFinite(nextEnd) ||
      nextStart < 0 ||
      nextEnd <= nextStart
    ) {
      setError("Start must be 0 or later. End must be after start.");
      return;
    }
    setError("");
    if (
      nextStart !== clip.start ||
      Math.abs(nextEnd - clip.start - clip.duration) > 0.00001
    )
      onUpdate({ start: nextStart, duration: nextEnd - nextStart });
  }

  return (
    <div className={`subtitle-row ${active ? "subtitle-row-active" : ""}`}>
      <div className="subtitle-row-heading">
        <button
          className="subtitle-jump"
          onClick={onSelect}
          title="Select caption and jump to start"
        >
          <Captions size={13} /> Caption {index + 1}
        </button>
        <button
          className="subtitle-delete"
          aria-label={`Delete caption ${index + 1}`}
          onClick={onDelete}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <textarea
        aria-label={`Caption ${index + 1} text`}
        value={content}
        rows={2}
        onChange={(event) => setContent(event.target.value)}
        onBlur={() => {
          if (!content.trim()) {
            setError("Enter caption text or delete this caption.");
            return;
          }
          setError("");
          if (content !== clip.text)
            onUpdate({
              text: content,
              name: content.replace(/\n/g, " ").slice(0, 36),
            });
        }}
      />
      <div className="subtitle-timing">
        <label>
          Start · sec
          <input
            type="number"
            min="0"
            step="0.01"
            aria-label={`Caption ${index + 1} start`}
            value={start}
            onChange={(event) => setStart(event.target.value)}
            onBlur={saveTiming}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
        <span>→</span>
        <label>
          End · sec
          <input
            type="number"
            min="0"
            step="0.01"
            aria-label={`Caption ${index + 1} end`}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            onBlur={saveTiming}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
      </div>
      {error && (
        <p className="subtitle-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function CaptionsPanel({
  clips,
  currentTime,
  onChange,
  onSelect,
  onSeek,
  onNotify,
}: CaptionsPanelProps) {
  const input = useRef<HTMLInputElement>(null);
  const latestClips = useRef(clips);
  latestClips.current = clips;
  const [warnings, setWarnings] = useState<string[]>([]);
  const [offset, setOffset] = useState("0");
  const [fontSize, setFontSize] = useState(34);
  const [color, setColor] = useState("#ffffff");
  const [preset, setPreset] = useState("Classic white");
  const captions = clips
    .filter((clip) => clip.type === "text" && clip.isCaption)
    .sort((a, b) => a.start - b.start);
  const activePreset = PRESETS.find((item) => item.name === preset)!;

  function createCaption(text: string, start: number, duration: number): Clip {
    return {
      ...DEFAULT_CLIP,
      ...activePreset,
      color,
      fontSize:
        Number.isFinite(fontSize) && fontSize >= 10 && fontSize <= 150
          ? fontSize
          : 34,
      id: uid(),
      name: text.replace(/\n/g, " ").slice(0, 36),
      type: "text",
      src: "",
      text,
      start,
      duration,
      track: 1,
      y: 33,
      isCaption: true,
      textAlign: "center",
      lineSpacing: 1.15,
    };
  }
  function applyToAll(patch: Partial<Clip>) {
    onChange(
      clips.map((clip) =>
        clip.type === "text" && clip.isCaption ? { ...clip, ...patch } : clip,
      ),
    );
  }
  async function importFile(file: File) {
    try {
      const parsed = parseSubtitles(await file.text());
      setWarnings(parsed.warnings);
      if (!parsed.cues.length) {
        onNotify("No valid captions found. Check the import details below.");
        return;
      }
      const imported = parsed.cues.map((cue) =>
        createCaption(cue.text, cue.start, cue.end - cue.start),
      );
      onChange([...latestClips.current, ...imported]);
      onSelect(imported[0].id);
      onSeek(imported[0].start);
      onNotify(
        `Imported ${imported.length} caption${imported.length === 1 ? "" : "s"}${parsed.warnings.length ? ` · ${parsed.warnings.length} warning${parsed.warnings.length === 1 ? "" : "s"}` : ""}`,
      );
    } catch {
      onNotify(
        "This subtitle file could not be read. Try another SRT or VTT file.",
      );
    }
  }
  function exportFile(format: "srt" | "vtt") {
    downloadBlob(
      new Blob([serializeSubtitles(clips, format)], {
        type:
          format === "vtt"
            ? "text/vtt;charset=utf-8"
            : "application/x-subrip;charset=utf-8",
      }),
      `captions.${format}`,
    );
    onNotify(`Downloaded captions.${format}`);
  }

  return (
    <aside
      className="media-library captions-library"
      aria-label="Captions library"
    >
      <input
        ref={input}
        className="library-file-input"
        type="file"
        accept=".srt,.vtt,text/vtt,application/x-subrip"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />
      <div className="library-heading">
        <h2>Captions</h2>
        <Captions size={17} className="library-heading-mark" />
      </div>
      <div className="library-content captions-content">
        <p className="library-description">
          Add timed captions to your story, or bring your own subtitle file.
        </p>
        <button
          className="library-import"
          onClick={() => {
            const clip = createCaption(
              "Your caption",
              Math.max(0, currentTime),
              3,
            );
            onChange([...clips, clip]);
            onSelect(clip.id);
            onSeek(clip.start);
          }}
        >
          <Plus size={16} /> Add caption at playhead
        </button>
        <button
          className="subtitle-import"
          onClick={() => input.current?.click()}
        >
          <Upload size={14} /> Import SRT / VTT
        </button>
        {warnings.length > 0 && (
          <details className="subtitle-warnings" open>
            <summary>
              {warnings.length} import warning{warnings.length === 1 ? "" : "s"}
            </summary>
            <ul>
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </details>
        )}
        {captions.length > 0 ? (
          <>
            <div className="subtitle-section-title">
              <span>Style all captions</span>
              <span>{captions.length}</span>
            </div>
            <div className="subtitle-presets">
              {PRESETS.map((item) => (
                <button
                  key={item.name}
                  className={preset === item.name ? "active" : ""}
                  onClick={() => {
                    setPreset(item.name);
                    setColor(item.color);
                    applyToAll({
                      color: item.color,
                      textBackground: item.textBackground,
                      textStroke: item.textStroke,
                    });
                  }}
                >
                  <span
                    style={{
                      color: item.color,
                      background: item.textBackground,
                    }}
                  >
                    Aa
                  </span>
                  {item.name}
                </button>
              ))}
            </div>
            <div className="subtitle-style-controls">
              <label>
                Font size
                <input
                  type="number"
                  min="10"
                  max="150"
                  value={fontSize}
                  aria-label="All captions font size"
                  onChange={(event) => {
                    const size = Number(event.target.value);
                    setFontSize(size);
                    if (Number.isFinite(size) && size >= 10 && size <= 150)
                      applyToAll({ fontSize: size });
                  }}
                  onBlur={() => {
                    if (fontSize < 10 || fontSize > 150)
                      setFontSize(captions[0]?.fontSize || 34);
                  }}
                />
              </label>
              <label>
                Text color
                <input
                  type="color"
                  aria-label="All captions text color"
                  value={color}
                  onChange={(event) => {
                    setColor(event.target.value);
                    applyToAll({ color: event.target.value });
                  }}
                />
              </label>
            </div>
            <div className="subtitle-shift">
              <label>
                <Clock3 size={13} /> Shift all · sec
                <input
                  type="number"
                  step="0.1"
                  aria-label="Shift captions seconds"
                  value={offset}
                  onChange={(event) => setOffset(event.target.value)}
                />
              </label>
              <button
                onClick={() => {
                  const amount = Number(offset);
                  if (!offset.trim() || !Number.isFinite(amount)) {
                    onNotify("Enter a valid timing offset in seconds.");
                    return;
                  }
                  onChange(
                    clips.map((clip) =>
                      clip.type === "text" && clip.isCaption
                        ? { ...clip, start: Math.max(0, clip.start + amount) }
                        : clip,
                    ),
                  );
                  setOffset("0");
                  onNotify("Caption timings updated. Durations preserved.");
                }}
              >
                Apply
              </button>
            </div>
            <div className="subtitle-section-title">
              <span>Timed captions</span>
              <span>Click to seek</span>
            </div>
            <div className="subtitle-list">
              {captions.map((clip, index) => (
                <CaptionRow
                  key={clip.id}
                  clip={clip}
                  index={index}
                  active={
                    currentTime >= clip.start &&
                    currentTime < clip.start + clip.duration
                  }
                  onSelect={() => {
                    onSelect(clip.id);
                    onSeek(clip.start);
                  }}
                  onUpdate={(patch) =>
                    onChange(
                      clips.map((item) =>
                        item.id === clip.id ? { ...item, ...patch } : item,
                      ),
                    )
                  }
                  onDelete={() =>
                    onChange(clips.filter((item) => item.id !== clip.id))
                  }
                />
              ))}
            </div>
            <div className="subtitle-exports">
              <button onClick={() => exportFile("srt")}>
                <Download size={13} /> Export SRT
              </button>
              <button onClick={() => exportFile("vtt")}>
                <Download size={13} /> Export VTT
              </button>
            </div>
          </>
        ) : (
          <div className="subtitle-empty">
            <Captions size={30} />
            <strong>Your words, in sync</strong>
            <span>
              Imported captions keep their timestamps. Add one manually to start
              at the playhead.
            </span>
            <small>SRT and WebVTT · Multiline text</small>
          </div>
        )}
      </div>
    </aside>
  );
}
