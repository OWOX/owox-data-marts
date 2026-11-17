import { useCallback } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { AlertCircle } from 'lucide-react';
import { useProjectId, useRecordSheet } from '../../../shared/hooks';
import {
  useNotificationSettings,
  NotificationSettingsTable,
  EditNotificationSheet,
} from '../../../features/project-settings/notifications';
import type {
  NotificationSettingsItem,
  NotificationType,
  UpdateNotificationSettingsRequest,
} from '../../../features/project-settings/notifications';

export function ProjectNotificationsPage() {
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
      <div className='dm-page'>
        <header className='dm-page-header'>
          <h1 className='dm-page-header-title'>Notification settings</h1>
        </header>
        <div className='dm-page-content'>
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className='dm-page' data-testid='notifPage'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Notification settings</h1>
      </header>
      <div className='dm-page-content'>
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
    </div>
  );
}
