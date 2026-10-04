import fixWebmDuration from "fix-webm-duration";
import { evaluateClip } from "./animation";
import { filterStyle, projectDuration, type Clip, type Project } from "./types";

export type ExportFormat = {
  id: "webm" | "mp4";
  label: string;
  mimeType: string;
};

export type ExportOptions = {
  width: number;
  height: number;
  fps: number;
  format?: ExportFormat["id"];
  onProgress: (progress: number) => void;
  signal?: AbortSignal;
};

export type FrameExportOptions = {
  width: number;
  height: number;
  signal?: AbortSignal;
};

/** Only offer containers and codecs the current browser can actually record. */
export function getExportFormats(): ExportFormat[] {
  if (typeof MediaRecorder === "undefined") return [];
  const candidates: {
    id: ExportFormat["id"];
    label: string;
    types: string[];
  }[] = [
    {
      id: "webm",
      label: "WebM",
      types: [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ],
    },
    {
      id: "mp4",
      label: "MP4",
      types: [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4;codecs=avc1,mp4a.40.2",
        "video/mp4",
      ],
    },
  ];
  return candidates.flatMap(({ id, label, types }) => {
    const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
    return mimeType ? [{ id, label, mimeType }] : [];
  });
}

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
  if (signal?.aborted) return Promise.reject(abortError());
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

function snapshotClips(clips: Clip[]): Clip[] {
  return clips
    .filter((clip) => clip.duration > 0)
    .map((clip) => ({
      ...clip,
      crop: clip.crop ? { ...clip.crop } : undefined,
      keyframes: clip.keyframes?.map((frame) => ({ ...frame })),
    }));
}

function layerOrder(clip: Clip): number {
  if (clip.type === "text" || clip.type === "sticker") return 2;
  return clip.track === 3 ? 1 : 0;
}

async function prepareClips(
  clips: Clip[],
  prepared: PreparedClip[],
  signal: AbortSignal,
  options: {
    time?: number;
    audioContext?: AudioContext;
    destination?: MediaStreamAudioDestinationNode;
  } = {},
) {
  await Promise.all(
    clips.map(async (clip) => {
      const item: PreparedClip = { clip, playing: false };
      prepared.push(item);
      if (clip.type === "image") {
        item.image = new Image();
        item.image.crossOrigin = "anonymous";
        await waitForImage(item.image, clip.src, signal);
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
        // Audio is routed solely to the recording, never to the speakers.
        if (options.audioContext && options.destination && clip.volume > 0) {
          const source = options.audioContext.createMediaElementSource(element);
          const gain = options.audioContext.createGain();
          gain.gain.value = 0;
          source.connect(gain);
          gain.connect(options.destination);
          item.gain = gain;
        } else element.muted = true;
        await waitForMedia(element, signal);
        const localTime =
          options.time === undefined
            ? 0
            : Math.max(0, options.time - clip.start);
        await seek(
          element,
          Math.max(0, clip.sourceOffset || 0) + localTime * (clip.speed || 1),
          signal,
        );
      }
    }),
  );
  await document.fonts.ready;
  if (signal.aborted) throw abortError();
  // Picture-in-picture stays above the base footage and below titles/captions.
  prepared.sort(
    (a, b) =>
      layerOrder(a.clip) - layerOrder(b.clip) || a.clip.start - b.clip.start,
  );
}

function releaseClips(prepared: PreparedClip[]) {
  for (const item of prepared) {
    item.gain?.disconnect();
    if (item.media) {
      item.media.pause();
      item.media.removeAttribute("src");
      item.media.load();
    }
    if (item.image) item.image.removeAttribute("src");
  }
}

function drawClip(
  ctx: CanvasRenderingContext2D,
  prepared: PreparedClip,
  time: number,
  width: number,
  height: number,
) {
  const { image, media } = prepared;
  const clip = evaluateClip(prepared.clip, time);
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
  ctx.scale(
    (clip.scale / 100) * (clip.flipX ? -1 : 1),
    (clip.scale / 100) * (clip.flipY ? -1 : 1),
  );

  if (clip.type === "text" || clip.type === "sticker") {
    const size = (clip.fontSize * width) / 960;
    ctx.font = `${clip.bold ? "700" : "400"} ${size}px "${clip.fontFamily || "Inter"}", Arial, sans-serif`;
    ctx.letterSpacing = `${size * -0.038}px`;
    ctx.textAlign = clip.textAlign || "center";
    ctx.textBaseline = "middle";
    const lines = (clip.text || clip.name).split("\n");
    const lineHeight = size * (clip.lineSpacing || 1.09);
    const textWidth = Math.max(
      ...lines.map((line) => ctx.measureText(line).width),
    );
    if (clip.textBackground && clip.textBackground !== "transparent") {
      const paddingX = (13 * width) / 960;
      const paddingY = (8 * width) / 960;
      ctx.fillStyle = clip.textBackground;
      ctx.fillRect(
        -textWidth / 2 - paddingX,
        -(lines.length * lineHeight) / 2 - paddingY,
        textWidth + 2 * paddingX,
        lines.length * lineHeight + 2 * paddingY,
      );
    }
    ctx.fillStyle = clip.color || "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = (8 * width) / 960;
    ctx.shadowOffsetY = (2 * width) / 960;
    const textX =
      clip.textAlign === "left"
        ? -textWidth / 2
        : clip.textAlign === "right"
          ? textWidth / 2
          : 0;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = ((clip.textStroke || 0) * width) / 960;
    ctx.lineJoin = "round";
    lines.forEach((line, index) => {
      const textY = (index - (lines.length - 1) / 2) * lineHeight;
      if (clip.textStroke && clip.textStroke > 0)
        ctx.strokeText(line, textX, textY);
      ctx.fillText(line, textX, textY);
    });
  } else {
    const video = media instanceof HTMLVideoElement ? media : undefined;
    const drawable = image || video;
    const sourceWidth = image?.naturalWidth || video?.videoWidth || 0;
    const sourceHeight = image?.naturalHeight || video?.videoHeight || 0;
    if (drawable && sourceWidth && sourceHeight) {
      const crop = clip.crop;
      const left = (clamp(crop?.left || 0, 0, 100) * width) / 100;
      const right = (clamp(crop?.right || 0, 0, 100) * width) / 100;
      const top = (clamp(crop?.top || 0, 0, 100) * height) / 100;
      const bottom = (clamp(crop?.bottom || 0, 0, 100) * height) / 100;
      ctx.beginPath();
      ctx.rect(
        -width / 2 + left,
        -height / 2 + top,
        Math.max(0, width - left - right),
        Math.max(0, height - top - bottom),
      );
      ctx.clip();
      const scale = (clip.fit === "contain" ? Math.min : Math.max)(
        width / sourceWidth,
        height / sourceHeight,
      );
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

function renderComposition(
  ctx: CanvasRenderingContext2D,
  prepared: PreparedClip[],
  background: string,
  time: number,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  prepared.forEach((item) => drawClip(ctx, item, time, width, height));
}

/** Export the rendered playhead as a full-resolution PNG, including titles and overlays. */
export async function exportFrame(
  project: Project,
  time: number,
  options: FrameExportOptions,
): Promise<Blob> {
  const { signal } = options;
  if (
    !Number.isFinite(options.width) ||
    !Number.isFinite(options.height) ||
    options.width < 1 ||
    options.height < 1 ||
    !Number.isFinite(time)
  ) {
    throw new Error("Choose a valid frame resolution and timeline position.");
  }
  if (signal?.aborted) throw abortError();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(options.width);
  canvas.height = Math.round(options.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the frame renderer.");
  const prepared: PreparedClip[] = [];
  const loadController = new AbortController();
  const abortLoading = () => loadController.abort();
  signal?.addEventListener("abort", abortLoading, { once: true });
  const clips = snapshotClips(project.clips).filter(
    (clip) =>
      clip.type !== "audio" &&
      time >= clip.start &&
      time < clip.start + clip.duration,
  );
  const background = project.background || "#000000";
  try {
    await prepareClips(clips, prepared, loadController.signal, { time });
    renderComposition(
      ctx,
      prepared,
      background,
      time,
      canvas.width,
      canvas.height,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("Could not encode the PNG frame.")),
        "image/png",
      ),
    );
    if (signal?.aborted) throw abortError();
    return blob;
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (error instanceof DOMException && error.name === "SecurityError") {
      throw new Error(
        "One of the media files does not allow frame export. Download it and import it from your computer.",
      );
    }
    throw error;
  } finally {
    loadController.abort();
    signal?.removeEventListener("abort", abortLoading);
    releaseClips(prepared);
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Records the actual timeline in real time using a natively supported container. */
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

  const format = getExportFormats().find(
    (candidate) => candidate.id === (options.format || "webm"),
  );
  if (!format) {
    throw new Error(
      `This browser cannot encode ${(options.format || "webm").toUpperCase()} video. Choose one of the available export formats.`,
    );
  }
  const mimeType = format.mimeType;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the video renderer.");

  // Snapshot the timeline so editing during an export cannot alter the recording.
  const clips = snapshotClips(project.clips);
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

    await prepareClips(clips, prepared, loadController.signal, {
      audioContext,
      destination,
    });
    const render = (time: number) =>
      renderComposition(
        ctx,
        prepared,
        background,
        time,
        canvas.width,
        canvas.height,
      );
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
    const finalizedBlob =
      format.id === "webm"
        ? await fixWebmDuration(recordedBlob, duration * 1000, {
            logger: false,
          })
        : recordedBlob;
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
    releaseClips(prepared);
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
