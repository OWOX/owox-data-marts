import { useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { toast } from 'react-hot-toast';
import { projectSettingsApiService } from '../services';
import type { ProjectSettings } from '../types';

interface UseProjectSettingsResult {
  settings: ProjectSettings;
  isLoading: boolean;
  error: string | null;
  updateDescription: (description: string | null) => Promise<void>;
}

const EMPTY_SETTINGS: ProjectSettings = { description: null, revision: 0 };

export function useProjectSettings(projectId: string): UseProjectSettingsResult {
  const [settings, setSettings] = useState<ProjectSettings>(EMPTY_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeProjectIdRef = useRef(projectId);
  activeProjectIdRef.current = projectId;
  const loadedSettingsRef = useRef<{ projectId: string; revision: number } | null>(null);

  useEffect(() => {
    const state = { cancelled: false };
    loadedSettingsRef.current = null;

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
          loadedSettingsRef.current = { projectId, revision: response.revision };
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

    const loaded = loadedSettingsRef.current;
    try {
      if (loaded?.projectId !== requestProjectId || !Number.isSafeInteger(loaded.revision)) {
        throw new Error('Reload Project Settings before saving the description.');
      }
      const updated = await projectSettingsApiService.updateDescription(
        description,
        loaded.revision
      );
      if (activeProjectIdRef.current === requestProjectId && loadedSettingsRef.current === loaded) {
        loadedSettingsRef.current = { projectId: requestProjectId, revision: updated.revision };
        setSettings(updated);
        setError(null);
        toast.success('Description updated');
      }
    } catch (cause) {
      const message =
        isAxiosError(cause) && cause.response?.status === 409
          ? 'Description changed elsewhere. Reload Project Settings and review the current description before saving again.'
          : cause instanceof Error
            ? cause.message
            : 'Failed to update description';
      if (activeProjectIdRef.current === requestProjectId && loadedSettingsRef.current === loaded) {
        toast.error(message);
      }
      throw cause;
    }
  }, []);

  return { settings, isLoading, error, updateDescription };
}
