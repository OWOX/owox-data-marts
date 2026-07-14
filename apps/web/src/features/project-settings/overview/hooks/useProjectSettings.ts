import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { projectSettingsApiService } from '../services';
import type { ProjectSettings } from '../types';

interface UseProjectSettingsResult {
  settings: ProjectSettings;
  isLoading: boolean;
  error: string | null;
  updateDescription: (description: string | null) => Promise<void>;
}

const EMPTY_SETTINGS: ProjectSettings = { description: null };

export function useProjectSettings(projectId: string): UseProjectSettingsResult {
  const [settings, setSettings] = useState<ProjectSettings>(EMPTY_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeProjectIdRef = useRef(projectId);
  activeProjectIdRef.current = projectId;

  useEffect(() => {
    const state = { cancelled: false };

    if (!projectId) {
      setSettings(EMPTY_SETTINGS);
      setIsLoading(false);
      return;
    }

    setSettings(EMPTY_SETTINGS);
    setIsLoading(true);
    setError(null);
    void projectSettingsApiService
      .getSettings()
      .then(response => {
        if (!state.cancelled) {
          setSettings(response);
        }
      })
      .catch((cause: unknown) => {
        if (!state.cancelled) {
          setError(cause instanceof Error ? cause.message : 'Failed to load project description');
        }
      })
      .finally(() => {
        if (!state.cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      state.cancelled = true;
    };
  }, [projectId]);

  const updateDescription = useCallback(async (description: string | null) => {
    const requestProjectId = activeProjectIdRef.current;

    try {
      const updated = await projectSettingsApiService.updateDescription(description);
      if (activeProjectIdRef.current === requestProjectId) {
        setSettings(updated);
        setError(null);
        toast.success('Description updated');
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to update description';
      if (activeProjectIdRef.current === requestProjectId) {
        toast.error(message);
      }
      throw cause;
    }
  }, []);

  return { settings, isLoading, error, updateDescription };
}
