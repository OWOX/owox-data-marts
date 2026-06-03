import { useCallback, useEffect, useState } from 'react';
import { projectMembersService } from '../../../project-members/services/project-members.service';
import type {
  UpdateUserProvisioningSettingsPayload,
  UserProvisioningSettingsResponse,
} from '../../../project-members/types';

interface UseUserProvisioningSettingsReturn {
  settings: UserProvisioningSettingsResponse | null;
  isLoading: boolean;
  isSaving: boolean;
  save: (
    payload: UpdateUserProvisioningSettingsPayload
  ) => Promise<UserProvisioningSettingsResponse>;
  refetch: () => Promise<void>;
}

export function useUserProvisioningSettings(): UseUserProvisioningSettingsReturn {
  const [settings, setSettings] = useState<UserProvisioningSettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const refetch = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await projectMembersService.getUserProvisioningSettings();
      setSettings(result);
    } catch (err) {
      console.error('Failed to load user provisioning settings', err);
      setSettings(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const save = useCallback(async (payload: UpdateUserProvisioningSettingsPayload) => {
    setIsSaving(true);

    try {
      const result = await projectMembersService.updateUserProvisioningSettings(payload);
      setSettings(result);
      return result;
    } finally {
      setIsSaving(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    settings,
    isLoading,
    isSaving,
    save,
    refetch,
  };
}
