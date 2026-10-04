# CapCut Studio

A CapCut-inspired video editor built with React, TypeScript, and Vite. It runs entirely in the browser and opens with a 16-second travel project containing photos, a title, and original music. This is an independent implementation; it is not an official CapCut product.

## Run locally

Use Node.js 22.12+ or 20.19+.

```sh
npm install
npm run dev
```

Open the URL printed by Vite, `http://localhost:3000` by default. The development server listens on all interfaces for workspace previews.

```sh
npm run build
npm run preview
```

The build command checks TypeScript and creates a production bundle in `dist/`. Serve that directory with any static web server. No API keys, server application, or database service are required.

## Working features

- Import local images, video, and audio using the file picker or drag and drop. Imported videos receive generated thumbnails. Search and sort the media library, and click or drag assets onto the timeline.
- Edit three timeline lanes for visual media, text/stickers, and audio. Move and trim clips, scrub the playhead, split, duplicate, delete, snap to nearby boundaries, zoom, and undo/redo edits.
- Preview the timeline with audio, mute playback, jump between clips, and use fullscreen preview.
- Add editable titles and manual captions. Change text, font, size, bold weight, color, and position; drag text or stickers directly on the canvas.
- Add emoji stickers and preview the three included original audio tracks before using them.
- Adjust position, scale, rotation, opacity, brightness, contrast, saturation, playback speed, and volume. Apply color presets and clip fades.
- Switch between 16:9, 9:16, 1:1, 4:3, 4:5, and 21:9 canvases.
- Rename projects, automatically save the current project locally, download/open project JSON files, and export a playable WebM video with audio.

The Effects and Filters libraries offer color presets. Transitions currently apply fades at the selected clip's start and end.

## Projects and media

The current project is automatically saved to IndexedDB in the current browser after edits. Reopening the application at the same origin restores that project. This is a single local working project, not a cloud project library. Browser site-data deletion or a different browser/origin will not retain it.

Use **Menu → Download project** or **Ctrl/Cmd + S** to download a `.capcut.json` backup. Use **Menu → Open project file** to restore it. This JSON format belongs to this application and is not compatible with official CapCut project files.

Imported media are stored as data URLs inside the project, so backups include those imports. Bundled demo assets use local `/assets/` paths and remain available when the backup is opened in this application. Large imports increase memory use, project-file size, and browser-storage use; the UI reports a failed local save if browser storage fills up. Imported files are not uploaded to a server.

## Video export

Click **Export**, choose a resolution and frame rate, then click **Export video**. The browser renders the timeline to a canvas, mixes audio with the Web Audio API, and records a downloadable `.webm` file through MediaRecorder. Export includes clip transforms, color adjustments, text, stickers, fades, timing, speed, and audio volume.

Available settings are 720p, 1080p, or 1440p, at 24, 30, or 60 fps. The canvas aspect ratio determines the final dimensions. The exporter selects supported WebM codecs, preferring VP9/Opus and then VP8/Opus.

Export happens in real time: a 16-second project takes approximately 16 seconds plus setup. Keep the tab active until it finishes. Progress and cancellation are available. Actual frame delivery depends on device performance and browser scheduling; this is not an offline, frame-exact rendering engine. Use a recent Chrome, Edge, or Firefox with WebM recording support. Browsers without the necessary recording APIs display an error instead of a download.

## Keyboard shortcuts

| Action                          | Shortcut                   |
| ------------------------------- | -------------------------- |
| Play / pause                    | Space                      |
| Split selected clip at playhead | S                          |
| Delete selected clip            | Delete / Backspace         |
| Undo                            | Ctrl/Cmd + Z               |
| Redo                            | Ctrl/Cmd + Shift + Z       |
| Duplicate selected clip         | Ctrl/Cmd + D               |
| Download project                | Ctrl/Cmd + S               |
| Step playhead                   | Left / Right arrow         |
| Jump one second                 | Shift + Left / Right arrow |

## Current limits

This implementation does not provide full CapCut feature parity. There is no AI transcription, automatic caption generation, cloud sync, account system, collaboration, background removal, keyframe animation, motion tracking, or MP4/H.264 export. Captions are editable text entered manually. Fades are supported; a full transition compositing engine is not included. Media import/playback depends on codecs supported by the browser. The interface is designed primarily for desktop editing.

## Bundled asset credits

All demo photos are served locally from `public/assets`. The following Unsplash image URLs were downloaded at 1600-pixel width with `auto=format&fit=crop&w=1600&q=85`. The travel collection contains multiple coastal destinations; the sample project name is an editorial title.

| Local file           | Source                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `island-escape.jpg`  | [Unsplash photo 1518509562904-e7ef99cdcc86](https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?auto=format&fit=crop&w=1600&q=85) |
| `coast-aerial.jpg`   | [Unsplash photo 1507525428034-b723cf961d3e](https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=85) |
| `golden-hour.jpg`    | [Unsplash photo 1506953823976-52e1fdc0149a](https://images.unsplash.com/photo-1506953823976-52e1fdc0149a?auto=format&fit=crop&w=1600&q=85) |
| `bali-temple.jpg`    | [Unsplash photo 1537996194471-e657df975ab4](https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1600&q=85) |
| `ocean-waves.jpg`    | [Unsplash photo 1500375592092-40eb2168fd21](https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1600&q=85) |
| `tropical-beach.jpg` | [Unsplash photo 1519046904884-53103b34b206](https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1600&q=85) |

Photo use is subject to the [Unsplash license](https://unsplash.com/license).

`tropical-daydream.wav` (16 seconds), `sunlit-mornings.wav` (24 seconds), and `ocean-hush.wav` (16 seconds) are original procedural synth compositions and noise ambience generated specifically for this project. They contain no third-party recordings or samples. Files are mono, 16-bit PCM WAV at 22,050 Hz.

The locally bundled [Inter](https://rsms.me/inter/) variable font is by Rasmus Andersson. Its Latin WOFF2 file was downloaded from [Google Fonts](https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2); the SIL Open Font License is included at [`public/assets/inter-OFL.txt`](public/assets/inter-OFL.txt). Icons come from [Lucide](https://lucide.dev/) under the ISC license.
