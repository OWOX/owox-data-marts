import { useState } from 'react';
import { Button } from '@owox/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@owox/ui/components/dialog';
import { Input } from '@owox/ui/components/input';
import { Label } from '@owox/ui/components/label';
import { apiErrorMessage } from '../../../../app/api';
import type { OwoxStorageLocation } from '../api/types';
import { useDataStorage } from '../model/hooks/useDataStorage';
import type { DataStorage } from '../model/types/data-storage';

interface OwoxStorageCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (storage: DataStorage) => void | Promise<void>;
}

const LOCATIONS: OwoxStorageLocation[] = ['US', 'EU'];

export const OwoxStorageCreateDialog = ({
  isOpen,
  onClose,
  onCreated,
}: OwoxStorageCreateDialogProps) => {
  const { createOwoxStorage } = useDataStorage();
  const [title, setTitle] = useState('OWOX Storage');
  const [location, setLocation] = useState<OwoxStorageLocation | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = title.trim().length > 0 && location !== null && !isCreating;

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (isCreating || !title.trim() || !location) return;
    setIsCreating(true);
    setError(null);
    try {
      const storage = await createOwoxStorage({ title: title.trim(), location });
      onClose();
      await onCreated(storage);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create the storage'));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open && !isCreating) onClose();
      }}
    >
      <DialogContent className='sm:max-w-sm' data-testid='owoxStorageCreateDialog'>
        <form onSubmit={e => void handleSubmit(e)} className='flex flex-col gap-4'>
          <DialogHeader>
            <DialogTitle>New OWOX Storage</DialogTitle>
            <DialogDescription>
              OWOX creates and hosts the storage for you. The location cannot be changed later.
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='owox-storage-title'>Title</Label>
            <Input
              id='owox-storage-title'
              value={title}
              maxLength={255}
              disabled={isCreating}
              onChange={e => {
                setTitle(e.target.value);
              }}
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label id='owox-storage-location-label'>Location</Label>
            <div
              role='radiogroup'
              aria-labelledby='owox-storage-location-label'
              className='flex gap-2'
            >
              {LOCATIONS.map(item => (
                <Button
                  key={item}
                  type='button'
                  role='radio'
                  aria-checked={location === item}
                  variant={location === item ? 'default' : 'outline'}
                  disabled={isCreating}
                  onClick={() => {
                    setLocation(item);
                  }}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>
          {error && (
            <p role='alert' className='text-destructive text-sm'>
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type='submit' disabled={!canCreate}>
              Create
            </Button>
            <Button type='button' variant='outline' disabled={isCreating} onClick={onClose}>
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
