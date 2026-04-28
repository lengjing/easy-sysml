/**
 * Hook: useProjectManager
 *
 * Manages the project list and active project.
 * Projects are stored in IndexedDB (separate from each project's file workspace).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  loadProjectList,
  createNewProject,
  deleteProject,
  getActiveProjectId,
  setActiveProjectId,
  type ProjectMeta,
} from '../lib/virtual-fs';

export interface UseProjectManagerReturn {
  /** All available projects. */
  projects: ProjectMeta[];
  /** The currently active project (or undefined if not yet loaded). */
  activeProject: ProjectMeta | undefined;
  /** The active project id (or null while loading). */
  activeProjectId: string | null;
  /** Whether the project list has been loaded. */
  ready: boolean;
  /** Create a new project and switch to it. */
  createProject: (name: string) => Promise<ProjectMeta>;
  /** Switch to a different project by id. */
  switchProject: (projectId: string) => Promise<void>;
  /** Delete a project (cannot delete the last one). */
  removeProject: (projectId: string) => Promise<void>;
}

export function useProjectManager(): UseProjectManagerReturn {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  /* -- Bootstrap -- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const list = await loadProjectList();
      if (!mounted) return;
      setProjects(list);

      let activeId = await getActiveProjectId();
      if (!activeId || !list.some(p => p.id === activeId)) {
        activeId = list[0]?.id;
        if (activeId) await setActiveProjectId(activeId);
      }
      if (!mounted) return;
      setActiveProjectIdState(activeId ?? null);
      setReady(true);
    })();
    return () => { mounted = false; };
  }, []);

  const createProject = useCallback(async (name: string): Promise<ProjectMeta> => {
    const project = await createNewProject(name);
    setProjects(prev => [...prev, project]);
    // Switch to the new project
    setActiveProjectIdState(project.id);
    await setActiveProjectId(project.id);
    return project;
  }, []);

  const switchProject = useCallback(async (projectId: string): Promise<void> => {
    setActiveProjectIdState(projectId);
    await setActiveProjectId(projectId);
  }, []);

  const removeProject = useCallback(async (projectId: string): Promise<void> => {
    const updatedList = await deleteProject(projectId);
    setProjects(updatedList);
    // If we deleted the active project, switch to the first available
    setActiveProjectIdState(prev => {
      if (prev === projectId) {
        const next = updatedList[0]?.id ?? null;
        if (next) setActiveProjectId(next);
        return next;
      }
      return prev;
    });
  }, []);

  const activeProject = projects.find(p => p.id === activeProjectId);

  return {
    projects,
    activeProject,
    activeProjectId,
    ready,
    createProject,
    switchProject,
    removeProject,
  };
}
