import { FormLabel } from '@owox/ui/components/form';
import { CopyableField } from '@owox/ui/components/common/copyable-field';
import { isEmailCredentials } from '../../../../../data-destination/shared/model/types/email-credentials.ts';
import type { DataDestination } from '../../../../../data-destination';

export interface RecipientsDisplayProps {
  destination: DataDestination | null;
}

export const RecipientsDisplay = ({ destination }: RecipientsDisplayProps) => {
  if (!destination) return null;

  const creds = destination.credentials;
  const recipients = isEmailCredentials(creds) && creds.to.length ? creds.to.join(', ') : '';

  return (
    <div className='mt-2 flex flex-col gap-1'>
      <FormLabel>Recipients of this report</FormLabel>
      <CopyableField doNotTruncateContent={true} value={recipients}>
        {recipients || 'No recipients found'}
      </CopyableField>
    </div>
  );
};
