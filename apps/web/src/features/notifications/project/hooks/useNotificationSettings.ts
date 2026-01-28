import { useState, useEffect, useCallback } from 'react';
import { notificationSettingsService } from '../services';
import type {
  NotificationSettingsItem,
  UpdateNotificationSettingsRequest,
  NotificationType,
  ProjectMember,
} from '../types';

interface UseNotificationSettingsReturn {
  settings: NotificationSettingsItem[];
  isLoading: boolean;
  error: string | null;
  updateSetting: (
    notificationType: NotificationType,
    data: UpdateNotificationSettingsRequest
  ) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useNotificationSettings(projectId: string | null): UseNotificationSettingsReturn {
  const [settings, setSettings] = useState<NotificationSettingsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await notificationSettingsService.getSettings(projectId);
      setSettings(response.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notification settings');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const updateSetting = useCallback(
    async (notificationType: NotificationType, data: UpdateNotificationSettingsRequest) => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }

      const updatedItem = await notificationSettingsService.updateSetting(
        projectId,
        notificationType,
        data
      );
      // Update only the changed setting in the array
      setSettings(prev =>
        prev.map(s => (s.notificationType === notificationType ? updatedItem : s))
      );
    },
    [projectId]
  );

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    isLoading,
    error,
    updateSetting,
    refetch: fetchSettings,
  };
}

interface UseProjectMembersReturn {
  members: ProjectMember[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useProjectMembers(projectId: string | null): UseProjectMembersReturn {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await notificationSettingsService.getProjectMembers(projectId);
      setMembers(response.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project members');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  return {
    members,
    isLoading,
    error,
    refetch: fetchMembers,
  };
}

interface UseTestWebhookReturn {
  testWebhook: (notificationType: NotificationType, webhookUrl: string) => Promise<void>;
  isTesting: boolean;
}

export function useTestWebhook(projectId: string | null): UseTestWebhookReturn {
  const [isTesting, setIsTesting] = useState(false);

  const testWebhook = useCallback(
    async (notificationType: NotificationType, webhookUrl: string) => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }

      setIsTesting(true);
      try {
        await notificationSettingsService.testWebhook(projectId, notificationType, webhookUrl);
      } finally {
        setIsTesting(false);
      }
    },
    [projectId]
  );

  return {
    testWebhook,
    isTesting,
  };
}
