import { FormHelpTooltip } from '@owox/ui/components/form';
import { Label } from '@owox/ui/components/label';
import type { ReactNode } from 'react';

/** A field label with the help icon FormLabel shows, for fields outside react-hook-form. */
export function HelpLabel({
  htmlFor,
  tooltip,
  children,
}: {
  htmlFor?: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <div className='flex items-center justify-between gap-2'>
      <Label htmlFor={htmlFor}>{children}</Label>
      {tooltip && <FormHelpTooltip tooltip={tooltip} />}
    </div>
  );
}
