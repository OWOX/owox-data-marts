import { useState, useCallback, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import { Button } from '@owox/ui/components/button';
import { Loader2 } from 'lucide-react';
import { AppForm, FormLayout, FormActions } from '@owox/ui/components/form';
import { toast } from 'sonner';
import { useProjectMembers, useTestWebhook } from '../../hooks';
import type {
  NotificationSettingsItem,
  UpdateNotificationSettingsRequest,
  NotificationType,
} from '../../types';
import { GroupingDelayCron } from '../../types';
import { GeneralSection } from './form/GeneralSection';
import { RecipientsSection } from './selection/RecipientsSection';
import { GroupingDelaySection } from './form/GroupingDelaySection';
import { WebhookSection } from './form/WebhookSection';

interface EditNotificationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  setting: NotificationSettingsItem | null;
  projectId: string;
  onSave: (
    notificationType: NotificationType,
    data: UpdateNotificationSettingsRequest
  ) => Promise<void>;
}

export function EditNotificationSheet({
  isOpen,
  onClose,
  setting,
  projectId,
  onSave,
}: EditNotificationSheetProps) {
  const { members, isLoading: isLoadingMembers } = useProjectMembers(projectId);
  const { testWebhook, isTesting } = useTestWebhook(projectId);

  const [enabled, setEnabled] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [groupingDelayCron, setGroupingDelayCron] = useState<string>(GroupingDelayCron.ONE_HOUR);
  const [isSaving, setIsSaving] = useState(false);
  const [webhookTestError, setWebhookTestError] = useState<string | null>(null);
  const [webhookTestSuccess, setWebhookTestSuccess] = useState(false);

  // Reset form when setting changes
  useEffect(() => {
    if (setting) {
      setEnabled(setting.enabled);
      setSelectedUserIds(setting.receivers.map(r => r.userId));
      setWebhookUrl(setting.webhookUrl ?? '');
      setGroupingDelayCron(setting.groupingDelayCron);
      setWebhookTestError(null);
      setWebhookTestSuccess(false);
    }
  }, [setting]);

  const handleSave = useCallback(async () => {
    if (!setting) return;

    setIsSaving(true);
    try {
      await onSave(setting.notificationType, {
        enabled,
        receivers: selectedUserIds,
        webhookUrl: webhookUrl || null,
        groupingDelayCron,
      });
      toast.success('Settings saved', {
        description: 'Notification settings have been updated.',
      });
      onClose();
    } catch (error) {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to save settings',
      });
    } finally {
      setIsSaving(false);
    }
  }, [setting, enabled, selectedUserIds, webhookUrl, groupingDelayCron, onSave, onClose]);

  const handleWebhookUrlChange = useCallback((url: string) => {
    setWebhookUrl(url);
    setWebhookTestError(null);
    setWebhookTestSuccess(false);
  }, []);

  const handleTestWebhook = useCallback(async () => {
    if (!setting) return;
    setWebhookTestError(null);
    setWebhookTestSuccess(false);
    try {
      await testWebhook(setting.notificationType, webhookUrl);
      setWebhookTestSuccess(true);
    } catch (error) {
      setWebhookTestError(error instanceof Error ? error.message : 'Failed to send test webhook');
    }
  }, [setting, webhookUrl, testWebhook]);

  if (!setting) return null;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit notification</SheetTitle>
          <SheetDescription>Fill in the details...</SheetDescription>
        </SheetHeader>

        <AppForm
          onSubmit={e => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <FormLayout>
            <GeneralSection
              setting={setting}
              enabled={enabled}
              onEnabledChange={setEnabled}
              disabled={isSaving}
            />
            <RecipientsSection
              members={members}
              selectedUserIds={selectedUserIds}
              onChange={setSelectedUserIds}
              isLoading={isLoadingMembers}
              disabled={isSaving}
            />
            <GroupingDelaySection
              value={groupingDelayCron}
              onChange={setGroupingDelayCron}
              disabled={isSaving}
            />
            <WebhookSection
              webhookUrl={webhookUrl}
              onWebhookUrlChange={handleWebhookUrlChange}
              onTest={() => void handleTestWebhook()}
              isTesting={isTesting}
              disabled={isSaving}
              testError={webhookTestError}
              testSuccess={webhookTestSuccess}
            />
          </FormLayout>

          <FormActions>
            <Button type='submit' className='w-full' disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
            <Button
              type='button'
              variant='outline'
              className='w-full'
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </FormActions>
        </AppForm>
      </SheetContent>
    </Sheet>
  );
}
