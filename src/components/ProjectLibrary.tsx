import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Film,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Project } from "../types";
import { projectDuration } from "../types";
import {
  deleteProject,
  listProjects,
  renameSavedProject,
  saveCurrentProject,
  saveProjectCopy,
} from "../projectStorage";
import type { SavedProject } from "../projectStorage";
import "./ProjectLibrary.css";

interface ProjectLibraryProps {
  currentProject: Project;
  onOpen: (project: Project) => void;
  onNew: () => void;
  onImport: () => void;
  onClose: () => void;
  onNotify: (message: string) => void;
}

function durationLabel(project: Project) {
  const duration = project.clips.length
    ? Math.round(projectDuration(project.clips))
    : 0;
  return `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`;
}

export default function ProjectLibrary({
  currentProject,
  onOpen,
  onNew,
  onImport,
  onClose,
  onNotify,
}: ProjectLibraryProps) {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await saveCurrentProject(currentProject);
        const saved = await listProjects();
        if (active) setProjects(saved);
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load your saved projects.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentProject]);

  async function perform(action: () => Promise<void>) {
    if (busy || loading) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That change could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const refresh = async () => setProjects(await listProjects());
  function leave(action: () => void) {
    void perform(async () => {
      await saveCurrentProject(currentProject);
      onClose();
      action();
    });
  }

  const filtered = projects.filter(({ project }) =>
    project.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <section
      className="project-library"
      aria-labelledby="project-library-title"
    >
      <div className="modal-icon">
        <FolderOpen size={23} />
      </div>
      <h2 id="project-library-title">Your projects</h2>
      <p className="modal-description">
        Pick up where you left off. Each project keeps its own media, timeline,
        and edits.
      </p>
      <div className="project-library-toolbar">
        <button
          className="primary-button"
          disabled={busy || loading}
          onClick={() => leave(onNew)}
        >
          <Plus size={15} /> New project
        </button>
        <button
          className="secondary-button"
          disabled={busy || loading}
          onClick={() => leave(onImport)}
        >
          <Upload size={14} /> Import project
        </button>
        <label className="project-library-search">
          <Search size={15} />
          <input
            aria-label="Search projects"
            placeholder="Search projects"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="project-library-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <div className="project-library-empty">
          <LoaderCircle className="spin" size={24} />
          <span>Loading your projects…</span>
        </div>
      ) : (
        <div className="project-library-grid" aria-busy={busy}>
          {filtered.map((saved) => {
            const isCurrent = saved.id === currentProject.id;
            return (
              <article
                className={`saved-project ${isCurrent ? "saved-project-current" : ""}`}
                key={saved.id}
              >
                <button
                  className="saved-project-preview"
                  disabled={busy}
                  aria-label={`Open ${saved.project.name}`}
                  onClick={() => leave(() => onOpen(saved.project))}
                >
                  {saved.thumbnail ? (
                    <img src={saved.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <Film size={34} />
                  )}
                  {isCurrent && (
                    <span className="saved-project-badge">
                      <Check size={11} /> Open now
                    </span>
                  )}
                  <span className="saved-project-duration">
                    {durationLabel(saved.project)}
                  </span>
                </button>
                <div className="saved-project-details">
                  {renameId === saved.id ? (
                    <form
                      className="saved-project-rename"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void perform(async () => {
                          await renameSavedProject(saved.id, renameValue);
                          setRenameId(null);
                          await refresh();
                          onNotify("Project renamed");
                        });
                      }}
                    >
                      <input
                        autoFocus
                        aria-label="Project name"
                        maxLength={120}
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.stopPropagation();
                            setRenameId(null);
                          }
                        }}
                      />
                      <button
                        type="submit"
                        className="icon-button"
                        aria-label="Save project name"
                        disabled={busy || !renameValue.trim()}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Cancel rename"
                        disabled={busy}
                        onClick={() => setRenameId(null)}
                      >
                        <X size={14} />
                      </button>
                    </form>
                  ) : (
                    <button
                      className="saved-project-title"
                      title={saved.project.name}
                      disabled={busy}
                      onClick={() => leave(() => onOpen(saved.project))}
                    >
                      {saved.project.name}
                    </button>
                  )}
                  <p>
                    {saved.project.clips.length}{" "}
                    {saved.project.clips.length === 1 ? "clip" : "clips"}
                    <span>·</span>
                    {saved.project.aspectRatio}
                    <span>·</span>
                    {new Date(saved.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  {deleteId === saved.id ? (
                    <div className="saved-project-confirm">
                      <span>Delete this saved project?</span>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            await deleteProject(saved.id);
                            setDeleteId(null);
                            await refresh();
                            onNotify("Project deleted from this device");
                          })
                        }
                      >
                        Delete
                      </button>
                      <button disabled={busy} onClick={() => setDeleteId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="saved-project-actions">
                      <button
                        disabled={busy}
                        title="Create a separate copy"
                        onClick={() =>
                          void perform(async () => {
                            const copy = await saveProjectCopy(saved.project);
                            await refresh();
                            onNotify(`Created “${copy.name}”`);
                          })
                        }
                      >
                        <Copy size={13} /> Duplicate
                      </button>
                      <button
                        disabled={busy || isCurrent}
                        title={
                          isCurrent
                            ? "Rename the open project in the editor title"
                            : "Rename project"
                        }
                        aria-label={`Rename ${saved.project.name}`}
                        onClick={() => {
                          setRenameId(saved.id);
                          setRenameValue(saved.project.name);
                          setDeleteId(null);
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        disabled={busy || isCurrent}
                        title={
                          isCurrent
                            ? "Open another project before deleting this one"
                            : "Delete project"
                        }
                        aria-label={`Delete ${saved.project.name}`}
                        onClick={() => {
                          setDeleteId(saved.id);
                          setRenameId(null);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!loading && !filtered.length && (
        <div className="project-library-empty">
          <FolderOpen size={25} />
          <span>
            {query
              ? "No projects match your search."
              : "Create a project to get started."}
          </span>
        </div>
      )}
      <p className="project-library-local">
        <HardDrive size={13} />
        <span>
          Saved in this browser on this device. Export a project file to back it
          up or move it elsewhere.
        </span>
      </p>
    </section>
  );
}
