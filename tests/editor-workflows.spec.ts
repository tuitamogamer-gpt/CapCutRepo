import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Project } from "../src/types";

async function readSavedProject(page: Page): Promise<Project> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("capcut-studio", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("projects");
          const saved = transaction.objectStore("projects").get("current");
          saved.onsuccess = () => resolve(saved.result);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
}

async function waitForSave(page: Page) {
  await expect(
    page.getByText("All changes saved locally", { exact: true }),
  ).toBeVisible();
}

test("phone preview keeps its aspect ratio and panels can be dismissed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await waitForSave(page);
  const stage = page.locator(".preview-stage");
  const wide = await stage.boundingBox();
  expect(wide!.width).toBeGreaterThan(300);
  expect(wide!.width / wide!.height).toBeCloseTo(16 / 9, 1);
  await page.getByLabel("Canvas aspect ratio").selectOption("9:16");
  await expect
    .poll(async () => {
      const rect = await stage.boundingBox();
      return Math.abs(rect!.width / rect!.height - 9 / 16);
    })
    .toBeLessThan(0.01);
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await expect(page.getByLabel("Media library", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Close media panel", exact: true })
    .click();
  await expect(page.getByLabel("Media library", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Clip properties", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Close properties panel" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close properties panel" }).click();
  await expect(page.locator(".inspector")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Play (Space)", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause (Space)", exact: true }),
  ).toBeVisible();
});

test("timeline gap cleanup and ripple delete are undoable and track-specific", async ({
  page,
}) => {
  await page.goto("/");
  await waitForSave(page);
  const original = await readSavedProject(page);
  const visual = original.clips.filter((clip) => clip.track === 0).slice(0, 3);
  const others = original.clips.filter((clip) => clip.track !== 0);
  const project = {
    ...original,
    clips: [
      ...visual.map((clip, index) => ({
        ...clip,
        start: [2, 9, 16][index],
        duration: 4,
      })),
      ...others,
    ],
  };
  await page.evaluate(
    (project) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("capcut-studio", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("projects", "readwrite");
          tx.objectStore("projects").put(project, "current");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    project,
  );
  await page.reload();
  await waitForSave(page);
  await page
    .getByRole("button", { name: "Close gaps on selected track" })
    .click();
  await waitForSave(page);
  const packed = await readSavedProject(page);
  expect(
    packed.clips.filter((clip) => clip.track === 0).map((clip) => clip.start),
  ).toEqual([0, 4, 8]);
  expect(packed.clips.filter((clip) => clip.track !== 0)).toEqual(others);
  await page
    .getByRole("button", { name: "Ripple delete selected clip" })
    .click();
  await waitForSave(page);
  const deleted = await readSavedProject(page);
  expect(
    deleted.clips.filter((clip) => clip.track === 0).map((clip) => clip.start),
  ).toEqual([0, 4]);
  expect(deleted.clips.filter((clip) => clip.track !== 0)).toEqual(others);
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await waitForSave(page);
  expect((await readSavedProject(page)).clips).toEqual(packed.clips);
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await waitForSave(page);
  expect((await readSavedProject(page)).clips).toEqual(project.clips);
});

test("batch import keeps valid files, reports failures, and supports type filtering", async ({
  page,
}) => {
  await page.goto("/");
  await waitForSave(page);
  const photo = await readFile("public/assets/island-escape.jpg");
  const audio = await readFile("public/assets/tropical-daydream.wav");
  await page.locator(".library-file-input").setInputFiles([
    { name: "My photo.jpg", mimeType: "image/jpeg", buffer: photo },
    {
      name: "Broken photo.png",
      mimeType: "image/png",
      buffer: Buffer.from("broken"),
    },
    { name: "My audio.wav", mimeType: "audio/wav", buffer: audio },
    {
      name: "Notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not media"),
    },
  ]);
  await expect(
    page.getByRole("status").filter({ hasText: "2 files imported; 2 skipped" }),
  ).toBeVisible();
  await waitForSave(page);
  const project = await readSavedProject(page);
  expect(
    project.assets.some(
      (asset) =>
        asset.name === "My photo.jpg" && asset.src.startsWith("data:image/"),
    ),
  ).toBe(true);
  expect(
    project.assets.some(
      (asset) => asset.name === "My audio.wav" && asset.duration > 15,
    ),
  ).toBe(true);
  expect(
    project.assets.some((asset) => asset.name === "Broken photo.png"),
  ).toBe(false);
  await page.getByRole("button", { name: "Videos", exact: true }).click();
  await expect(
    page.getByTitle("Add My photo.jpg to timeline", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  await expect(
    page.getByTitle("Add My photo.jpg to timeline", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Sort media").selectOption("newest");
  await expect(page.locator(".media-card-name").first()).toHaveText(
    "My photo.jpg",
  );
});

test("failed autosave offers a complete backup instead of showing saving forever", async ({
  page,
}) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Storage is full", "QuotaExceededError");
    };
  });
  await page.goto("/");
  const backup = page.getByRole("button", {
    name: /Save failed · Download backup/,
  });
  await expect(backup).toBeVisible();
  await page.getByLabel("Project name").fill("Recovery project");
  await expect(backup).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await backup.click();
  const download = await downloadPromise;
  const recovered = JSON.parse(
    await readFile((await download.path())!, "utf8"),
  ) as Project;
  expect(recovered.name).toBe("Recovery project");
  expect(recovered.clips.length).toBeGreaterThan(0);
  expect(recovered.assets.length).toBeGreaterThan(0);
});

test("an active import stays with its project when a new project is requested", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob) {
      setTimeout(() => read.call(this, blob), 1500);
    };
  });
  await page.goto("/");
  await waitForSave(page);
  const before = await readSavedProject(page);
  await page.locator(".library-file-input").setInputFiles({
    name: "Stay with this project.jpg",
    mimeType: "image/jpeg",
    buffer: await readFile("public/assets/island-escape.jpg"),
  });
  await expect(page.getByLabel("Media import progress")).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Wait for the media import to finish" }),
  ).toBeVisible();
  await expect(page.getByLabel("Media import progress")).toHaveCount(0);
  await waitForSave(page);
  const after = await readSavedProject(page);
  expect(after.id).toBe(before.id);
  expect(
    after.assets.some((asset) => asset.name === "Stay with this project.jpg"),
  ).toBe(true);
});

test("dialog keyboard focus stays inside and Escape works from an input", async ({
  page,
}) => {
  await page.goto("/");
  const projects = page.getByRole("button", {
    name: "Open projects",
    exact: true,
  });
  await projects.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.getByLabel("Close dialog").focus();
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true);
  const input = dialog
    .locator('input[type="search"], input[type="text"], input:not([type])')
    .first();
  await input.focus();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
