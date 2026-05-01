import { useCallback, useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@owox/ui/components/dialog';
import { DataStorageType } from '../../../../../../data-storage';
import { dataStorageApiService } from '../../../../../../data-storage/shared/api';
import type {
  StorageNamespaceNodeDto,
  StorageResourceFilter,
  StorageResourceLeafDto,
} from '../../../../../../data-storage/shared/api/types';
import { StorageResourceTree } from './StorageResourceTree';
import { extractStorageResourceError } from './storage-resource-error.utils';

/** Storage types that have a working resource browser on the backend. */
const STORAGE_TYPES_WITH_RESOURCE_BROWSER: ReadonlySet<DataStorageType> = new Set([
  DataStorageType.GOOGLE_BIGQUERY,
]);

interface FillFromStorageButtonProps {
  storageId: string;
  storageType: DataStorageType;
  resourceType: StorageResourceFilter;
  onSelect: (fullyQualifiedName: string) => void;
}

export function FillFromStorageButton({
  storageId,
  storageType,
  resourceType,
  onSelect,
}: FillFromStorageButtonProps) {
  const [open, setOpen] = useState(false);
  const [namespaces, setNamespaces] = useState<StorageNamespaceNodeDto[] | null>(null);
  const [namespacesError, setNamespacesError] = useState<string | null>(null);
  const [namespacesLoading, setNamespacesLoading] = useState(false);

  const loadNamespaces = useCallback(async () => {
    setNamespacesLoading(true);
    setNamespacesError(null);
    try {
      const result = await dataStorageApiService.listStorageNamespaces(storageId);
      setNamespaces(result);
    } catch (error) {
      setNamespacesError(extractStorageResourceError(error));
      setNamespaces([]);
    } finally {
      setNamespacesLoading(false);
    }
  }, [storageId]);

  useEffect(() => {
    if (open && namespaces === null && !namespacesLoading) {
      void loadNamespaces();
    }
  }, [open, namespaces, namespacesLoading, loadNamespaces]);

  const handleSelect = useCallback(
    (resource: StorageResourceLeafDto) => {
      onSelect(resource.fullyQualifiedName);
      setOpen(false);
    },
    [onSelect]
  );

  const loadNamespaceResources = useCallback(
    async (namespaceId: string): Promise<StorageResourceLeafDto[]> => {
      return dataStorageApiService.listStorageResources(storageId, namespaceId, resourceType);
    },
    [storageId, resourceType]
  );

  if (!STORAGE_TYPES_WITH_RESOURCE_BROWSER.has(storageType)) {
    return null;
  }

  const resourceLabel =
    resourceType === 'VIEW' ? 'view' : resourceType === 'TABLE_PATTERN' ? 'table pattern' : 'table';
  const resourceLabelPlural =
    resourceType === 'VIEW'
      ? 'views'
      : resourceType === 'TABLE_PATTERN'
        ? 'table patterns (sharded tables collapsed into a single wildcard entry)'
        : 'tables';

  return (
    <>
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => {
          setOpen(true);
        }}
      >
        <Database className='size-4' />
        Fill from Storage
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-4xl'>
          <DialogHeader>
            <DialogTitle>Pick a {resourceLabel}</DialogTitle>
            <DialogDescription>
              Pick a namespace to see all {resourceLabelPlural} the storage has access to. Selecting
              one fills the Fully Qualified Name.
            </DialogDescription>
          </DialogHeader>
          <StorageResourceTree
            namespaces={namespaces}
            namespacesLoading={namespacesLoading}
            namespacesError={namespacesError}
            onRetryNamespaces={() => {
              void loadNamespaces();
            }}
            loadNamespaceResources={loadNamespaceResources}
            onSelectResource={handleSelect}
            resourceType={resourceType}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
