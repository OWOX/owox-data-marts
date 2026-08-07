import { useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { LicenseKeysTable } from '../../features/license-keys/components/LicenseKeysTable/LicenseKeysTable';
import { CreateLicenseKeySheet } from '../../features/license-keys/components/CreateLicenseKeySheet';
import { EditLicenseKeySheet } from '../../features/license-keys/components/EditLicenseKeySheet';
import { LicenseKeyRevealDialog } from '../../features/license-keys/components/LicenseKeyRevealDialog';
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog/ConfirmationDialog';
import { useLicenseKeys } from '../../features/license-keys/hooks/useLicenseKeys';
import type { CreateLicenseKeyResponse, LicenseKey } from '../../features/license-keys/types';

export function LicenseKeysTab() {
  const { keys, loading, fetchKeys, revokeKey } = useLicenseKeys();
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<LicenseKey | null>(null);
  const [revokingKey, setRevokingKey] = useState<LicenseKey | null>(null);
  const [createdKeyData, setCreatedKeyData] = useState<CreateLicenseKeyResponse | null>(null);

  const handleCreated = (result: CreateLicenseKeyResponse) => {
    setCreateSheetOpen(false);
    setCreatedKeyData(result);
    void fetchKeys();
  };

  const handleRevokeConfirm = async () => {
    if (!revokingKey) return;
    const keyToRevoke = revokingKey;
    setRevokingKey(null);
    setEditingKey(null);
    await revokeKey(keyToRevoke.licenseKeyId);
  };

  return (
    <div className='dm-page-content'>
      {loading ? (
        <div className='text-muted-foreground p-4'>Loading...</div>
      ) : (
        <div className='flex flex-col gap-4'>
          {keys.length === 0 ? (
            <div className='dm-card'>
              <div className='dm-empty-state'>
                <ShieldCheck className='dm-empty-state-ico' strokeWidth={1} />
                <h2 className='dm-empty-state-title'>
                  This project doesn&apos;t have any license keys yet
                </h2>
                <p className='dm-empty-state-subtitle'>
                  Create one to let a deployment run reports and bill them to this project.
                </p>
                <Button
                  variant='outline'
                  onClick={() => {
                    setCreateSheetOpen(true);
                  }}
                >
                  <Plus className='h-4 w-4' />
                  Create license key
                </Button>
              </div>
            </div>
          ) : (
            <LicenseKeysTable
              keys={keys}
              onCreateKey={() => {
                setCreateSheetOpen(true);
              }}
              onOpenDetails={setEditingKey}
              onEditName={setEditingKey}
              onRevoke={setRevokingKey}
            />
          )}
          <div className='bg-muted/50 rounded-md border-b border-gray-200 px-4 py-3 dark:border-white/2 dark:bg-white/2'>
            <p className='text-muted-foreground text-sm'>
              A license key authorizes Report Runs for a single deployment origin and bills them to
              this project. To rotate, create a new key, update the deployment, then revoke the old
              one.
            </p>
          </div>
        </div>
      )}

      <CreateLicenseKeySheet
        isOpen={createSheetOpen}
        onClose={() => {
          setCreateSheetOpen(false);
        }}
        onCreated={handleCreated}
      />

      <EditLicenseKeySheet
        licenseKey={editingKey}
        onClose={() => {
          setEditingKey(null);
        }}
        onUpdated={() => {
          setEditingKey(null);
          void fetchKeys();
        }}
        onRevoke={setRevokingKey}
      />

      <LicenseKeyRevealDialog
        data={createdKeyData}
        onDone={() => {
          setCreatedKeyData(null);
        }}
      />

      <ConfirmationDialog
        open={!!revokingKey}
        onOpenChange={open => {
          if (!open) setRevokingKey(null);
        }}
        title='Revoke license key'
        description={
          <>
            Are you sure you want to revoke <strong>{revokingKey?.name}</strong>? This action cannot
            be undone. The deployment using this key will stop running reports immediately.
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
