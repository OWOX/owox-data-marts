import { SecretRevealDialog as RevealDialog } from '../../../shared/components/SecretRevealDialog/SecretRevealDialog';
import type { CreateProjectMemberApiKeyResponse } from '../types';

const API_KEYS_DOCS_URL = 'https://docs.owox.com/docs/api/api-keys/';

interface SecretRevealDialogProps {
  data: CreateProjectMemberApiKeyResponse | null;
  onDone: () => void;
}

export function SecretRevealDialog({ data, onDone }: SecretRevealDialogProps) {
  if (!data) return null;

  return (
    <RevealDialog
      title='API Key Created'
      description='Your new API key has been created successfully.'
      label='API Key'
      labelTooltip='Full secret API key. Store it securely.'
      secret={data.apiKey}
      notice="Copy the API Key now. You won't be able to see it again."
      confirmLabel='I have saved the API Key'
      docsLink={{ href: API_KEYS_DOCS_URL, label: 'API Keys documentation' }}
      onDone={onDone}
    />
  );
}
