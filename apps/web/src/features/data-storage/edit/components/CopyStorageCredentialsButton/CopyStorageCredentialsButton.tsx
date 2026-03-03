import { useCallback } from 'react';
import { CopyCredentialsButton } from '../../../../../shared/components/CopyCredentialsButton';
import type { CredentialIdentity } from '../../../../../shared/types/credential-identity';
import { dataStorageApiService } from '../../../shared/api';
import type { DataStorageType } from '../../../shared';

interface CopyStorageCredentialsButtonProps {
  storageType: DataStorageType;
  currentStorageId?: string;
  onSelect: (
    sourceStorageId: string,
    title: string,
    identity: CredentialIdentity | null
  ) => void;
}

export function CopyStorageCredentialsButton({
  storageType,
  currentStorageId,
  onSelect,
}: CopyStorageCredentialsButtonProps) {
  const fetchItems = useCallback(
    () => dataStorageApiService.getDataStoragesByType(storageType),
    [storageType]
  );

  return (
    <CopyCredentialsButton
      entityLabel='Storage'
      currentEntityId={currentStorageId}
      fetchItems={fetchItems}
      onSelect={onSelect}
    />
  );
}
