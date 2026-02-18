import { useState, useCallback } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { AlertCircle } from 'lucide-react';
import { useProjectId } from '../../../shared/hooks';
import {
  useNotificationSettings,
  NotificationSettingsTable,
  EditNotificationSheet,
} from '../../../features/notifications/project';
import type {
  NotificationSettingsItem,
  NotificationType,
  UpdateNotificationSettingsRequest,
} from '../../../features/notifications/project';

export function ProjectNotificationsPage() {
  const projectId = useProjectId();
  const { settings, error, updateSetting } = useNotificationSettings(projectId);

  const [editingSetting, setEditingSetting] = useState<NotificationSettingsItem | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const handleRowClick = useCallback((setting: NotificationSettingsItem) => {
    setEditingSetting(setting);
    setIsSheetOpen(true);
  }, []);

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

  const handleCloseSheet = useCallback(() => {
    setIsSheetOpen(false);
    setEditingSetting(null);
  }, []);

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
    <div className='dm-page'>
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
          isOpen={isSheetOpen}
          onClose={handleCloseSheet}
          setting={editingSetting}
          projectId={projectId ?? ''}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
