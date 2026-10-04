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

- Import local images, video, and audio with the file picker or drag and drop. Generate video thumbnails, search and sort the media library, and add assets by clicking or dragging them onto the timeline.
- Edit visual media, text/stickers, audio, and picture-in-picture overlays on separate timeline lanes. Move and trim clips, scrub, split, duplicate, delete, snap to boundaries, fit or zoom the timeline, and undo/redo edits.
- Add named, colored timeline markers; click a marker to seek and double-click it to edit. Preview with audio, mute playback, jump between clips, loop the project, or use fullscreen preview.
- Change position, scale, rotation, opacity, brightness, contrast, saturation, playback speed, and volume. Flip horizontally or vertically, crop each edge, choose fill or fit, and apply color presets and clip/audio fades.
- Animate position, scale, rotation, and opacity with editable keyframes and linear interpolation. Add, update, remove, or seek to keyframes in **Inspector → Animation**, or choose zoom, pan, and rise presets. Trim and split operations preserve the sampled motion.
- Add editable titles, manual captions, and emoji stickers. Set font, size, weight, color, alignment, background, outline, and line spacing; drag text or stickers on the canvas.
- Import and export SRT or WebVTT subtitles in **Captions**. Edit individual text and cue timings, shift all captions, and apply shared caption styles. Captions also appear in the exported video.
- Record a voiceover or capture the screen with optional microphone audio, review it, and add it to the project. Pause/resume, a recording timer, and microphone level feedback are available.
- Detach a video's audio into an independently editable audio clip while muting the original video. Preview the three included original music tracks before adding them.
- Export the current rendered frame as a PNG or insert a three-second freeze frame at the playhead. The freeze frame includes visible overlays and titles, and moves later timeline content and markers forward.
- Choose 16:9, 9:16, 1:1, 4:3, 4:5, or 21:9 canvases and a canvas background color.
- Keep multiple locally saved projects, search/open/duplicate/rename/delete them, and download or open project backups. Export video with audio as WebM or native MP4 when supported by the browser.

The Effects and Filters libraries offer color presets. Transitions apply fades at the selected clip's start and end; a full transition compositing engine is not included.

## Projects and media

Edits automatically save to IndexedDB in the current browser. **Menu → My projects** opens the local project library, including each project's media, timeline, and edits. Creating a new project preserves the previous one in that library. Existing installations retain their previous current project: it is migrated into the project library without replacing its edits.

Saved projects belong to this browser and origin. Clearing site data or using another browser/origin does not retain them. Use **Menu → Download project** or **Ctrl/Cmd + S** for a `.capcut.json` backup, and **Menu → Open project file** to restore it. This JSON format belongs to this application and is not compatible with official CapCut project files.

Imported media and recordings are stored as data URLs inside the project, so backups include them. Bundled demo assets use local `/assets/` paths and remain available when the backup is opened in this application. Large imports increase memory use, project-file size, and browser-storage use; the UI reports a failed local save if browser storage fills up. Imported files, recordings, subtitles, and project edits stay local to the browser unless you download and share them yourself. They are not uploaded to a server; no cloud account, cloud sync, or AI transcription service is used.

## Voice and screen recording

Open **Menu → Record voice or screen**, or use the record control above the player. Recording needs browser permission and a secure context such as HTTPS or localhost. Voice mode requests microphone access. Screen mode opens the browser's screen/window/tab picker and can include the microphone; system or tab audio is recorded only if the browser and selected source supply it and you choose to share it.

Desktop Chrome or Edge generally provides the broadest screen-capture support. Availability, recording codecs, and screen-audio support depend on the browser and operating system. Denied permissions and unavailable APIs are reported in the recorder. Stop and review a recording before adding it; closing the recorder releases its active capture tracks.

## Video and frame export

Click **Export**, choose the available format, resolution, and frame rate, then click **Export video**. The browser renders the timeline to a canvas, mixes audio with the Web Audio API, and records a downloadable file through MediaRecorder. Export includes animation/keyframes, transforms, crop/fit/flips, color adjustments, text styling, captions, stickers, overlays, fades, timing, speed, and audio volume.

Available settings are 720p, 1080p, or 1440p, at 24, 30, or 60 fps. The canvas aspect ratio determines the final dimensions. Format choices are detected from the browser's recording capabilities. WebM prefers VP9/Opus and then VP8/Opus. MP4 is offered only when native MP4 recording is supported; the actual codec depends on the browser, so an `.mp4` file is not guaranteed to contain H.264. There is no server-side transcoding or bundled FFmpeg conversion.

Export happens in real time: a 16-second project takes approximately 16 seconds plus setup. Keep the tab active until it finishes. Progress and cancellation are available. Actual frame delivery depends on device performance and browser scheduling; this is not an offline, frame-exact rendering engine. Browsers without the required recording APIs display an error instead of a download. The player's camera button separately downloads the current composite as a PNG image.

## Keyboard shortcuts

| Action                          | Shortcut                   |
| ------------------------------- | -------------------------- |
| Play / pause                    | Space                      |
| Split selected clip at playhead | S                          |
| Add timeline marker             | M                          |
| Delete selected clip            | Delete / Backspace         |
| Undo                            | Ctrl/Cmd + Z               |
| Redo                            | Ctrl/Cmd + Shift + Z       |
| Duplicate selected clip         | Ctrl/Cmd + D               |
| Download project                | Ctrl/Cmd + S               |
| Step playhead                   | Left / Right arrow         |
| Jump one second                 | Shift + Left / Right arrow |

## Current limits

This implementation does not provide full CapCut feature parity. AI transcription, automatic speech recognition, cloud sync, accounts, collaboration, background removal, and motion tracking are not included. Captions are created manually or imported from SRT/WebVTT files. Keyframe motion uses linear interpolation. Media import, playback, recording, and export depend on browser codec/API support. The interface is designed primarily for desktop editing.

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
