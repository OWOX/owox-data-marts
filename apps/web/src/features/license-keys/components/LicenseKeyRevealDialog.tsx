import { SecretRevealDialog } from '../../../shared/components/SecretRevealDialog/SecretRevealDialog';
import type { CreateLicenseKeyResponse } from '../types';

interface LicenseKeyRevealDialogProps {
  data: CreateLicenseKeyResponse | null;
  onDone: () => void;
}

export function LicenseKeyRevealDialog({ data, onDone }: LicenseKeyRevealDialogProps) {
  if (!data) return null;

  return (
    <SecretRevealDialog
      title='License key created'
      description={
        <>
          Set this value as <code>LICENSE_KEY</code> on the deployment served at{' '}
          <strong>{data.origin}</strong>.
        </>
      }
      label='License key'
      labelTooltip='Full signed license. Store it securely.'
      secret={data.licenseKey}
      notice="Copy the license key now. You won't be able to see it again."
      confirmLabel='I have saved the license key'
      onDone={onDone}
    />
  );
}
