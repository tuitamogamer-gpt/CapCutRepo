import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { closeTrackGaps, rippleDeleteClip } from "../src/timelineEditing";
import { DEFAULT_CLIP } from "../src/types";
import type { Clip } from "../src/types";

const clip = (
  id: string,
  start: number,
  duration: number,
  track = 0,
): Clip => ({
  ...DEFAULT_CLIP,
  id,
  start,
  duration,
  track,
  name: id,
  src: "/fixture.mp4",
  type: "video",
  sourceOffset: 2.5,
  speed: 1.5,
  keyframes: [
    { time: 0, scale: 100, x: 0, y: 0, rotation: 0, opacity: 100 },
    { time: duration, scale: 130, x: 10, y: 5, rotation: 90, opacity: 80 },
  ],
});

test("ripple delete closes exactly the deleted duration, on its track only", () => {
  const before = clip("before", 0, 3);
  const deleted = clip("deleted", 3, 4);
  const later = clip("later", 9, 2);
  const audio = clip("audio", 9, 6, 2);
  const input = [before, deleted, later, audio];
  const result = rippleDeleteClip(input, deleted.id);
  assert.equal(result.removedTime, 4);
  assert.deepEqual(
    result.clips.map(({ id, start }) => [id, start]),
    [
      ["before", 0],
      ["later", 5],
      ["audio", 9],
    ],
  );
  assert.strictEqual(result.clips[0], before);
  assert.strictEqual(result.clips[2], audio);
  assert.equal(result.clips[1].sourceOffset, later.sourceOffset);
  assert.equal(result.clips[1].duration, later.duration);
  assert.strictEqual(result.clips[1].keyframes, later.keyframes);
  assert.equal(input.length, 4);
  assert.equal(later.start, 9);
});

test("ripple delete preserves time occupied by overlapping clips", () => {
  const result = rippleDeleteClip(
    [
      clip("deleted", 3, 8),
      clip("left", 0, 5),
      clip("middle", 6, 2),
      clip("right", 10, 3),
      clip("tail", 15, 1),
    ],
    "deleted",
  );
  assert.equal(result.removedTime, 3);
  assert.deepEqual(
    result.clips.map(({ id, start }) => [id, start]),
    [
      ["left", 0],
      ["middle", 5],
      ["right", 7],
      ["tail", 12],
    ],
  );
});

test("deleting a fully overlapped clip removes no time", () => {
  const covering = clip("covering", 0, 20);
  const tail = clip("tail", 24, 4);
  const result = rippleDeleteClip(
    [clip("deleted", 5, 3), covering, tail],
    "deleted",
  );
  assert.equal(result.removedTime, 0);
  assert.deepEqual(result.clips, [covering, tail]);
  assert.strictEqual(result.clips[1], tail);
});

test("ripple delete of first or last clip works, and missing selection is a no-op", () => {
  const input = [clip("first", 0, 2), clip("last", 2, 3)];
  assert.equal(rippleDeleteClip(input, "first").clips[0].start, 0);
  assert.deepEqual(rippleDeleteClip(input, "last").clips, [input[0]]);
  assert.strictEqual(rippleDeleteClip(input, "missing").clips, input);
});

test("close gaps removes leading and internal gaps while preserving overlap groups", () => {
  const input = [
    clip("tail", 15, 2),
    clip("first", 3, 4),
    clip("overlap", 5, 5),
    clip("audio", 18, 3, 2),
    clip("nested", 6, 1),
  ];
  const result = closeTrackGaps(input, 0);
  assert.equal(result.removedTime, 8);
  assert.deepEqual(
    result.clips.map(({ id, start }) => [id, start]),
    [
      ["tail", 7],
      ["first", 0],
      ["overlap", 2],
      ["audio", 18],
      ["nested", 3],
    ],
  );
  for (let index = 0; index < input.length; index++) {
    assert.equal(result.clips[index].duration, input[index].duration);
    assert.equal(result.clips[index].sourceOffset, input[index].sourceOffset);
    assert.strictEqual(result.clips[index].keyframes, input[index].keyframes);
  }
  assert.strictEqual(result.clips[3], input[3]);
});

test("packed or empty tracks do not create an undo entry", () => {
  const input = [clip("first", 0, 4), clip("next", 4, 3)];
  assert.strictEqual(closeTrackGaps(input, 0).clips, input);
  assert.strictEqual(closeTrackGaps(input, 2).clips, input);
  assert.strictEqual(
    closeTrackGaps(closeTrackGaps(input, 0).clips, 0).clips,
    input,
  );
});

test("subframe decimal gaps close without accumulating micro-gaps", () => {
  const input = [
    clip("first", 0, 0.1 + 0.2),
    clip("second", 0.3, 0.7),
    clip("last", 1.1, 2),
  ];
  const result = closeTrackGaps(input, 0);
  assert.ok(Math.abs(result.removedTime - 0.1) < 1e-10);
  assert.equal(result.clips[2].start, 1);
  assert.strictEqual(closeTrackGaps(result.clips, 0).clips, result.clips);
});
