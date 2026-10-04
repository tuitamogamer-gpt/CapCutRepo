import { uid, type Asset } from "./types";

export interface MediaImportProgress {
  total: number;
  processed: number;
  imported: number;
  failed: number;
  fileName: string;
}

export interface MediaImportFailure {
  name: string;
  reason: string;
}

export interface MediaImportResult {
  assets: Asset[];
  failures: MediaImportFailure[];
}

const EXTENSIONS: Record<string, Asset["type"]> = {
  mp4: "video",
  m4v: "video",
  mov: "video",
  webm: "video",
  ogv: "video",
  avi: "video",
  mkv: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  aac: "audio",
  flac: "audio",
  oga: "audio",
  ogg: "audio",
  opus: "audio",
  aiff: "audio",
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  svg: "image",
  heic: "image",
  heif: "image",
};

function mediaType(file: File): Asset["type"] | undefined {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  // Some browsers and file pickers omit MIME types for otherwise valid media.
  if (!file.type || file.type === "application/octet-stream") {
    return EXTENSIONS[file.name.split(".").pop()?.toLowerCase() || ""];
  }
  return undefined;
}

function readDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const timer = setTimeout(() => {
      reader.abort();
      reject(new Error("Reading this file took too long. Try a smaller file."));
    }, 60_000);
    reader.onload = () => {
      clearTimeout(timer);
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("This file could not be read."));
    };
    reader.onerror = () => {
      clearTimeout(timer);
      reject(new Error("This file could not be read."));
    };
    reader.onabort = () => {
      clearTimeout(timer);
      reject(new Error("Reading this file was interrupted."));
    };
    reader.readAsDataURL(file);
  });
}

function thumbnail(source: CanvasImageSource, width: number, height: number) {
  if (!width || !height) return "";
  const canvas = document.createElement("canvas");
  const ratio = Math.min(1, 320 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function inspectImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const clean = () => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      image.src = "";
    };
    const timer = setTimeout(() => {
      clean();
      reject(new Error("This image took too long to open."));
    }, 20_000);
    image.onload = () => {
      try {
        if (!image.naturalWidth || !image.naturalHeight) {
          throw new Error("This image has no readable pixels.");
        }
        resolve(thumbnail(image, image.naturalWidth, image.naturalHeight));
      } catch {
        reject(
          new Error("This image could not be decoded. Try PNG, JPEG, or WebP."),
        );
      } finally {
        clean();
      }
    };
    image.onerror = () => {
      clean();
      reject(
        new Error("This image could not be decoded. Try PNG, JPEG, or WebP."),
      );
    };
    image.src = url;
  });
}

function waitForMedia(
  media: HTMLMediaElement,
  events: string[],
  ready: () => boolean,
  start: () => void,
  timeout = 20_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const clean = () => {
      clearTimeout(timer);
      for (const event of events) media.removeEventListener(event, check);
      media.removeEventListener("error", fail);
    };
    const check = () => {
      if (ready()) {
        clean();
        resolve();
      }
    };
    const fail = () => {
      clean();
      reject(
        new Error(
          "This browser cannot play this file. Try MP4, WebM, MP3, or WAV.",
        ),
      );
    };
    const timer = setTimeout(() => {
      clean();
      reject(
        new Error(
          "This file took too long to open. It may be damaged or unsupported.",
        ),
      );
    }, timeout);
    for (const event of events) media.addEventListener(event, check);
    media.addEventListener("error", fail);
    try {
      start();
      check();
    } catch (error) {
      clean();
      reject(error);
    }
  });
}

async function inspectMedia(type: "video" | "audio", url: string) {
  const media = document.createElement(type);
  media.preload = "auto";
  media.muted = true;
  try {
    await waitForMedia(
      media,
      ["loadedmetadata"],
      () => media.readyState >= 1,
      () => {
        media.src = url;
        media.load();
      },
    );
    if (!Number.isFinite(media.duration)) {
      // MediaRecorder WebM files may omit duration until the browser seeks to the end.
      await waitForMedia(
        media,
        ["durationchange", "seeked", "timeupdate"],
        () => Number.isFinite(media.duration) && media.duration > 0,
        () => {
          media.currentTime = 1e10;
        },
      );
    }
    if (!Number.isFinite(media.duration) || media.duration <= 0) {
      throw new Error("This file has no playable duration.");
    }
    const duration = media.duration;
    let preview = "";
    if (type === "video") {
      const video = media as HTMLVideoElement;
      // A missing thumbnail should never discard a playable video.
      try {
        await waitForMedia(
          video,
          ["loadeddata", "seeked", "canplay"],
          () => video.readyState >= 2 && !video.seeking,
          () => {
            video.currentTime = Math.min(0.1, duration / 2);
          },
          5000,
        );
        preview = thumbnail(video, video.videoWidth, video.videoHeight);
      } catch {
        preview = "";
      }
    }
    return { duration, thumbnail: preview };
  } finally {
    media.pause();
    media.removeAttribute("src");
    media.load();
  }
}

export async function importMediaFiles(
  files: FileList | File[],
  onProgress?: (progress: MediaImportProgress) => void,
): Promise<MediaImportResult> {
  const queue = Array.from(files);
  const result: MediaImportResult = { assets: [], failures: [] };
  const report = (processed: number, fileName: string) =>
    onProgress?.({
      total: queue.length,
      processed,
      imported: result.assets.length,
      failed: result.failures.length,
      fileName,
    });
  for (const [index, file] of queue.entries()) {
    report(index, file.name);
    let url: string | undefined;
    try {
      const type = mediaType(file);
      if (!type)
        throw new Error(
          "Unsupported file type. Choose a video, image, or audio file.",
        );
      if (file.size === 0) throw new Error("This file is empty.");
      url = URL.createObjectURL(file);
      const metadata =
        type === "image"
          ? { duration: 5, thumbnail: await inspectImage(url) }
          : await inspectMedia(type, url);
      const src = await readDataURL(file);
      result.assets.push({
        id: uid(),
        name: file.name,
        type,
        src,
        ...metadata,
      });
    } catch (error) {
      result.failures.push({
        name: file.name,
        reason:
          error instanceof Error
            ? error.message
            : "This file could not be imported.",
      });
    } finally {
      if (url) URL.revokeObjectURL(url);
      report(index + 1, file.name);
    }
  }
  return result;
}
