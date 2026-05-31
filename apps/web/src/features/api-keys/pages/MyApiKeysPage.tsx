import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { ApiKeysTable } from '../components/ApiKeysTable/ApiKeysTable';
import { CreateApiKeySheet } from '../components/CreateApiKeySheet';
import { EditApiKeySheet } from '../components/EditApiKeySheet';
import { SecretRevealDialog } from '../components/SecretRevealDialog';
import { ConfirmationDialog } from '../../../shared/components/ConfirmationDialog/ConfirmationDialog';
import { useApiKeys } from '../hooks/useApiKeys';
import type { ProjectMemberApiKey, CreateProjectMemberApiKeyResponse } from '../types';
import { useUrlParam } from '../../../shared/hooks/useUrlParam';

const API_KEY_DETAILS_PARAM = 'apiKeyId';

export function MyApiKeysPage() {
  const { keys, loading, fetchKeys, revokeKey } = useApiKeys();
  const {
    value: selectedApiKeyId,
    setParam: setSelectedApiKeyId,
    removeParam: removeSelectedApiKeyId,
  } = useUrlParam(API_KEY_DETAILS_PARAM);

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [revokingKey, setRevokingKey] = useState<ProjectMemberApiKey | null>(null);
  const [createdKeyData, setCreatedKeyData] = useState<CreateProjectMemberApiKeyResponse | null>(
    null
  );
  const selectedApiKey = useMemo(
    () => keys.find(key => key.apiKeyId === selectedApiKeyId) ?? null,
    [keys, selectedApiKeyId]
  );

  useEffect(() => {
    if (loading || !selectedApiKeyId || selectedApiKey) return;

    removeSelectedApiKeyId();
  }, [loading, removeSelectedApiKeyId, selectedApiKey, selectedApiKeyId]);

  const handleCreated = (result: CreateProjectMemberApiKeyResponse) => {
    setCreateSheetOpen(false);
    setCreatedKeyData(result);
    void fetchKeys();
  };

  const handleSecretDone = () => {
    setCreatedKeyData(null);
  };

  const handleOpenDetails = (key: ProjectMemberApiKey) => {
    setSelectedApiKeyId(key.apiKeyId);
  };

  const handleEditClose = () => {
    removeSelectedApiKeyId();
  };

  const handleEditUpdated = () => {
    removeSelectedApiKeyId();
    void fetchKeys();
  };

  const handleRevokeConfirm = async () => {
    if (!revokingKey) return;
    const keyToRevoke = revokingKey;
    setRevokingKey(null);

    if (keyToRevoke.apiKeyId === selectedApiKeyId) {
      removeSelectedApiKeyId();
    }

    await revokeKey(keyToRevoke.apiKeyId);
  };

  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>My API Keys</h1>
      </header>

      <div className='dm-page-content'>
        {loading ? (
          <div className='text-muted-foreground p-4'>Loading...</div>
        ) : (
          <div className='flex flex-col gap-4'>
            {keys.length === 0 ? (
              <div className='dm-card'>
                <div className='dm-empty-state'>
                  <KeyRound className='dm-empty-state-ico' strokeWidth={1} />
                  <h2 className='dm-empty-state-title'>You don&apos;t have any API keys yet</h2>
                  <p className='dm-empty-state-subtitle'>
                    Create one to allow external tools to access this project as you.
                  </p>
                  <Button
                    variant='outline'
                    onClick={() => {
                      setCreateSheetOpen(true);
                    }}
                  >
                    <Plus className='h-4 w-4' />
                    Create API Key
                  </Button>
                </div>
              </div>
            ) : (
              <ApiKeysTable
                keys={keys}
                onCreateKey={() => {
                  setCreateSheetOpen(true);
                }}
                onOpenDetails={key => {
                  handleOpenDetails(key);
                }}
                onEditName={key => {
                  handleOpenDetails(key);
                }}
                onRevoke={key => {
                  setRevokingKey(key);
                }}
              />
            )}
            <div className='bg-muted/50 rounded-md border-b border-gray-200 px-4 py-3 dark:border-white/2 dark:bg-white/2'>
              <p className='text-muted-foreground text-sm'>
                Personal API keys for your membership in this project. These keys act as you — not
                as the project.
              </p>
            </div>
          </div>
        )}
      </div>

      <CreateApiKeySheet
        isOpen={createSheetOpen}
        onClose={() => {
          setCreateSheetOpen(false);
        }}
        onCreated={handleCreated}
      />

      <EditApiKeySheet
        apiKey={selectedApiKey}
        onClose={handleEditClose}
        onUpdated={handleEditUpdated}
        onRevoke={key => {
          setRevokingKey(key);
        }}
      />

      <SecretRevealDialog data={createdKeyData} onDone={handleSecretDone} />

      <ConfirmationDialog
        open={!!revokingKey}
        onOpenChange={open => {
          if (!open) setRevokingKey(null);
        }}
        title='Revoke API Key'
        description={
          <>
            Are you sure you want to revoke <strong>{revokingKey?.name}</strong>? This action cannot
            be undone. Any integrations using this key will stop working immediately.
          </>
        }
        confirmLabel='Revoke'
        variant='destructive'
        onConfirm={() => {
          void handleRevokeConfirm();
        }}
      />
    </div>
  );
}
