import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Database, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@owox/ui/components/dialog';
import { extractApiError } from '../../../../../app/api';
import { Combobox } from '../../../../../shared/components/Combobox/combobox';
import { useProjectRoute } from '../../../../../shared/hooks';
import { DataStorageHealthIndicator, DataStorageType } from '../../../../data-storage';
import { dataStorageApiService } from '../../../../data-storage/shared/api';
import type {
  StorageNamespaceNodeDto,
  StorageResourceLeafDto,
} from '../../../../data-storage/shared/api/types';
import {
  DataStorageActionType,
  DataStorageProvider,
  useDataStorageContext,
} from '../../../../data-storage/shared/model/context';
import { mapDataStorageListFromDto } from '../../../../data-storage/shared/model/mappers';
import { DataStorageTypeModel } from '../../../../data-storage/shared/types/data-storage-type.model';
import { extractStorageResourceError } from '../../../edit/components/DataMartDefinitionSettings/form/FillFromStorageButton/storage-resource-error.utils';
import { StorageResourceTree } from '../../../edit/components/DataMartDefinitionSettings/form/FillFromStorageButton/StorageResourceTree';
import { BULK_CREATE_SUPPORTED_STORAGE_TYPES, MAX_BULK_DATA_MART_COUNT } from './constants';
import { useBulkCreateDataMarts } from './use-bulk-create-data-marts';

interface BulkCreateFromStorageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the create flow finishes (success or partial), so the list can refresh. */
  onCreated: () => void;
}

export function BulkCreateFromStorageDialog(props: BulkCreateFromStorageDialogProps) {
  return (
    <DataStorageProvider>
      <BulkCreateFromStorageDialogInner {...props} />
    </DataStorageProvider>
  );
}

function BulkCreateFromStorageDialogInner({
  open,
  onOpenChange,
  onCreated,
}: BulkCreateFromStorageDialogProps) {
  const { state, dispatch } = useDataStorageContext();
  const { dataStorages, loading: loadingStorages } = state;
  const { navigate } = useProjectRoute();

  const [storageId, setStorageId] = useState<string>('');
  const [namespaces, setNamespaces] = useState<StorageNamespaceNodeDto[] | null>(null);
  const [namespacesLoading, setNamespacesLoading] = useState(false);
  const [namespacesError, setNamespacesError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, StorageResourceLeafDto>>(new Map());
  const autoSelectedRef = useRef(false);
  const fetchedStoragesRef = useRef(false);

  const { run, inFlight, progress, reset } = useBulkCreateDataMarts();

  const eligibleStorages = useMemo(
    () => dataStorages.filter(s => BULK_CREATE_SUPPORTED_STORAGE_TYPES.has(s.type)),
    [dataStorages]
  );

  // Fetch storages on first open. We use the context's dispatch directly to avoid the
  // toast/error noise the sibling hook publishes — the dialog renders its own empty state.
  useEffect(() => {
    if (!open) return;
    if (fetchedStoragesRef.current) return;
    fetchedStoragesRef.current = true;

    dispatch({ type: DataStorageActionType.FETCH_STORAGES_START });
    dataStorageApiService
      .getDataStorages()
      .then(response => {
        dispatch({
          type: DataStorageActionType.FETCH_STORAGES_SUCCESS,
          payload: response.map(mapDataStorageListFromDto),
        });
      })
      .catch((error: unknown) => {
        dispatch({
          type: DataStorageActionType.FETCH_STORAGES_ERROR,
          payload: extractApiError(error),
        });
      });
  }, [open, dispatch]);

  // Auto-select when there is exactly one eligible storage — saves a click in the common case.
  useEffect(() => {
    if (!open) return;
    if (loadingStorages) return;
    if (autoSelectedRef.current) return;
    if (storageId) return;
    if (eligibleStorages.length !== 1) return;
    autoSelectedRef.current = true;
    setStorageId(eligibleStorages[0].id);
  }, [open, loadingStorages, eligibleStorages, storageId]);

  // Reset transient state on close so the next open starts fresh.
  useEffect(() => {
    if (open) return;
    setStorageId('');
    setNamespaces(null);
    setNamespacesLoading(false);
    setNamespacesError(null);
    setSelected(new Map());
    autoSelectedRef.current = false;
    reset();
  }, [open, reset]);

  const loadNamespaces = useCallback(async (id: string) => {
    setNamespacesLoading(true);
    setNamespacesError(null);
    try {
      const result = await dataStorageApiService.listStorageNamespaces(id);
      setNamespaces(result);
    } catch (error) {
      setNamespacesError(extractStorageResourceError(error));
      setNamespaces([]);
    } finally {
      setNamespacesLoading(false);
    }
  }, []);

  // Whenever the storage changes (including after auto-select), kick off the namespace fetch
  // and clear any prior selections — selections from another storage are not portable.
  useEffect(() => {
    if (!open) return;
    if (!storageId) return;
    setSelected(new Map());
    setNamespaces(null);
    setNamespacesError(null);
    void loadNamespaces(storageId);
  }, [open, storageId, loadNamespaces]);

  const loadNamespaceResources = useCallback(
    async (namespaceId: string): Promise<StorageResourceLeafDto[]> => {
      // No resourceType filter — we want both TABLE and VIEW leaves.
      return dataStorageApiService.listStorageResources(storageId, namespaceId);
    },
    [storageId]
  );

  const selectedFqns = useMemo(() => new Set(selected.keys()), [selected]);
  const isSelectionFull = selected.size >= MAX_BULK_DATA_MART_COUNT;

  const handleToggle = useCallback((resource: StorageResourceLeafDto) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(resource.fullyQualifiedName)) {
        next.delete(resource.fullyQualifiedName);
      } else if (next.size < MAX_BULK_DATA_MART_COUNT) {
        next.set(resource.fullyQualifiedName, resource);
      }
      return next;
    });
  }, []);

  const handleRemove = useCallback((fqn: string) => {
    setSelected(prev => {
      if (!prev.has(fqn)) return prev;
      const next = new Map(prev);
      next.delete(fqn);
      return next;
    });
  }, []);

  const storageOptions = useMemo(
    () =>
      [...eligibleStorages]
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(storage => ({ value: storage.id, label: storage.title })),
    [eligibleStorages]
  );

  const handleConfirm = async () => {
    if (!storageId || selected.size === 0) return;
    const leaves = Array.from(selected.values());
    const result = await run({ storageId, leaves });
    onCreated();

    if (result.successCount > 0) {
      toast.success(
        `Created ${String(result.successCount)} data mart${result.successCount === 1 ? '' : 's'}`,
        { duration: 6000 }
      );
    }
    if (result.failures.length > 0) {
      toast.error(
        `Failed to create ${String(result.failures.length)} data mart${
          result.failures.length === 1 ? '' : 's'
        }. Check ${result.failures.length === 1 ? 'it' : 'them'} and retry.`,
        { duration: 8000 }
      );
      // Keep the failed selections so the user can retry without rebuilding the list.
      setSelected(prev => {
        const next = new Map<string, StorageResourceLeafDto>();
        for (const [fqn, leaf] of prev) {
          if (!result.successfulFqns.includes(fqn)) {
            next.set(fqn, leaf);
          }
        }
        return next;
      });
      return;
    }

    onOpenChange(false);
  };

  const confirmLabel = inFlight
    ? progress
      ? `Creating ${String(progress.done)} / ${String(progress.total)}…`
      : 'Creating…'
    : selected.size > 0
      ? `Create ${String(selected.size)} data mart${selected.size === 1 ? '' : 's'}`
      : 'Create data marts';

  // When namespace listing fails, the storage is effectively unusable from this dialog —
  // typical causes are missing/invalid credentials or insufficient IAM permissions. Drop the
  // selection UI and steer the user toward fixing the storage configuration.
  const isInvalidStorage = Boolean(storageId) && !namespacesLoading && Boolean(namespacesError);

  const handleFinishStorageSetup = () => {
    if (!storageId) return;
    onOpenChange(false);
    navigate(`/data-storages?id=${storageId}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (inFlight) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>Create data marts from storage</DialogTitle>
          <DialogDescription>
            Pick a Google BigQuery storage and select up to {MAX_BULK_DATA_MART_COUNT} tables or
            views. Each selected resource becomes a new data mart with a definition derived from the
            resource type.
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-3'>
          <div className='flex flex-col gap-1.5'>
            <label className='text-sm font-medium' htmlFor='bulk-create-storage-select'>
              Data storage
            </label>
            <Combobox
              options={storageOptions}
              value={storageId}
              onValueChange={value => {
                setStorageId(value);
              }}
              placeholder={
                loadingStorages
                  ? 'Loading…'
                  : storageOptions.length === 0
                    ? 'No Google BigQuery storages available'
                    : 'Select a storage'
              }
              emptyMessage='No Google BigQuery storages available'
              disabled={loadingStorages || storageOptions.length === 0 || inFlight}
              className='w-full'
              renderLabel={option => (
                <div className='flex min-w-0 flex-1 items-center gap-2'>
                  <div className='shrink-0'>
                    <DataStorageHealthIndicator
                      storageId={option.value}
                      storageTitle={option.label}
                      hovercardSide='left'
                      variant='compact'
                    />
                  </div>
                  <StorageTypeIcon
                    storageType={eligibleStorages.find(s => s.id === option.value)?.type ?? null}
                  />
                  <span className='min-w-0 truncate'>{option.label}</span>
                </div>
              )}
            />
          </div>

          {isInvalidStorage ? (
            <div className='flex flex-col gap-2 rounded-md border border-dashed p-3 text-sm'>
              <div className='text-destructive flex items-start gap-2'>
                <AlertCircle className='mt-0.5 size-4 shrink-0' />
                <span>
                  The selected storage cannot list resources right now. Finish the storage setup —
                  check credentials and IAM permissions — then try again.
                </span>
              </div>
              <p className='text-muted-foreground pl-6 text-xs'>{namespacesError}</p>
            </div>
          ) : (
            storageId && (
              <StorageResourceTree
                namespaces={namespaces}
                namespacesLoading={namespacesLoading}
                namespacesError={namespacesError}
                onRetryNamespaces={() => {
                  void loadNamespaces(storageId);
                }}
                loadNamespaceResources={loadNamespaceResources}
                selectionMode='multi'
                selectedFqns={selectedFqns}
                onToggleResource={handleToggle}
                isSelectionFull={isSelectionFull}
              />
            )
          )}

          {!isInvalidStorage && (
            <div className='flex flex-col gap-1.5'>
              <div className='flex items-center justify-between text-xs'>
                <span className='text-muted-foreground'>
                  {selected.size} of {MAX_BULK_DATA_MART_COUNT} selected
                </span>
                {isSelectionFull && (
                  <span className='text-muted-foreground'>
                    Limit reached — remove an item to pick another.
                  </span>
                )}
              </div>
              {selected.size === 0 ? (
                <div className='text-muted-foreground rounded-md border border-dashed p-2 text-xs'>
                  {storageId
                    ? 'Tick resources in the tree above to add them here.'
                    : 'Pick a data storage to start selecting resources.'}
                </div>
              ) : (
                <ul className='flex flex-wrap gap-1'>
                  {Array.from(selected.values()).map(leaf => (
                    <li key={leaf.fullyQualifiedName}>
                      <Badge variant='secondary' className='gap-1 text-xs'>
                        {leaf.type === 'VIEW' ? 'V' : 'T'}: {leaf.id}
                        <button
                          type='button'
                          aria-label={`Remove ${leaf.fullyQualifiedName}`}
                          title={leaf.fullyQualifiedName}
                          onClick={() => {
                            handleRemove(leaf.fullyQualifiedName);
                          }}
                          disabled={inFlight}
                          className='hover:text-destructive ml-0.5 inline-flex shrink-0 items-center justify-center rounded-sm disabled:opacity-50'
                        >
                          <X className='size-3' />
                        </button>
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {isInvalidStorage ? (
          <DialogFooter className='sm:justify-center'>
            <Button
              type='button'
              onClick={handleFinishStorageSetup}
              title='Open the storage configuration to fix credentials or permissions'
            >
              Finish storage setup
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={inFlight}
            >
              Cancel
            </Button>
            <Button
              type='button'
              onClick={() => {
                void handleConfirm();
              }}
              disabled={inFlight || !storageId || selected.size === 0}
            >
              <Database className='size-4' />
              {confirmLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StorageTypeIcon({ storageType }: { storageType: DataStorageType | null }) {
  if (!storageType) return null;
  const Icon = DataStorageTypeModel.getInfo(storageType).icon;
  return <Icon size={20} className='shrink-0' />;
}
