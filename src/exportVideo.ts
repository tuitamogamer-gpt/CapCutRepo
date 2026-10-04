import fixWebmDuration from "fix-webm-duration";
import { filterStyle, projectDuration, type Clip, type Project } from "./types";

type ExportOptions = {
  width: number;
  height: number;
  fps: number;
  onProgress: (progress: number) => void;
  signal?: AbortSignal;
};

type PreparedClip = {
  clip: Clip;
  image?: HTMLImageElement;
  media?: HTMLMediaElement;
  gain?: GainNode;
  playing: boolean;
};

const abortError = () => new DOMException("Export cancelled.", "AbortError");
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function opacityAt(clip: Clip, time: number): number {
  const localTime = time - clip.start;
  let opacity = clamp(clip.opacity / 100, 0, 1);
  if (clip.fadeIn > 0) opacity *= clamp(localTime / clip.fadeIn, 0, 1);
  if (clip.fadeOut > 0)
    opacity *= clamp((clip.duration - localTime) / clip.fadeOut, 0, 1);
  return opacity;
}

function fadeAt(clip: Clip, time: number): number {
  const localTime = time - clip.start;
  let value = 1;
  if (clip.fadeIn > 0) value *= clamp(localTime / clip.fadeIn, 0, 1);
  if (clip.fadeOut > 0)
    value *= clamp((clip.duration - localTime) / clip.fadeOut, 0, 1);
  return value;
}

function waitForMedia(
  element: HTMLMediaElement,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      element.removeEventListener("loadeddata", ready);
      element.removeEventListener("error", failed);
      signal?.removeEventListener("abort", aborted);
    };
    const ready = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(
        new Error(
          "A media file could not be loaded. Reimport the file and try again.",
        ),
      );
    };
    const aborted = () => {
      cleanup();
      reject(abortError());
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "A media file took too long to load. Check your connection and try again.",
        ),
      );
    }, 45_000);
    element.addEventListener("loadeddata", ready, { once: true });
    element.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
    else if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) ready();
    else element.load();
  });
}

function waitForImage(
  image: HTMLImageElement,
  src: string,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", aborted);
    };
    const aborted = () => {
      cleanup();
      reject(abortError());
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "An image took too long to load. Check your connection and try again.",
        ),
      );
    }, 45_000);
    image.onload = () => {
      cleanup();
      resolve();
    };
    image.onerror = () => {
      cleanup();
      reject(
        new Error(
          "An image could not be loaded. Reimport the image and try again.",
        ),
      );
    };
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
    else image.src = src;
  });
}

function seek(
  element: HTMLMediaElement,
  time: number,
  signal?: AbortSignal,
): Promise<void> {
  const duration = element.duration;
  const target = Math.max(
    0,
    Number.isFinite(duration)
      ? Math.min(time, Math.max(0, duration - 0.02))
      : time,
  );
  if (Math.abs(element.currentTime - target) < 0.01) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      element.removeEventListener("seeked", ready);
      element.removeEventListener("error", failed);
      signal?.removeEventListener("abort", aborted);
    };
    const ready = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(
        new Error("A media file could not be read at its trimmed position."),
      );
    };
    const aborted = () => {
      cleanup();
      reject(abortError());
    };
    const timeout = setTimeout(failed, 20_000);
    element.addEventListener("seeked", ready, { once: true });
    element.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
    else element.currentTime = target;
  });
}

function drawClip(
  ctx: CanvasRenderingContext2D,
  prepared: PreparedClip,
  time: number,
  width: number,
  height: number,
) {
  const { clip, image, media } = prepared;
  if (
    clip.type === "audio" ||
    time < clip.start ||
    time >= clip.start + clip.duration
  )
    return;

  ctx.save();
  ctx.globalAlpha = opacityAt(clip, time);
  ctx.filter = filterStyle(clip);
  ctx.translate(
    width / 2 + (clip.x / 100) * width,
    height / 2 + (clip.y / 100) * height,
  );
  ctx.rotate((clip.rotation * Math.PI) / 180);
  ctx.scale(clip.scale / 100, clip.scale / 100);

  if (clip.type === "text" || clip.type === "sticker") {
    const size = (clip.fontSize * width) / 960;
    ctx.font = `${clip.bold ? "700" : "400"} ${size}px "${clip.fontFamily || "Inter"}", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = clip.color || "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = (8 * width) / 960;
    ctx.shadowOffsetY = (2 * width) / 960;
    const lines = (clip.text || clip.name).split("\n");
    const lineHeight = size * 1.09;
    lines.forEach((line, index) =>
      ctx.fillText(line, 0, (index - (lines.length - 1) / 2) * lineHeight),
    );
  } else {
    const video = media instanceof HTMLVideoElement ? media : undefined;
    const drawable = image || video;
    const sourceWidth = image?.naturalWidth || video?.videoWidth || 0;
    const sourceHeight = image?.naturalHeight || video?.videoHeight || 0;
    if (drawable && sourceWidth && sourceHeight) {
      const scale = Math.max(width / sourceWidth, height / sourceHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      ctx.drawImage(
        drawable,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight,
      );
    }
  }
  ctx.restore();
}

/** Records the actual timeline in real time. The output is a playable WebM video. */
export async function exportVideo(
  project: Project,
  options: ExportOptions,
): Promise<Blob> {
  const { width, height, fps, onProgress, signal } = options;
  if (
    typeof MediaRecorder === "undefined" ||
    !HTMLCanvasElement.prototype.captureStream
  ) {
    throw new Error(
      "Video export is not supported in this browser. Use a recent version of Chrome, Edge, or Firefox.",
    );
  }
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(fps) ||
    width < 1 ||
    height < 1 ||
    fps < 1
  ) {
    throw new Error("Choose a valid video resolution and frame rate.");
  }
  if (!project.clips.some((clip) => clip.duration > 0))
    throw new Error("Add a clip to your timeline before exporting.");
  if (signal?.aborted) throw abortError();

  const mimeType = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType)
    throw new Error(
      "This browser cannot encode WebM video. Try Chrome, Edge, or Firefox.",
    );

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the video renderer.");

  // Snapshot the timeline so editing during an export cannot alter the recording.
  const clips = project.clips
    .filter((clip) => clip.duration > 0)
    .map((clip) => ({ ...clip }));
  const background = project.background || "#000000";
  const duration = projectDuration(clips);
  const prepared: PreparedClip[] = [];
  const loadController = new AbortController();
  const abortLoading = () => loadController.abort();
  signal?.addEventListener("abort", abortLoading, { once: true });
  let stream: MediaStream | undefined;
  let audioContext: AudioContext | undefined;
  let destination: MediaStreamAudioDestinationNode | undefined;
  let recorder: MediaRecorder | undefined;
  let tickTimer: ReturnType<typeof setInterval> | undefined;

  try {
    onProgress(0);
    // Resume while still in the export-button gesture, before asynchronous loading.
    if (
      clips.some(
        (clip) =>
          (clip.type === "audio" || clip.type === "video") && clip.volume > 0,
      )
    ) {
      audioContext = new AudioContext();
      const resume = audioContext.resume();
      destination = audioContext.createMediaStreamDestination();
      await resume;
      if (audioContext.state !== "running")
        throw new Error(
          "Audio export could not start. Click Export again to enable audio.",
        );
    }

    await Promise.all(
      clips.map(async (clip) => {
        const item: PreparedClip = { clip, playing: false };
        prepared.push(item);
        if (clip.type === "image") {
          item.image = new Image();
          item.image.crossOrigin = "anonymous";
          await waitForImage(item.image, clip.src, loadController.signal);
        } else if (clip.type === "video" || clip.type === "audio") {
          const element = document.createElement(
            clip.type === "video" ? "video" : "audio",
          );
          item.media = element;
          element.crossOrigin = "anonymous";
          element.preload = "auto";
          element.src = clip.src;
          element.playbackRate = clamp(clip.speed || 1, 0.1, 16);
          if (element instanceof HTMLVideoElement) element.playsInline = true;
          // All audible media is routed solely to the recorded stream.
          if (audioContext && destination && clip.volume > 0) {
            const source = audioContext.createMediaElementSource(element);
            const gain = audioContext.createGain();
            gain.gain.value = 0;
            source.connect(gain);
            gain.connect(destination);
            item.gain = gain;
          } else element.muted = true;
          await waitForMedia(element, loadController.signal);
          await seek(
            element,
            Math.max(0, clip.sourceOffset || 0),
            loadController.signal,
          );
        }
      }),
    );
    await document.fonts.ready;
    if (signal?.aborted) throw abortError();
    prepared.sort(
      (a, b) => a.clip.track - b.clip.track || a.clip.start - b.clip.start,
    );

    const render = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      prepared.forEach((item) => drawClip(ctx, item, time, width, height));
    };
    render(0);
    // Reading a pixel catches cross-origin canvas failures before recording begins.
    ctx.getImageData(0, 0, 1, 1);
    stream = canvas.captureStream(fps);
    destination?.stream
      .getAudioTracks()
      .forEach((track) => stream!.addTrack(track));
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: Math.round(
        clamp(width * height * fps * 0.12, 2_000_000, 28_000_000),
      ),
      audioBitsPerSecond: 192_000,
    });
    const recording = recorder;
    const chunks: BlobPart[] = [];

    const recordedBlob = await new Promise<Blob>((resolve, reject) => {
      let failure: Error | undefined;
      let stopping = false;
      let startTime = 0;
      const removeAbortListener = () =>
        signal?.removeEventListener("abort", cancelled);
      const stop = (error?: Error) => {
        if (stopping) return;
        stopping = true;
        failure = error;
        clearInterval(tickTimer);
        prepared.forEach((item) => item.media?.pause());
        if (recording.state !== "inactive") recording.stop();
        else {
          removeAbortListener();
          reject(error || new Error("Video recording stopped unexpectedly."));
        }
      };
      const cancelled = () => stop(abortError());
      signal?.addEventListener("abort", cancelled, { once: true });
      recording.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recording.onerror = () =>
        stop(
          new Error(
            "The browser could not finish encoding your video. Try a lower resolution.",
          ),
        );
      recording.onstop = () => {
        removeAbortListener();
        if (failure) reject(failure);
        else if (!chunks.length)
          reject(
            new Error(
              "The browser produced an empty video. Please try exporting again.",
            ),
          );
        else
          resolve(new Blob(chunks, { type: recording.mimeType || mimeType }));
      };

      const tick = () => {
        if (stopping) return;
        if (signal?.aborted) {
          cancelled();
          return;
        }
        const time = Math.min(duration, (performance.now() - startTime) / 1000);
        try {
          for (const item of prepared) {
            const { clip, media, gain } = item;
            if (!media) continue;
            const active =
              time >= clip.start && time < clip.start + clip.duration;
            if (active && !item.playing) {
              item.playing = true;
              const sourceTime = Math.max(
                0,
                clip.sourceOffset + (time - clip.start) * clip.speed,
              );
              if (Math.abs(media.currentTime - sourceTime) > 0.08)
                media.currentTime = sourceTime;
              void media
                .play()
                .catch(() =>
                  stop(
                    new Error(
                      `Could not play “${clip.name}” for export. Reimport the media or try exporting again.`,
                    ),
                  ),
                );
            } else if (!active && item.playing) {
              item.playing = false;
              media.pause();
            }
            if (gain && audioContext) {
              gain.gain.setValueAtTime(
                active
                  ? Math.max(0, clip.volume / 100) * fadeAt(clip, time)
                  : 0,
                audioContext.currentTime,
              );
            }
          }
          // Keep the final visible frame while the recorder finishes its last packet.
          render(Math.min(time, duration - 0.001));
          onProgress(Math.min(0.999, time / duration));
          if (time >= duration) stop();
        } catch (error) {
          stop(
            error instanceof Error
              ? error
              : new Error("Video rendering failed."),
          );
        }
      };

      try {
        recording.start(250);
        startTime = performance.now();
        tick();
        if (!stopping) tickTimer = setInterval(tick, 1000 / fps);
      } catch (error) {
        removeAbortListener();
        reject(
          error instanceof Error
            ? error
            : new Error("Video recording could not start."),
        );
      }
    });
    if (signal?.aborted) throw abortError();
    // MediaRecorder omits WebM duration, which otherwise leaves players showing
    // Infinity and prevents reliable seeking until the whole file is scanned.
    const finalizedBlob = await fixWebmDuration(recordedBlob, duration * 1000, {
      logger: false,
    });
    if (signal?.aborted) throw abortError();
    onProgress(1);
    return finalizedBlob;
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (error instanceof DOMException && error.name === "SecurityError") {
      throw new Error(
        "One of the media files does not allow video export. Download it and import it from your computer.",
      );
    }
    throw error;
  } finally {
    loadController.abort();
    signal?.removeEventListener("abort", abortLoading);
    clearInterval(tickTimer);
    if (recorder && recorder.state !== "inactive") recorder.stop();
    for (const item of prepared) {
      item.gain?.disconnect();
      if (item.media) {
        item.media.pause();
        item.media.removeAttribute("src");
        item.media.load();
      }
      if (item.image) item.image.removeAttribute("src");
    }
    stream?.getTracks().forEach((track) => track.stop());
    destination?.stream.getTracks().forEach((track) => track.stop());
    if (audioContext && audioContext.state !== "closed")
      await audioContext.close().catch(() => undefined);
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Allow slower browsers to begin their download before revoking the temporary URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
