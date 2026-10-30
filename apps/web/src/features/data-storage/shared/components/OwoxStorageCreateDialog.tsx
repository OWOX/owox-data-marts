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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
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
}: OwoxStorageCreateDialogProps) => (
  <Dialog
    open={isOpen}
    onOpenChange={open => {
      if (!open) onClose();
    }}
  >
    <DialogContent className='sm:max-w-sm' data-testid='owoxStorageCreateDialog'>
      {/* Its state unmounts with the dialog, so a reopened dialog starts empty. */}
      <OwoxStorageCreateForm onClose={onClose} onCreated={onCreated} />
    </DialogContent>
  </Dialog>
);

const OwoxStorageCreateForm = ({
  onClose,
  onCreated,
}: Pick<OwoxStorageCreateDialogProps, 'onClose' | 'onCreated'>) => {
  const { createOwoxStorage } = useDataStorage();
  const [title, setTitle] = useState('OWOX Storage');
  const [location, setLocation] = useState<OwoxStorageLocation | ''>('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = title.trim().length > 0 && location !== '' && !isCreating;

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (isCreating || !title.trim() || !location) return;
    setIsCreating(true);
    setError(null);
    let storage: DataStorage;
    try {
      storage = await createOwoxStorage({ title: title.trim(), location });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create the storage'));
      setIsCreating(false);
      return;
    }
    onClose();
    // The storage exists now; a failing follow-up must not read as a failed create.
    try {
      await onCreated(storage);
    } catch (err) {
      console.error('Failed to open the created storage:', err);
    }
  };

  return (
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
        <Label htmlFor='owox-storage-location'>Location</Label>
        <Select
          value={location}
          disabled={isCreating}
          onValueChange={value => {
            setLocation(value as OwoxStorageLocation);
          }}
        >
          <SelectTrigger id='owox-storage-location' className='w-full'>
            <SelectValue placeholder='Select location' />
          </SelectTrigger>
          <SelectContent>
            {LOCATIONS.map(item => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
  );
};
