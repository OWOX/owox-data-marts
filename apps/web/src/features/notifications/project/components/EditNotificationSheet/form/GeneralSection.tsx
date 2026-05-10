import { FormSection } from '@owox/ui/components/form';
import type { NotificationSettingsItem } from '../../../types';
import { TitleField } from './TitleField';
import { EnabledField } from './EnabledField';

interface GeneralSectionProps {
  setting: NotificationSettingsItem;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export function GeneralSection({
  setting,
  enabled,
  onEnabledChange,
  disabled,
}: GeneralSectionProps) {
  return (
    <FormSection title='General'>
      <TitleField title={setting.title} />
      <EnabledField enabled={enabled} onChange={onEnabledChange} disabled={disabled} />
    </FormSection>
  );
}
