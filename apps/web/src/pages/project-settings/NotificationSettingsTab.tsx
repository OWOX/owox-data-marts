import { useState, useCallback } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { useProjectId } from '../../shared/hooks';
import { useMemberOwnershipWarnings } from '../../features/data-marts/shared/hooks/useMemberOwnershipWarnings';
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
  const { settings, error, updateSetting } = useNotificationSettings(projectId);
  const { warnings: ownershipWarnings } = useMemberOwnershipWarnings();

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
      <Alert variant='destructive'>
        <AlertCircle className='h-4 w-4' />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='flex flex-col gap-4' data-testid='projectSettingsNotifications'>
      {ownershipWarnings.length > 0 && (
        <Alert variant='default'>
          <AlertTriangle className='h-4 w-4' />
          <AlertTitle>Ownership warnings</AlertTitle>
          <AlertDescription>
            Some project members are assigned as Technical Owners but have a Business User role.
            Their ownership permissions will not be effective until their role is changed to
            Technical User.
          </AlertDescription>
        </Alert>
      )}
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
  );
}
