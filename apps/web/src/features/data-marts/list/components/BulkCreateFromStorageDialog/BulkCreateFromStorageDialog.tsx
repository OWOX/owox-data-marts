import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Box, Eye, Table, X } from 'lucide-react';
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
import { UnhealthyStorageBlock } from '../../../../data-storage/shared/components';
import {
  DataStorageActionType,
  DataStorageProvider,
  useDataStorageContext,
} from '../../../../data-storage/shared/model/context';
import { useDataStorageHealthStatus } from '../../../../data-storage/shared/model/hooks/useDataStorageHealthStatus';
import { mapDataStorageListFromDto } from '../../../../data-storage/shared/model/mappers';
import { DataStorageHealthStatus } from '../../../../data-storage/shared/services/data-storage-health-status.service';
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

  // Front-end health check for the picked storage. The hook is called unconditionally
  // (rules of hooks) and returns a default state when the id is empty; we only react to
  // its result once a real storage is selected.
  const {
    status: healthStatus,
    errorMessage: healthErrorMessage,
    isFetched: healthIsFetched,
  } = useDataStorageHealthStatus(storageId);
  const isHealthKnownForStorage = storageId !== '' && healthIsFetched;
  const isUnhealthyStorage =
    isHealthKnownForStorage &&
    (healthStatus === DataStorageHealthStatus.UNCONFIGURED ||
      healthStatus === DataStorageHealthStatus.INVALID);

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

  // Whenever the storage changes (including after auto-select), wait for the front-end
  // health check before deciding whether to call the backend. Skip the backend call when the
  // storage is unhealthy — that case is handled by rendering DataStorageHealthStatusView.
  useEffect(() => {
    if (!open) return;
    if (!storageId) return;
    setSelected(new Map());
    setNamespaces(null);
    if (!isHealthKnownForStorage) {
      // Show a loading state while the health check is in flight so the user sees activity.
      setNamespacesLoading(true);
      setNamespacesError(null);
      return;
    }
    if (isUnhealthyStorage) {
      // No backend call — the unhealthy block carries the message. Clear any prior error.
      setNamespacesLoading(false);
      setNamespacesError(null);
      return;
    }
    setNamespacesError(null);
    void loadNamespaces(storageId);
  }, [open, storageId, isHealthKnownForStorage, isUnhealthyStorage, loadNamespaces]);

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
      <DialogContent className='flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-4xl'>
        <DialogHeader className='px-6 pt-6 pb-6'>
          <DialogTitle>Import data marts from storage</DialogTitle>
          <DialogDescription>
            Pick up to {MAX_BULK_DATA_MART_COUNT} tables or views — each becomes a new data mart.
          </DialogDescription>
        </DialogHeader>

        <div className='bg-muted dark:bg-sidebar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-t px-6 py-4'>
          {/* ── Block 1 ──────────────────────────────────────────────────── */}
          <section className='dm-card-block !gap-2'>
            <BlockHeading step={1}>Storage</BlockHeading>
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
          </section>

          {isUnhealthyStorage ? (
            <UnhealthyStorageBlock status={healthStatus} errorMessage={healthErrorMessage} />
          ) : (
            <>
              {/* ── Block 2 ────────────────────────────────────────────── */}
              <section className='dm-card-block !gap-2'>
                <BlockHeading step={2}>Browse resources</BlockHeading>
                {storageId ? (
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
                    singleSearchMode
                  />
                ) : (
                  <BlockPlaceholder>
                    Pick a data storage above to browse its tables and views.
                  </BlockPlaceholder>
                )}
              </section>

              {/* ── Block 3 ────────────────────────────────────────────── */}
              <section className='dm-card-block !gap-2'>
                <BlockHeading
                  step={3}
                  trailing={
                    <span className='text-muted-foreground text-xs font-normal'>
                      {selected.size} / {MAX_BULK_DATA_MART_COUNT}
                      {isSelectionFull && (
                        <span className='ml-2'>
                          · Limit reached, remove an item to pick another
                        </span>
                      )}
                    </span>
                  }
                >
                  Selected resources
                </BlockHeading>
                {selected.size === 0 ? (
                  <BlockPlaceholder>
                    {storageId
                      ? 'Tick resources in the tree above to add them here.'
                      : 'Selections appear here once you start ticking resources.'}
                  </BlockPlaceholder>
                ) : (
                  <ul className='flex flex-wrap gap-1.5'>
                    {Array.from(selected.values()).map(leaf => (
                      <li key={leaf.fullyQualifiedName}>
                        <Badge variant='secondary' className='gap-1 text-xs'>
                          <StorageTypeIcon resourceType={leaf.type} />
                          {leaf.id}
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
              </section>
            </>
          )}
        </div>

        {isUnhealthyStorage ? (
          <DialogFooter className='border-t px-6 py-4 sm:justify-center'>
            <Button
              type='button'
              onClick={handleFinishStorageSetup}
              title='Open the storage configuration to fix credentials or permissions'
            >
              Finish storage setup
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter className='border-t px-6 py-4'>
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
              <Box className='size-4' />
              {confirmLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StorageTypeIcon({
  storageType,
  resourceType,
}: {
  storageType?: DataStorageType | null;
  resourceType?: StorageResourceLeafDto['type'];
}) {
  if (resourceType != null) {
    if (resourceType === 'VIEW') {
      return <Eye className='size-3.5 shrink-0' aria-hidden />;
    }
    return <Table className='size-3.5 shrink-0' aria-hidden />;
  }
  if (!storageType) return null;
  const Icon = DataStorageTypeModel.getInfo(storageType).icon;
  return <Icon size={20} className='shrink-0' />;
}

/**
 * Small heading used at the top of each step-block in the dialog body. The numbered badge
 * makes the linear flow obvious without forcing the user to read prose.
 */
function BlockHeading({
  step,
  children,
  trailing,
}: {
  step: number;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className='flex items-center gap-2'>
      <span
        className='bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold'
        aria-hidden='true'
      >
        {step}
      </span>
      <h3 className='text-sm font-medium'>{children}</h3>
      {trailing && <div className='ml-auto'>{trailing}</div>}
    </div>
  );
}

/** Subtle placeholder used when a step's content is not yet available. */
function BlockPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className='text-muted-foreground bg-muted/40 rounded-md p-3 text-xs dark:bg-white/4'>
      {children}
    </div>
  );
}
