import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { z } from 'zod';
import { useFlags } from '../../../app/store/hooks';
import { buildProjectPath } from '../../../utils/path';
import type { ProjectsActions } from '../../idp/context/ProjectContext.types';
import { useUser } from '../../idp/hooks/useAuthState';
import { useProjects } from '../../idp/hooks/useProjects';
import { signIn } from '../../idp/services';
import { CloudProjectCreationContext, useCloudProjectCreation } from './useCloudProjectCreation';
import {
  createCloudProject,
  getCloudProjectApiOrigin,
  isCurrentProjectSession,
  registerCloudProject,
} from './project-management.service';

const savedProjectSchema = z.object({
  id: z.string().min(1),
  registrationPending: z.boolean(),
});

type SavedProject = z.infer<typeof savedProjectSchema>;

function readSavedProject(key: string): SavedProject | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? savedProjectSchema.safeParse(JSON.parse(raw)).data : undefined;
  } catch {
    return undefined;
  }
}

function writeSavedProject(key: string, project?: SavedProject) {
  try {
    if (project) sessionStorage.setItem(key, JSON.stringify(project));
    else sessionStorage.removeItem(key);
  } catch {
    // Keep recovery in memory when session storage is unavailable.
  }
}

export function CloudProjectCreationProvider({ children }: { children: ReactNode }) {
  const { flags } = useFlags();
  const user = useUser();
  const origin = getCloudProjectApiOrigin(flags);
  const [saved, setSaved] = useState<{ key: string; project: SavedProject }>();
  const [creating, setCreating] = useState(false);
  const inFlight = useRef(false);
  const projectListLoader = useRef<ProjectsActions['loadProjects']>(undefined);
  const registerProjectListLoader = useCallback((loadProjects: ProjectsActions['loadProjects']) => {
    projectListLoader.current = loadProjects;
    return () => {
      if (projectListLoader.current === loadProjects) projectListLoader.current = undefined;
    };
  }, []);
  const session =
    user?.id && user.projectId && !user.viewOnly
      ? { userId: user.id, projectId: user.projectId }
      : null;
  const storageKey = origin && session ? `owox_project_creation:${origin}:${session.userId}` : null;
  const recovered = storageKey
    ? saved?.key === storageKey
      ? saved.project
      : readSavedProject(storageKey)
    : undefined;
  const openedCreatedProject = Boolean(
    recovered && !recovered.registrationPending && recovered.id === session?.projectId
  );
  const createdProject = openedCreatedProject ? undefined : recovered;

  useEffect(() => {
    if (!storageKey || !openedCreatedProject) return;
    writeSavedProject(storageKey);
    setSaved(current => (current?.key === storageKey ? undefined : current));
  }, [storageKey, openedCreatedProject]);

  async function createProject() {
    if (!origin || !session || !storageKey || inFlight.current) return;
    inFlight.current = true;
    setCreating(true);
    let target = createdProject;
    try {
      if (!target || target.registrationPending) {
        const project = target
          ? await registerCloudProject(origin, session, target.id)
          : await createCloudProject(origin, session);
        target = {
          id: project.projectId,
          registrationPending: project.registrationPending === true,
        };
        writeSavedProject(storageKey, target);
        setSaved({ key: storageKey, project: target });
        if (!isCurrentProjectSession(session)) return;
        void projectListLoader.current?.({ force: true });
        if (target.registrationPending) {
          toast.error('Project created. Select Retry project setup to finish setting it up.');
          return;
        }
      }
      if (isCurrentProjectSession(session)) {
        signIn({ projectId: target.id, redirect: buildProjectPath(target.id, '/data-marts') });
      }
    } catch (error) {
      if (!isCurrentProjectSession(session)) return;
      if (!target) {
        await projectListLoader.current?.({ force: true });
        if (isCurrentProjectSession(session)) {
          toast.error(
            'Could not confirm project creation. Check your project list before trying again.'
          );
        }
      } else if (target.registrationPending) {
        toast.error(
          isAxiosError(error) && error.response?.status === 403
            ? 'You no longer have permission to finish setting up this project.'
            : 'Could not finish project setup. Try again.'
        );
      } else {
        toast.error('Project created. Select Open new project to try again.');
      }
    } finally {
      inFlight.current = false;
      setCreating(false);
    }
  }

  const label = creating
    ? 'Setting up project…'
    : createdProject?.registrationPending
      ? 'Retry project setup'
      : createdProject
        ? 'Open new project'
        : 'Create project';

  return (
    <CloudProjectCreationContext.Provider
      value={{
        canCreate: Boolean(storageKey),
        creating,
        hasCreatedProject: Boolean(createdProject),
        label,
        createProject,
        registerProjectListLoader,
      }}
    >
      {children}
    </CloudProjectCreationContext.Provider>
  );
}

export function CloudProjectListRefresh() {
  const { loadProjects } = useProjects();
  const { registerProjectListLoader } = useCloudProjectCreation();
  useEffect(
    () => registerProjectListLoader(loadProjects),
    [loadProjects, registerProjectListLoader]
  );
  return null;
}
