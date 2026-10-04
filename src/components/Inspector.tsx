import { useId, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AlignCenter,
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Film,
  RotateCcw,
  RotateCw,
  Settings2,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from "lucide-react";
import { FILTERS, formatTime } from "../types";
import type { Clip } from "../types";
import "./Inspector.css";

interface InspectorProps {
  clip: Clip | null;
  onChange: (patch: Partial<Clip>) => void;
  aspectRatio: string;
  onAspectRatio: (ratio: string) => void;
  onReset: () => void;
}

function SliderField({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = "%",
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const update = (next: string) => {
    if (next === "") return;
    const number = Number(next);
    if (Number.isFinite(number)) onChange(Math.min(max, Math.max(min, number)));
  };
  return (
    <div className="inspector-slider-field">
      <label htmlFor={id}>{label}</label>
      <div className="inspector-slider-row">
        <input
          id={id}
          aria-label={label}
          className="inspector-range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          style={
            {
              "--range-progress": `${((value - min) / (max - min)) * 100}%`,
            } as CSSProperties
          }
          onChange={(event) => update(event.target.value)}
        />
        <div className="inspector-number-wrap">
          <input
            aria-label={`${label} value`}
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => update(event.target.value)}
          />
          <span>{unit}</span>
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  unit,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  unit?: string;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const id = useId();
  return (
    <div className="inspector-inline-number">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={Math.round(value * 100) / 100}
        onChange={(event) => {
          if (event.target.value === "") return;
          const number = Number(event.target.value);
          if (Number.isFinite(number))
            onChange(
              Math.min(max ?? Infinity, Math.max(min ?? -Infinity, number)),
            );
        }}
      />
      {unit && <span>{unit}</span>}
    </div>
  );
}

function Section({
  title,
  children,
  action,
  initialOpen = true,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <section className="inspector-section">
      <div className="inspector-section-heading">
        <button
          className="inspector-section-toggle"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span>{title}</span>
        </button>
        {action}
      </div>
      {open && <div className="inspector-section-body">{children}</div>}
    </section>
  );
}

export default function Inspector({
  clip,
  onChange,
  aspectRatio,
  onAspectRatio,
  onReset,
}: InspectorProps) {
  const [tab, setTab] = useState("Video");
  const [videoTab, setVideoTab] = useState("Basic");
  const visualTab =
    clip?.type === "text" || clip?.type === "sticker" ? "Text" : "Video";
  const activeTab =
    clip?.type === "audio"
      ? tab === "Speed"
        ? "Speed"
        : "Audio"
      : tab === "Video" || tab === "Text"
        ? visualTab
        : tab;
  const ratioControl = (
    <div className="inspector-ratio-grid">
      {["16:9", "9:16", "1:1", "4:3", "4:5", "21:9"].map((ratio) => (
        <button
          key={ratio}
          className={aspectRatio === ratio ? "is-selected" : ""}
          aria-pressed={aspectRatio === ratio}
          onClick={() => onAspectRatio(ratio)}
        >
          {ratio}
        </button>
      ))}
    </div>
  );
  const resetButton = (
    <button
      className="inspector-icon-button"
      onClick={onReset}
      title="Reset clip adjustments"
      aria-label="Reset clip adjustments"
    >
      <RotateCcw size={13} />
    </button>
  );

  return (
    <aside className="inspector" aria-label="Clip inspector">
      <div className="inspector-tabs">
        {(clip?.type === "audio"
          ? ["Audio", "Speed"]
          : [visualTab, "Audio", "Speed"]
        ).map((item) => (
          <button
            key={item}
            className={activeTab === item ? "is-active" : ""}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
        <span
          className="inspector-help"
          title="Select a clip to edit its properties. Changes are saved automatically."
          aria-label="Select a clip to edit its properties"
        >
          <CircleHelp size={14} />
        </span>
      </div>
      {!clip ? (
        <div className="inspector-scroll">
          <div className="inspector-empty">
            <div className="inspector-empty-icon">
              <SlidersHorizontal size={23} />
            </div>
            <h3>Make it yours</h3>
            <p>
              Select a clip on the timeline
              <br />
              to start fine-tuning.
            </p>
          </div>
          <Section title="Project settings">
            <div className="inspector-field-label">Aspect ratio</div>
            {ratioControl}
            <p className="inspector-hint">
              Choose the perfect frame for your story.
            </p>
          </Section>
        </div>
      ) : (
        <>
          {(activeTab === "Video" || activeTab === "Text") && (
            <div className="inspector-subtabs">
              {(activeTab === "Text"
                ? ["Basic", "Effects"]
                : ["Basic", "Adjust", "Effects"]
              ).map((item) => (
                <button
                  key={item}
                  className={
                    videoTab === item ||
                    (activeTab === "Text" &&
                      videoTab === "Adjust" &&
                      item === "Basic")
                      ? "is-active"
                      : ""
                  }
                  onClick={() => setVideoTab(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
          <div className="inspector-scroll">
            {(activeTab === "Video" || activeTab === "Text") && (
              <>
                {(videoTab === "Basic" ||
                  (activeTab === "Text" && videoTab === "Adjust")) && (
                  <>
                    {activeTab === "Text" && (
                      <Section title="Text" action={resetButton}>
                        <label
                          className="inspector-field-label"
                          htmlFor="clip-text-content"
                        >
                          Content
                        </label>
                        <textarea
                          id="clip-text-content"
                          className="inspector-textarea"
                          value={clip.text ?? ""}
                          onChange={(event) =>
                            onChange({ text: event.target.value })
                          }
                          placeholder="Tell your story…"
                        />
                        <label
                          className="inspector-field-label"
                          htmlFor="clip-font-family"
                        >
                          Font
                        </label>
                        <select
                          id="clip-font-family"
                          className="inspector-select"
                          value={clip.fontFamily}
                          onChange={(event) =>
                            onChange({ fontFamily: event.target.value })
                          }
                        >
                          {[
                            "Inter",
                            "Arial",
                            "Georgia",
                            "Courier New",
                            "Impact",
                          ].map((font) => (
                            <option key={font}>{font}</option>
                          ))}
                        </select>
                        <div className="inspector-text-style">
                          <NumberField
                            label="Size"
                            value={clip.fontSize}
                            min={8}
                            max={300}
                            onChange={(fontSize) => onChange({ fontSize })}
                          />
                          <button
                            className={`inspector-style-button ${clip.bold ? "is-selected" : ""}`}
                            aria-label="Bold text"
                            aria-pressed={clip.bold}
                            onClick={() => onChange({ bold: !clip.bold })}
                          >
                            <Bold size={15} />
                          </button>
                          <label className="inspector-color" title="Text color">
                            <input
                              type="color"
                              aria-label="Text color"
                              value={clip.color}
                              onChange={(event) =>
                                onChange({ color: event.target.value })
                              }
                            />
                          </label>
                        </div>
                      </Section>
                    )}
                    <Section
                      title="Transform"
                      action={activeTab === "Video" ? resetButton : undefined}
                    >
                      <SliderField
                        label="Scale"
                        value={clip.scale}
                        min={10}
                        max={300}
                        onChange={(scale) => onChange({ scale })}
                      />
                      <div className="inspector-property-row">
                        <span className="inspector-field-label">Position</span>
                        <button
                          className="inspector-icon-button"
                          aria-label="Center clip"
                          title="Center clip"
                          onClick={() => onChange({ x: 0, y: 0 })}
                        >
                          <AlignCenter size={14} />
                        </button>
                      </div>
                      <div className="inspector-position">
                        <NumberField
                          label="X"
                          value={clip.x}
                          onChange={(x) => onChange({ x })}
                        />
                        <NumberField
                          label="Y"
                          value={clip.y}
                          onChange={(y) => onChange({ y })}
                        />
                      </div>
                      <div className="inspector-rotation">
                        <span className="inspector-field-label">Rotate</span>
                        <NumberField
                          label="Rotation"
                          value={clip.rotation}
                          unit="°"
                          onChange={(rotation) => onChange({ rotation })}
                        />
                        <button
                          className="inspector-style-button"
                          aria-label="Rotate 90 degrees"
                          title="Rotate 90 degrees"
                          onClick={() =>
                            onChange({ rotation: (clip.rotation + 90) % 360 })
                          }
                        >
                          <RotateCw size={14} />
                        </button>
                      </div>
                    </Section>
                    <Section title="Blend">
                      <SliderField
                        label="Opacity"
                        value={clip.opacity}
                        onChange={(opacity) => onChange({ opacity })}
                      />
                    </Section>
                    <Section title="Canvas">
                      <div className="inspector-property-row">
                        <span className="inspector-field-label">
                          Aspect ratio
                        </span>
                        <span className="inspector-property-value">
                          {aspectRatio}
                        </span>
                      </div>
                      {ratioControl}
                    </Section>
                  </>
                )}
                {videoTab === "Adjust" && activeTab === "Video" && (
                  <Section title="Color adjustment" action={resetButton}>
                    <SliderField
                      label="Brightness"
                      value={clip.brightness}
                      max={200}
                      onChange={(brightness) => onChange({ brightness })}
                    />
                    <SliderField
                      label="Contrast"
                      value={clip.contrast}
                      max={200}
                      onChange={(contrast) => onChange({ contrast })}
                    />
                    <SliderField
                      label="Saturation"
                      value={clip.saturation}
                      max={200}
                      onChange={(saturation) => onChange({ saturation })}
                    />
                    <p className="inspector-hint">
                      Small adjustments. A whole new mood.
                    </p>
                  </Section>
                )}
                {videoTab === "Effects" && (
                  <>
                    <Section title="Filters" action={resetButton}>
                      <label
                        htmlFor="clip-filter"
                        className="inspector-field-label"
                      >
                        Look
                      </label>
                      <select
                        id="clip-filter"
                        className="inspector-select"
                        value={clip.filter}
                        onChange={(event) =>
                          onChange({ filter: event.target.value })
                        }
                      >
                        {FILTERS.map((filter) => (
                          <option key={filter}>{filter}</option>
                        ))}
                      </select>
                      <div className="inspector-filter-chips">
                        {FILTERS.map((filter) => (
                          <button
                            key={filter}
                            className={
                              clip.filter === filter ? "is-selected" : ""
                            }
                            onClick={() => onChange({ filter })}
                          >
                            {filter}
                            {clip.filter === filter && <Check size={11} />}
                          </button>
                        ))}
                      </div>
                    </Section>
                    <Section title="Fades">
                      <SliderField
                        label="Fade in"
                        unit="s"
                        min={0}
                        max={Math.min(5, clip.duration / 2)}
                        step={0.1}
                        value={clip.fadeIn}
                        onChange={(fadeIn) => onChange({ fadeIn })}
                      />
                      <SliderField
                        label="Fade out"
                        unit="s"
                        min={0}
                        max={Math.min(5, clip.duration / 2)}
                        step={0.1}
                        value={clip.fadeOut}
                        onChange={(fadeOut) => onChange({ fadeOut })}
                      />
                    </Section>
                  </>
                )}
              </>
            )}
            {activeTab === "Audio" && (
              <>
                <div className="inspector-panel-label">
                  <Volume2 size={14} />
                  <span>Audio settings</span>
                </div>
                <Section title="Volume" action={resetButton}>
                  <SliderField
                    label="Volume"
                    value={clip.volume}
                    max={100}
                    onChange={(volume) => onChange({ volume })}
                  />
                  <label className="inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={clip.volume === 0}
                      onChange={(event) =>
                        onChange({ volume: event.target.checked ? 0 : 80 })
                      }
                    />
                    <VolumeX size={14} />
                    <span>Mute clip</span>
                  </label>
                  {clip.type !== "video" && clip.type !== "audio" && (
                    <p className="inspector-hint">
                      This clip has no audio. Add music from the media panel to
                      bring it to life.
                    </p>
                  )}
                </Section>
              </>
            )}
            {activeTab === "Speed" && (
              <>
                <div className="inspector-panel-label">
                  <Settings2 size={14} />
                  <span>Playback speed</span>
                </div>
                <Section title="Normal" action={resetButton}>
                  <SliderField
                    label="Speed"
                    value={clip.speed}
                    min={0.25}
                    max={4}
                    step={0.05}
                    unit="×"
                    onChange={(speed) => onChange({ speed })}
                  />
                  <div className="inspector-speed-presets">
                    {[0.5, 1, 1.5, 2].map((speed) => (
                      <button
                        key={speed}
                        className={clip.speed === speed ? "is-selected" : ""}
                        onClick={() => onChange({ speed })}
                      >
                        {speed}×
                      </button>
                    ))}
                  </div>
                  <p className="inspector-hint">
                    Slow things down or pick up the pace.
                  </p>
                  <div className="inspector-speed-info">
                    <span>Clip duration</span>
                    <strong>{clip.duration.toFixed(1)}s</strong>
                  </div>
                </Section>
              </>
            )}
            <Section title="Clip details" initialOpen={false}>
              <div className="inspector-details">
                <span>Name</span>
                <strong title={clip.name}>{clip.name}</strong>
                <span>Type</span>
                <strong>{clip.type}</strong>
                <span>Start</span>
                <strong>{formatTime(clip.start)}</strong>
                <span>Duration</span>
                <strong>{formatTime(clip.duration)}</strong>
              </div>
            </Section>
          </div>
          <div className="inspector-footer">
            <Film size={13} />
            <span title={clip.name}>{clip.name}</span>
            <button onClick={onReset}>Reset</button>
          </div>
        </>
      )}
    </aside>
  );
}
