import { useRef, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useFlags } from '../../../app/store/hooks';
import { buildProjectPath } from '../../../utils/path';
import { useUser } from '../../idp/hooks/useAuthState';
import { useProjects } from '../../idp/hooks/useProjects';
import { signIn } from '../../idp/services';
import { CloudProjectCreationContext } from './useCloudProjectCreation';
import {
  createCloudProject,
  getCloudProjectApiOrigin,
  isCurrentProjectSession,
  registerCloudProject,
} from './project-management.service';

export function CloudProjectCreationProvider({ children }: { children: ReactNode }) {
  const { flags } = useFlags();
  const user = useUser();
  const origin = getCloudProjectApiOrigin(flags);
  const [createdProject, setCreatedProject] = useState<{
    sessionKey: string;
    id: string;
    registrationPending?: boolean;
  }>();
  const [creating, setCreating] = useState(false);
  const inFlight = useRef(false);
  const { loadProjects } = useProjects();
  const session =
    user?.id && user.projectId && !user.viewOnly
      ? { userId: user.id, projectId: user.projectId }
      : null;
  const sessionKey = session ? `${session.userId}:${session.projectId}` : '';
  const lastProject = createdProject?.sessionKey === sessionKey ? createdProject : undefined;
  const createdId = lastProject?.id;
  const registrationPending = lastProject?.registrationPending === true;

  async function createProject() {
    if (!origin || !session || inFlight.current) return;
    inFlight.current = true;
    setCreating(true);
    let targetId = createdId;
    try {
      if (!targetId || registrationPending) {
        const project = targetId
          ? await registerCloudProject(origin, session, targetId)
          : await createCloudProject(origin, session);
        if (!isCurrentProjectSession(session)) return;
        targetId = project.projectId;
        setCreatedProject({
          sessionKey,
          id: targetId,
          registrationPending: project.registrationPending,
        });
        void loadProjects({ force: true });
        if (project.registrationPending) {
          toast.error('Project created. Select Retry project setup to finish setting it up.');
          return;
        }
      }
      if (isCurrentProjectSession(session)) {
        signIn({ projectId: targetId, redirect: buildProjectPath(targetId, '/data-marts') });
      }
    } catch {
      if (isCurrentProjectSession(session)) {
        toast.error(
          registrationPending
            ? 'Could not finish project setup. Try again.'
            : targetId
              ? 'Project created. Select Open new project to try again.'
              : 'Could not create a project. Check your project list before trying again.'
        );
      }
    } finally {
      inFlight.current = false;
      setCreating(false);
    }
  }

  const label = creating
    ? 'Setting up project…'
    : registrationPending
      ? 'Retry project setup'
      : createdId
        ? 'Open new project'
        : 'Create project';

  return (
    <CloudProjectCreationContext.Provider
      value={{
        canCreate: Boolean(origin && session),
        creating,
        hasCreatedProject: Boolean(createdId),
        label,
        createProject,
      }}
    >
      {children}
    </CloudProjectCreationContext.Provider>
  );
}
