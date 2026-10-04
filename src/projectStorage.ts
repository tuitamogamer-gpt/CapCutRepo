import type { Project } from "./types";
import { uid } from "./types";

export interface SavedProject {
  id: string;
  project: Project;
  updatedAt: number;
  thumbnail: string;
}

// Keep the original database and current-project key so existing edits survive.
const DATABASE_NAME = "capcut-studio";
const STORE_NAME = "projects";
const projectKey = (id: string) => `project:${id}`;
let pending: Promise<unknown> = Promise.resolve();

function inOrder<T>(operation: () => Promise<T>): Promise<T> {
  const next = pending.then(operation, operation);
  pending = next.catch(() => undefined);
  return next;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Close other editor tabs and try again."));
  });
}

function identify(project: Project): Project & { id: string } {
  return { ...project, id: project.id || uid() };
}

function savedRecord(project: Project & { id: string }): SavedProject {
  const firstVisual = [...project.clips]
    .filter((clip) => clip.type === "video" || clip.type === "image")
    .sort((a, b) => a.start - b.start)[0];
  const asset = project.assets.find((item) => item.id === firstVisual?.assetId);
  const thumbnail =
    firstVisual?.thumbnail ||
    asset?.thumbnail ||
    (firstVisual?.type === "image" ? firstVisual.src : "") ||
    project.assets.find((item) => item.type !== "audio" && item.thumbnail)
      ?.thumbnail ||
    "";
  return { id: project.id, project, updatedAt: Date.now(), thumbnail };
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (
    store: IDBObjectStore,
    done: (result: T) => void,
    fail: (error: Error) => void,
  ) => void,
): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, mode);
    let result: T;
    let failure: Error | null = null;
    tx.oncomplete = () => {
      database.close();
      resolve(result);
    };
    tx.onabort = () => {
      database.close();
      reject(
        failure ||
          tx.error ||
          new Error("Project storage could not be updated."),
      );
    };
    tx.onerror = () => {
      failure ||= tx.error;
    };
    try {
      run(
        tx.objectStore(STORE_NAME),
        (value) => {
          result = value;
        },
        (error) => {
          failure = error;
          tx.abort();
        },
      );
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      tx.abort();
    }
  });
}

export function loadCurrentProject(): Promise<Project | null> {
  return inOrder(() =>
    transaction("readwrite", (store, done) => {
      const request = store.get("current");
      request.onsuccess = () => {
        if (!request.result) {
          done(null);
          return;
        }
        const current = identify(request.result as Project);
        const saved = store.get(projectKey(current.id));
        saved.onsuccess = () => {
          if (!saved.result || !request.result.id) {
            store.put(savedRecord(current), projectKey(current.id));
            store.put(current, "current");
          }
          done(current);
        };
      };
    }),
  );
}

export function saveCurrentProject(project: Project): Promise<void> {
  // Capture the state when called, before waiting for an earlier save to finish.
  const current = identify(project);
  return inOrder(() =>
    transaction("readwrite", (store, done) => {
      store.put(current, "current");
      store.put(savedRecord(current), projectKey(current.id));
      done(undefined);
    }),
  );
}

export function listProjects(): Promise<SavedProject[]> {
  return inOrder(() =>
    transaction("readonly", (store, done) => {
      const request = store.getAll(
        IDBKeyRange.bound("project:", "project:\uffff"),
      );
      request.onsuccess = () => {
        const projects = (request.result as SavedProject[])
          .filter(
            (item) =>
              item?.id && item.project && Array.isArray(item.project.clips),
          )
          .sort((a, b) => b.updatedAt - a.updatedAt);
        done(projects);
      };
    }),
  );
}

export function saveProjectCopy(
  project: Project,
  name?: string,
): Promise<Project> {
  const copy = {
    ...project,
    id: uid(),
    name: name?.trim() || `${project.name} copy`,
  };
  return inOrder(() =>
    transaction("readwrite", (store, done) => {
      store.put(savedRecord(copy), projectKey(copy.id));
      done(copy);
    }),
  );
}

export function renameSavedProject(id: string, name: string): Promise<Project> {
  const trimmed = name.trim();
  if (!trimmed) return Promise.reject(new Error("Give your project a name."));
  return inOrder(() =>
    transaction("readwrite", (store, done, fail) => {
      const current = store.get("current");
      current.onsuccess = () => {
        if (current.result?.id === id) {
          fail(
            new Error("Rename the open project using its title in the editor."),
          );
          return;
        }
        const request = store.get(projectKey(id));
        request.onsuccess = () => {
          const saved = request.result as SavedProject | undefined;
          if (!saved) {
            fail(new Error("This project is no longer available."));
            return;
          }
          const renamed = { ...saved.project, id, name: trimmed };
          store.put(
            { ...saved, project: renamed, updatedAt: Date.now() },
            projectKey(id),
          );
          done(renamed);
        };
      };
    }),
  );
}

export function deleteProject(id: string): Promise<void> {
  return inOrder(() =>
    transaction("readwrite", (store, done, fail) => {
      const request = store.get("current");
      request.onsuccess = () => {
        if (request.result?.id === id) {
          fail(new Error("Open another project before deleting this one."));
          return;
        }
        store.delete(projectKey(id));
        done(undefined);
      };
    }),
  );
}
