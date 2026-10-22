import { DataMartIconPicker } from '../../../data-marts/shared/components/DataMartIcon';
import type { DataMartIconValue } from '../../../data-marts/shared/enums/data-mart-icon.enum';
import { DEFAULT_CONTEXT_ICON } from './context-icon';

interface ContextIconPickerProps {
  icon: DataMartIconValue | null;
  onChange: (icon: DataMartIconValue | null) => void;
  disabled?: boolean;
}

/**
 * Icon tile beside a context name; the same icon set and search as for Data Marts.
 * It lives in the Add/Configure context sheets, so the popover is modal to keep
 * its icon list scrollable under the sheet's scroll lock.
 */
export function ContextIconPicker({ icon, onChange, disabled }: ContextIconPickerProps) {
  return (
    <DataMartIconPicker
      icon={icon}
      onChange={next => {
        onChange(next);
        return Promise.resolve();
      }}
      disabled={disabled}
      fallbackIcon={DEFAULT_CONTEXT_ICON}
      triggerLabel='Change context icon'
      testId='contextIconPicker'
      modal
    />
  );
}
