import { useEffect, useRef, useState } from "react";
import {
  Circle,
  Mic,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
} from "lucide-react";
import fixWebmDuration from "fix-webm-duration";
import { uid } from "../types";
import type { Asset } from "../types";
import "./RecorderPanel.css";

type RecorderStatus =
  "idle" | "requesting" | "recording" | "paused" | "processing" | "review";
type RecorderMode = "voice" | "screen";

function recordingTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}.${Math.floor((seconds % 1) * 10)}`;
}

function recordingMime(mode: RecorderMode) {
  const candidates =
    mode === "voice"
      ? [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
          "audio/mp4",
        ]
      : [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm",
          "video/mp4",
        ];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime));
}

function toDataURL(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(new Error("The recording could not be read. Please try again."));
    reader.readAsDataURL(blob);
  });
}

function videoThumbnail(blob: Blob) {
  return new Promise<string>((resolve) => {
    const source = URL.createObjectURL(blob);
    const video = document.createElement("video");
    let settled = false;
    const finish = (thumbnail: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(source);
      resolve(thumbnail);
    };
    const timeout = window.setTimeout(() => finish(""), 6000);
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = Math.max(
          1,
          Math.round((video.videoHeight / video.videoWidth) * 320),
        );
        canvas
          .getContext("2d")
          ?.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.8));
      } catch {
        finish("");
      }
    };
    video.onerror = () => finish("");
    video.src = source;
    video.load();
  });
}

export default function RecorderPanel({
  onRecorded,
  onClose,
  onNotify,
}: {
  onRecorded: (asset: Asset) => void;
  onClose: () => void;
  onNotify: (message: string) => void;
}) {
  const [mode, setMode] = useState<RecorderMode>("voice");
  const [includeMic, setIncludeMic] = useState(true);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const [audioDescription, setAudioDescription] = useState("");
  const [recorded, setRecorded] = useState<Asset | null>(null);
  const alive = useRef(true);
  const streams = useRef(new Set<MediaStream>());
  const recorder = useRef<MediaRecorder | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const meterFrame = useRef(0);
  const startedAt = useRef(0);
  const elapsed = useRef(0);
  const operation = useRef(0);

  function releaseSources() {
    cancelAnimationFrame(meterFrame.current);
    for (const stream of streams.current) {
      for (const track of stream.getTracks()) {
        track.onended = null;
        track.stop();
      }
    }
    streams.current.clear();
    const context = audioContext.current;
    audioContext.current = null;
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current += 1;
      const current = recorder.current;
      if (current && current.state !== "inactive") current.stop();
      releaseSources();
    };
  }, []);

  useEffect(() => {
    if (status !== "recording") return;
    const interval = window.setInterval(() => {
      setSeconds(
        (elapsed.current + performance.now() - startedAt.current) / 1000,
      );
    }, 100);
    return () => window.clearInterval(interval);
  }, [status]);

  function trackStream(stream: MediaStream, request: number) {
    if (!alive.current || operation.current !== request) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
    streams.current.add(stream);
    return true;
  }

  function makeAudioContext() {
    if (!audioContext.current) audioContext.current = new AudioContext();
    return audioContext.current;
  }

  function monitorMicrophone(stream: MediaStream) {
    const context = makeAudioContext();
    const analyzer = context.createAnalyser();
    analyzer.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyzer);
    const data = new Uint8Array(analyzer.fftSize);
    const update = () => {
      if (!alive.current || audioContext.current !== context) return;
      analyzer.getByteTimeDomainData(data);
      let total = 0;
      for (const sample of data) total += ((sample - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(total / data.length) * 4));
      meterFrame.current = requestAnimationFrame(update);
    };
    update();
  }

  function stopRecording() {
    const current = recorder.current;
    if (!current || current.state === "inactive") return;
    if (startedAt.current)
      elapsed.current += performance.now() - startedAt.current;
    startedAt.current = 0;
    setSeconds(elapsed.current / 1000);
    setStatus("processing");
    current.stop();
    releaseSources();
    setLevel(0);
  }

  async function startRecording() {
    if (status !== "idle" && status !== "review") return;
    const request = ++operation.current;
    setError("");
    setRecorded(null);
    setSeconds(0);
    setLevel(0);
    setAudioDescription("");
    setStatus("requesting");
    elapsed.current = 0;
    startedAt.current = 0;
    let capture: MediaStream | undefined;
    let microphone: MediaStream | undefined;
    try {
      if (
        !window.isSecureContext ||
        !navigator.mediaDevices ||
        typeof MediaRecorder === "undefined"
      ) {
        throw new Error(
          "Recording is unavailable in this browser. Open this editor over HTTPS in a current browser.",
        );
      }
      if (mode === "screen") {
        if (!navigator.mediaDevices.getDisplayMedia)
          throw new Error(
            "This browser does not support screen recording. Try Chrome or Edge on desktop.",
          );
        capture = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: true,
        });
        if (!trackStream(capture, request)) return;
      }
      if (mode === "voice" || includeMic) {
        microphone = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        if (!trackStream(microphone, request)) return;
        monitorMicrophone(microphone);
      }
      const combined = new MediaStream(capture?.getVideoTracks() || []);
      const systemAudio = capture?.getAudioTracks() || [];
      const microphoneAudio = microphone?.getAudioTracks() || [];
      if (systemAudio.length && microphoneAudio.length) {
        const context = makeAudioContext();
        const destination = context.createMediaStreamDestination();
        context
          .createMediaStreamSource(new MediaStream(systemAudio))
          .connect(destination);
        context
          .createMediaStreamSource(new MediaStream(microphoneAudio))
          .connect(destination);
        destination.stream
          .getAudioTracks()
          .forEach((track) => combined.addTrack(track));
      } else {
        [...systemAudio, ...microphoneAudio].forEach((track) =>
          combined.addTrack(track),
        );
      }
      streams.current.add(combined);
      if (audioContext.current?.state === "suspended")
        await audioContext.current.resume();
      if (!alive.current || operation.current !== request) {
        releaseSources();
        return;
      }
      if (!combined.getTracks().some((track) => track.readyState === "live"))
        throw new Error(
          "The selected recording source has ended. Please choose it again.",
        );
      if (
        capture &&
        !capture.getVideoTracks().some((track) => track.readyState === "live")
      )
        throw new Error(
          "Screen sharing ended before recording started. Choose your screen again.",
        );
      if (mode === "screen") {
        setAudioDescription(
          systemAudio.length
            ? microphoneAudio.length
              ? "Screen audio + microphone"
              : "Screen audio"
            : microphoneAudio.length
              ? "Microphone only · screen audio was not shared"
              : "Video only · screen audio was not shared",
        );
      } else setAudioDescription("Microphone connected");
      const mimeType = recordingMime(mode);
      const current = new MediaRecorder(
        combined,
        mimeType ? { mimeType } : undefined,
      );
      const chunks: Blob[] = [];
      recorder.current = current;
      current.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      current.onerror = () => {
        if (!alive.current || operation.current !== request) return;
        operation.current += 1;
        releaseSources();
        if (alive.current) {
          setError(
            "The browser stopped recording unexpectedly. Please try again.",
          );
          setStatus("idle");
        }
      };
      current.onstop = async () => {
        if (!alive.current || operation.current !== request) return;
        if (startedAt.current)
          elapsed.current += performance.now() - startedAt.current;
        startedAt.current = 0;
        releaseSources();
        setSeconds(elapsed.current / 1000);
        setLevel(0);
        setStatus("processing");
        const duration = elapsed.current / 1000;
        if (!chunks.length || duration < 0.1) {
          setError(
            "The recording is empty. Record for at least a moment, then stop.",
          );
          setStatus("idle");
          return;
        }
        try {
          let blob = new Blob(chunks, {
            type:
              current.mimeType ||
              mimeType ||
              (mode === "voice" ? "audio/webm" : "video/webm"),
          });
          if (blob.type.includes("webm"))
            blob = await fixWebmDuration(blob, elapsed.current, {
              logger: false,
            });
          const [src, thumbnail] = await Promise.all([
            toDataURL(blob),
            mode === "screen" ? videoThumbnail(blob) : Promise.resolve(""),
          ]);
          if (!alive.current || operation.current !== request) return;
          setRecorded({
            id: uid(),
            name: `${mode === "voice" ? "Voiceover" : "Screen recording"} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            type: mode === "voice" ? "audio" : "video",
            src,
            thumbnail,
            duration,
            category: "Recordings",
          });
          setStatus("review");
        } catch (caught) {
          if (!alive.current || operation.current !== request) return;
          setError(
            caught instanceof Error
              ? caught.message
              : "The recording could not be prepared. Please try again.",
          );
          setStatus("idle");
        }
      };
      // Stop when the user ends screen sharing or disconnects the microphone.
      (capture?.getVideoTracks() || microphoneAudio).forEach((track) => {
        track.onended = stopRecording;
      });
      current.start(250);
      startedAt.current = performance.now();
      setStatus("recording");
    } catch (caught) {
      releaseSources();
      if (!alive.current || operation.current !== request) return;
      const name = caught instanceof DOMException ? caught.name : "";
      const message =
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Permission was not granted or sharing was cancelled. Choose Start recording to try again."
          : name === "NotFoundError"
            ? "No microphone was found. Connect a microphone, or record your screen without one."
            : name === "NotReadableError"
              ? "The selected device is unavailable or in use. Check your device and try again."
              : caught instanceof Error
                ? caught.message
                : "Recording could not start. Please try again.";
      setError(message);
      setStatus("idle");
    }
  }

  function togglePause() {
    const current = recorder.current;
    if (current?.state === "recording") {
      current.pause();
      elapsed.current += performance.now() - startedAt.current;
      startedAt.current = 0;
      setSeconds(elapsed.current / 1000);
      setStatus("paused");
    } else if (current?.state === "paused") {
      current.resume();
      startedAt.current = performance.now();
      setStatus("recording");
    }
  }

  const capturing = status === "recording" || status === "paused";
  const busy = capturing || status === "requesting" || status === "processing";

  return (
    <div className="recorder-panel">
      <div className="modal-icon">
        {mode === "voice" ? <Mic size={23} /> : <Monitor size={23} />}
      </div>
      <h2 id="modal-title">Capture something new.</h2>
      <p className="modal-description">
        Record a voiceover or your screen, then add it to your timeline.
      </p>
      <div
        className="recorder-tabs"
        role="tablist"
        aria-label="Recording source"
      >
        <button
          role="tab"
          aria-selected={mode === "voice"}
          disabled={busy}
          className={mode === "voice" ? "active" : ""}
          onClick={() => {
            setMode("voice");
            setStatus("idle");
            setRecorded(null);
            setError("");
            setSeconds(0);
            setAudioDescription("");
          }}
        >
          <Mic size={16} /> Voiceover
        </button>
        <button
          role="tab"
          aria-selected={mode === "screen"}
          disabled={busy}
          className={mode === "screen" ? "active" : ""}
          onClick={() => {
            setMode("screen");
            setStatus("idle");
            setRecorded(null);
            setError("");
            setSeconds(0);
            setAudioDescription("");
          }}
        >
          <Monitor size={16} /> Screen
        </button>
      </div>

      {mode === "screen" && !recorded && (
        <div className="recorder-options">
          <label>
            <input
              type="checkbox"
              checked={includeMic}
              disabled={busy}
              onChange={(event) => setIncludeMic(event.target.checked)}
            />{" "}
            Include microphone
          </label>
          <p>
            Your browser lets you choose a tab, window, or screen. Audio is
            included only when your browser shares it.
          </p>
        </div>
      )}

      {recorded ? (
        <div className="recording-preview">
          {recorded.type === "video" ? (
            <video src={recorded.src} controls playsInline preload="metadata" />
          ) : (
            <audio src={recorded.src} controls preload="metadata" />
          )}
          <div className="recording-summary">
            <span>{recorded.name}</span>
            <strong>{recordingTime(recorded.duration)}</strong>
          </div>
          <label className="recording-name">
            Recording name
            <input
              aria-label="Recording name"
              value={recorded.name}
              maxLength={120}
              onChange={(event) =>
                setRecorded({ ...recorded, name: event.target.value })
              }
            />
          </label>
        </div>
      ) : (
        <div className={`recorder-monitor ${capturing ? "is-live" : ""}`}>
          <span
            className={`recorder-state ${status === "recording" ? "is-recording" : ""}`}
          >
            <i />
            {status === "requesting"
              ? "Waiting for browser permission"
              : status === "processing"
                ? "Preparing your recording…"
                : status === "paused"
                  ? "Paused"
                  : status === "recording"
                    ? "Recording"
                    : "Ready when you are"}
          </span>
          <div
            className="recorder-timer"
            aria-label={`Recorded ${seconds.toFixed(1)} seconds`}
          >
            {recordingTime(seconds)}
          </div>
          {(mode === "voice" || includeMic) && (
            <div
              className="recorder-meter"
              role="meter"
              aria-label="Microphone level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level * 100)}
            >
              <Volume2 size={15} />
              <div>
                {Array.from({ length: 24 }, (_, index) => (
                  <i key={index} className={index / 24 < level ? "lit" : ""} />
                ))}
              </div>
            </div>
          )}
          <p>
            {audioDescription ||
              (mode === "voice"
                ? "Microphone access is requested when you start."
                : "Choose what to share when you start.")}
          </p>
        </div>
      )}

      {error && (
        <p className="recorder-error" role="alert">
          {error}
        </p>
      )}
      <div className="recorder-actions">
        {capturing ? (
          <>
            <button className="secondary-button" onClick={togglePause}>
              {status === "paused" ? <Play size={15} /> : <Pause size={15} />}
              {status === "paused" ? "Resume" : "Pause"}
            </button>
            <button className="primary-button" onClick={stopRecording}>
              <Square size={14} fill="currentColor" />
              Stop recording
            </button>
          </>
        ) : status === "review" && recorded ? (
          <>
            <button
              className="secondary-button"
              onClick={() => {
                setRecorded(null);
                setStatus("idle");
                setSeconds(0);
                setAudioDescription("");
              }}
            >
              <RotateCcw size={15} />
              Record again
            </button>
            <button
              className="primary-button"
              onClick={() => {
                onRecorded({
                  ...recorded,
                  name: recorded.name.trim() || "Untitled recording",
                });
                onNotify("Recording added to your timeline");
                onClose();
              }}
            >
              Use recording
            </button>
          </>
        ) : (
          <button
            className="primary-button full-width"
            disabled={busy}
            onClick={() => void startRecording()}
          >
            <Circle size={15} fill="currentColor" />
            {status === "requesting"
              ? "Waiting for permission…"
              : status === "processing"
                ? "Preparing recording…"
                : "Start recording"}
          </button>
        )}
      </div>
      {!recorded && (
        <p className="recorder-footnote">
          {capturing
            ? "Closing this window discards the current recording."
            : "Preview your recording before adding it to the project."}
        </p>
      )}
    </div>
  );
}
