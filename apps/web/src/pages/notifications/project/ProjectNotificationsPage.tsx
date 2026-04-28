import { useState, useCallback } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { useProjectId } from '../../../shared/hooks';
import { useMemberOwnershipWarnings } from '../../../features/data-marts/shared/hooks/useMemberOwnershipWarnings';
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
        {ownershipWarnings.length > 0 && (
          <Alert variant='default' className='mb-4'>
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
    </div>
  );
}
