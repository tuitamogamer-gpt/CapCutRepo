import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  AudioLines,
  Check,
  ChevronDown,
  Film,
  Image as ImageIcon,
  Info,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Type,
  Upload,
  X,
} from "lucide-react";
import { DEMO_ASSETS } from "../demo";
import {
  DEFAULT_CLIP,
  FILTERS,
  filterStyle,
  type Asset,
  type Clip,
} from "../types";
import "./MediaLibrary.css";

interface MediaLibraryProps {
  assets: Asset[];
  onAddAsset: (asset: Asset) => void;
  onImport: (files: FileList | File[]) => void;
  onAddText: (text?: string) => void;
  onAddSticker: (emoji: string) => void;
  onApplyFilter: (name: string) => void;
  onApplyTransition: (seconds: number) => void;
  activeTab: string;
}

const STICKERS = [
  "✨",
  "🌴",
  "☀️",
  "🌊",
  "✈️",
  "📍",
  "🤍",
  "🌺",
  "🦋",
  "🥥",
  "🏄",
  "🌈",
  "💫",
  "🧡",
  "📸",
  "🐚",
  "🌅",
  "🪸",
  "😎",
  "🎉",
  "💬",
  "❤️",
  "⚡",
  "🌿",
];
const TEXT_TEMPLATES = [
  {
    title: "YOUR TITLE",
    label: "Bold title",
    text: "YOUR TITLE",
    className: "bold",
  },
  {
    title: "little moments",
    label: "Editorial",
    text: "little moments",
    className: "editorial",
  },
  {
    title: "MAKE IT\nMEMORABLE",
    label: "Statement",
    text: "MAKE IT\nMEMORABLE",
    className: "statement",
  },
  {
    title: "a new adventure",
    label: "Subtitle",
    text: "a new adventure",
    className: "subtitle",
  },
  {
    title: "01 / BALI",
    label: "Location",
    text: "01 / BALI",
    className: "location",
  },
  {
    title: "good vibes only",
    label: "Simple",
    text: "good vibes only",
    className: "simple",
  },
];
const secondsLabel = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export default function MediaLibrary({
  assets,
  onAddAsset,
  onImport,
  onAddText,
  onAddSticker,
  onApplyFilter,
  onApplyTransition,
  activeTab,
}: MediaLibraryProps) {
  const [section, setSection] = useState("Your media");
  const [query, setQuery] = useState("");
  const [sortByName, setSortByName] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [audioCategory, setAudioCategory] = useState("Music");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [recent, setRecent] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    setQuery("");
    setRecent(null);
    audio.current?.pause();
    setPlayingId(null);
  }, [activeTab]);
  useEffect(
    () => () => {
      audio.current?.pause();
      clearTimeout(resetTimer.current);
    },
    [],
  );
  function added(id: string, action: () => void) {
    action();
    setRecent(id);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setRecent(null), 1400);
  }
  function preview(asset: Asset) {
    if (playingId === asset.id) {
      audio.current?.pause();
      setPlayingId(null);
      return;
    }
    audio.current?.pause();
    const player = new Audio(asset.src);
    audio.current = player;
    player.volume = 0.5;
    player.onended = () => setPlayingId(null);
    player
      .play()
      .then(() => setPlayingId(asset.id))
      .catch(() => setPlayingId(null));
  }
  const projectMedia = (section === "Library" ? DEMO_ASSETS : assets).filter(
    (a) =>
      a.type !== "audio" && a.name.toLowerCase().includes(query.toLowerCase()),
  );
  if (sortByName) projectMedia.sort((a, b) => a.name.localeCompare(b.name));
  const audioAssets = [
    ...assets,
    ...DEMO_ASSETS.filter((a) => !assets.some((b) => b.id === a.id)),
  ].filter(
    (a) =>
      a.type === "audio" &&
      a.name.toLowerCase().includes(query.toLowerCase()) &&
      (audioCategory === "Sound effects"
        ? a.category === "Sound effects"
        : a.category !== "Sound effects"),
  );
  const search = (placeholder: string) => (
    <label className="library-search">
      <Search size={15} />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {query && (
        <button aria-label="Clear search" onClick={() => setQuery("")}>
          <X size={13} />
        </button>
      )}
    </label>
  );
  const filterThumb = (name: string) =>
    filterStyle({ ...DEFAULT_CLIP, filter: name } as Clip);

  return (
    <aside
      className={`media-library ${dropActive ? "library-dragging" : ""}`}
      aria-label={`${activeTab} library`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDropActive(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDropActive(false);
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          onImport(event.dataTransfer.files);
          setDropActive(false);
        }
      }}
    >
      <input
        ref={input}
        type="file"
        accept="video/*,image/*,audio/*"
        multiple
        className="library-file-input"
        onChange={(event) => {
          if (event.target.files?.length) onImport(event.target.files);
          event.target.value = "";
        }}
      />
      <div className="library-heading">
        <h2>{activeTab}</h2>
        <span className="library-heading-mark">
          <Sparkles size={14} />
        </span>
      </div>
      {activeTab === "Media" && (
        <>
          <div className="library-segments">
            {["Your media", "Library"].map((tab) => (
              <button
                className={section === tab ? "active" : ""}
                key={tab}
                onClick={() => setSection(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="library-content">
            <button
              className="library-import"
              onClick={() => input.current?.click()}
            >
              <Plus size={17} strokeWidth={2.1} /> Import
            </button>
            <span className="library-import-hint">
              Add videos, photos, and audio
            </span>
            {search("Search media")}
            <div className="library-section-label">
              <span>
                {section === "Your media"
                  ? "Project media"
                  : "Travel collection"}{" "}
                <small>{projectMedia.length}</small>
              </span>
              <button
                aria-label={
                  sortByName ? "Sort by import order" : "Sort media by name"
                }
                title={
                  sortByName ? "Sort by import order" : "Sort alphabetically"
                }
                onClick={() => setSortByName(!sortByName)}
              >
                <ChevronDown
                  size={13}
                  style={{
                    transform: sortByName ? "rotate(180deg)" : undefined,
                  }}
                />
              </button>
            </div>
            <div className="media-card-grid">
              {projectMedia.map((asset) => (
                <div
                  key={asset.id}
                  className="media-card"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      "application/capcut-asset",
                      JSON.stringify(asset),
                    );
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <button
                    className="media-card-image"
                    title={`Add ${asset.name} to timeline`}
                    onClick={() => added(asset.id, () => onAddAsset(asset))}
                  >
                    {asset.thumbnail ? (
                      <img
                        src={asset.thumbnail}
                        alt={asset.name}
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <Film size={28} />
                    )}
                    <span className="media-kind">
                      {asset.type === "video" ? (
                        <Film size={10} />
                      ) : (
                        <ImageIcon size={10} />
                      )}
                    </span>
                    <span className="media-duration">
                      {secondsLabel(asset.duration)}
                    </span>
                    <span
                      className={`media-add ${recent === asset.id ? "added" : ""}`}
                    >
                      {recent === asset.id ? (
                        <Check size={13} />
                      ) : (
                        <Plus size={13} />
                      )}
                    </span>
                  </button>
                  <span className="media-card-name" title={asset.name}>
                    {asset.name}
                  </span>
                </div>
              ))}
            </div>
            {projectMedia.length === 0 && (
              <div className="library-empty">
                <ImageIcon size={28} />
                <p>{query ? "No matching media" : "Your story starts here"}</p>
                <span>
                  {query
                    ? "Try a different search."
                    : "Import a photo or video to get started."}
                </span>
              </div>
            )}
          </div>
          <div className="library-tip">
            <span className="library-tip-icon">
              <ArrowDownToLine size={15} />
            </span>
            <span>
              Drag your media onto the timeline
              <br />
              <span>to start creating.</span>
            </span>
          </div>
        </>
      )}

      {activeTab === "Audio" && (
        <>
          <div className="library-segments">
            {["Music", "Sound effects"].map((tab) => (
              <button
                key={tab}
                className={audioCategory === tab ? "active" : ""}
                onClick={() => setAudioCategory(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="library-content">
            {search("Search audio")}
            <button
              className="library-secondary"
              onClick={() => input.current?.click()}
            >
              <Upload size={14} /> Upload your audio
            </button>
            <div className="library-section-label">
              <span>
                {audioCategory === "Music"
                  ? "Made for your moments"
                  : "Set the scene"}
              </span>
            </div>
            <div className="audio-card-list">
              {audioAssets.map((asset, i) => (
                <div
                  className="audio-card"
                  key={asset.id}
                  draggable
                  onDragStart={(event) =>
                    event.dataTransfer.setData(
                      "application/capcut-asset",
                      JSON.stringify(asset),
                    )
                  }
                >
                  <button
                    className={`audio-art audio-art-${i % 3}`}
                    onClick={() => preview(asset)}
                    title={
                      playingId === asset.id ? "Pause preview" : "Preview audio"
                    }
                  >
                    {playingId === asset.id ? (
                      <Pause size={17} fill="currentColor" />
                    ) : (
                      <Play size={17} fill="currentColor" />
                    )}
                  </button>
                  <div className="audio-card-info">
                    <strong>{asset.name}</strong>
                    <span>
                      {asset.category || "Imported audio"} ·{" "}
                      {secondsLabel(asset.duration)}
                    </span>
                  </div>
                  <button
                    className="audio-add"
                    title={`Add ${asset.name}`}
                    onClick={() => added(asset.id, () => onAddAsset(asset))}
                  >
                    {recent === asset.id ? (
                      <Check size={16} />
                    ) : (
                      <Plus size={16} />
                    )}
                  </button>
                </div>
              ))}
            </div>
            {audioAssets.length === 0 && (
              <div className="library-empty">
                <Music2 size={28} />
                <p>No matching audio</p>
                <span>Try another search or import your own.</span>
              </div>
            )}
            <div className="library-info">
              <AudioLines size={15} />
              <span>
                Original sounds, ready to use.
                <br />
                Click play to listen before adding.
              </span>
            </div>
          </div>
        </>
      )}

      {activeTab === "Text" && (
        <div className="library-content">
          <button className="library-import" onClick={() => onAddText()}>
            <Plus size={17} /> Add text
          </button>
          <div className="library-section-label">
            <span>Text inspiration</span>
            <Type size={14} />
          </div>
          <div className="text-template-grid">
            {TEXT_TEMPLATES.map((template) => (
              <button
                className="text-template"
                key={template.label}
                onClick={() =>
                  added(template.label, () => onAddText(template.text))
                }
              >
                <span className={`text-template-preview ${template.className}`}>
                  {template.title}
                </span>
                <span className="text-template-label">
                  {template.label}
                  {recent === template.label ? (
                    <Check size={12} />
                  ) : (
                    <Plus size={12} />
                  )}
                </span>
              </button>
            ))}
          </div>
          <div className="library-info">
            <Info size={15} />
            <span>
              Select your text on the canvas to edit its font, color, size, and
              position.
            </span>
          </div>
        </div>
      )}

      {activeTab === "Stickers" && (
        <div className="library-content">
          <div className="library-chip-row">
            <span className="active">Travel & lifestyle</span>
            <span>24 stickers</span>
          </div>
          <div className="sticker-grid">
            {STICKERS.map((emoji) => (
              <button
                key={emoji}
                aria-label={`Add ${emoji} sticker`}
                onClick={() => onAddSticker(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="library-info">
            <Info size={15} />
            <span>
              A little personality goes a long way. Move and resize stickers on
              your canvas.
            </span>
          </div>
        </div>
      )}

      {(activeTab === "Filters" || activeTab === "Effects") && (
        <div className="library-content">
          {search(
            activeTab === "Filters" ? "Search filters" : "Search effects",
          )}
          <div className="library-section-label">
            <span>
              {activeTab === "Filters" ? "Find your look" : "A new perspective"}
            </span>
            <span className="library-tiny-badge">FREE</span>
          </div>
          <div className="filter-grid">
            {FILTERS.filter((name) =>
              name.toLowerCase().includes(query.toLowerCase()),
            ).map((name) => (
              <button
                className={`filter-card ${recent === name ? "filter-active" : ""}`}
                key={name}
                onClick={() => added(name, () => onApplyFilter(name))}
              >
                <div>
                  <img
                    src="/assets/island-escape.jpg"
                    alt=""
                    style={{ filter: filterThumb(name) }}
                  />
                  {recent === name && <Check size={16} />}
                </div>
                <span>{name}</span>
              </button>
            ))}
          </div>
          <div className="library-info">
            <Sparkles size={15} />
            <span>
              Select a photo or video, then choose a look to apply it.
            </span>
          </div>
        </div>
      )}

      {activeTab === "Transitions" && (
        <div className="library-content">
          <div className="library-section-label">
            <span>Make it flow</span>
            <span className="library-tiny-badge">BASIC</span>
          </div>
          <p className="library-description">
            Add a smooth fade to the beginning and end of your selected clip.
          </p>
          <div className="transition-grid">
            {[
              { name: "Quick fade", time: 0.3 },
              { name: "Soft fade", time: 0.7 },
              { name: "Slow fade", time: 1.5 },
              { name: "No transition", time: 0 },
            ].map((transition, index) => (
              <button
                className={`transition-card ${recent === transition.name ? "transition-active" : ""}`}
                key={transition.name}
                onClick={() =>
                  added(transition.name, () =>
                    onApplyTransition(transition.time),
                  )
                }
              >
                <div
                  className={`transition-preview transition-preview-${index}`}
                >
                  <span>A</span>
                  <span>B</span>
                </div>
                <span>{transition.name}</span>
                <small>
                  {transition.time ? `${transition.time}s` : "Remove fade"}
                </small>
              </button>
            ))}
          </div>
          <div className="library-info">
            <Info size={15} />
            <span>
              Adjust the fade duration in the properties panel for more control.
            </span>
          </div>
        </div>
      )}

      {activeTab === "Captions" && (
        <div className="library-content">
          <div className="caption-feature-icon">
            <Type size={28} />
          </div>
          <h3 className="caption-title">Every word matters.</h3>
          <p className="library-description">
            Make your story easy to follow. Add a caption, then adjust its
            timing on the timeline.
          </p>
          <label className="caption-label" htmlFor="caption-text">
            Your caption
          </label>
          <textarea
            id="caption-text"
            className="caption-input"
            rows={4}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Write what you want to say…"
          />
          <button
            className="library-import"
            disabled={!caption.trim()}
            onClick={() => {
              onAddText(caption.trim());
              setCaption("");
            }}
          >
            <Plus size={16} /> Add caption
          </button>
          <div className="library-info">
            <Info size={15} />
            <span>
              Captions are added as editable text. Create a new caption for each
              line of dialogue.
            </span>
          </div>
        </div>
      )}
      {dropActive && (
        <div className="library-drop-overlay">
          <ArrowUpFromLine size={34} />
          <strong>Drop your files here</strong>
          <span>Videos, photos, and audio</span>
        </div>
      )}
    </aside>
  );
}
