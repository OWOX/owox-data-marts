import { useCallback } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { AlertCircle } from 'lucide-react';
import { useProjectId, useRecordSheet } from '../../shared/hooks';
import {
  useNotificationSettings,
  NotificationSettingsTable,
  EditNotificationSheet,
} from '../../features/project-settings/notifications';
import type {
  NotificationSettingsItem,
  NotificationType,
  UpdateNotificationSettingsRequest,
} from '../../features/project-settings/notifications';

/**
 * Notification settings tab. Mirrors the standalone `ProjectNotificationsPage`
 * body — same hook, same table, same edit sheet — without the `dm-page`
 * header chrome (the Project Settings shell already owns the page title and
 * tabs). The legacy /notifications route stays as-is for deep-linking.
 */
export function NotificationSettingsTab() {
  const projectId = useProjectId();
  const { settings, isLoading, error, updateSetting } = useNotificationSettings(projectId);

  const {
    record: editingSetting,
    open,
    close,
    link,
  } = useRecordSheet({
    param: 'notification',
    records: isLoading || error ? undefined : settings,
    getId: setting => setting.notificationType,
    notFoundMessage: () => 'This notification is not available.',
  });

  const handleRowClick = useCallback(
    (setting: NotificationSettingsItem) => {
      open(setting.notificationType);
    },
    [open]
  );

  const handleToggleEnabled = useCallback(
    async (setting: NotificationSettingsItem, enabled: boolean) => {
      await updateSetting(setting.notificationType, { enabled });
    },
    [updateSetting]
  );

  const handleSave = useCallback(
    async (notificationType: NotificationType, data: UpdateNotificationSettingsRequest) => {
      await updateSetting(notificationType, data);
    },
    [updateSetting]
  );

  if (error) {
    return (
      <Alert variant='destructive'>
        <AlertCircle className='h-4 w-4' />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='flex flex-col gap-4' data-testid='projectSettingsNotifications'>
      <NotificationSettingsTable
        settings={settings}
        onRowClick={handleRowClick}
        onToggleEnabled={handleToggleEnabled}
      />
      <EditNotificationSheet
        isOpen={editingSetting !== null}
        onClose={close}
        setting={editingSetting}
        link={link}
        projectId={projectId ?? ''}
        onSave={handleSave}
      />
    </div>
  );
}
