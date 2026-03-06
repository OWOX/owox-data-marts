import { useCallback } from 'react';
import { CopyCredentialsButton } from '../../../../../shared/components/CopyCredentialsButton';
import type { CredentialIdentity } from '../../../../../shared/types/credential-identity';
import { dataDestinationService } from '../../../shared/services';
import type { DataDestinationType } from '../../../shared';

interface CopyDestinationCredentialsButtonProps {
  destinationType: DataDestinationType;
  currentDestinationId?: string;
  onSelect: (
    sourceDestinationId: string,
    title: string,
    identity: CredentialIdentity | null
  ) => void;
}

export function CopyDestinationCredentialsButton({
  destinationType,
  currentDestinationId,
  onSelect,
}: CopyDestinationCredentialsButtonProps) {
  const fetchItems = useCallback(
    () => dataDestinationService.getDataDestinationsByType(destinationType),
    [destinationType]
  );

  return (
    <CopyCredentialsButton
      entityLabel='Destination'
      currentEntityId={currentDestinationId}
      fetchItems={fetchItems}
      onSelect={onSelect}
    />
  );
}
