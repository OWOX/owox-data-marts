import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '../../../../../shared/components/Button';
import { Combobox } from '../../../../../shared/components/Combobox/combobox';
import { generateUniqueAlias, slugify } from '../../../../../utils/string-utils';
import { dataMartService } from '../../../shared';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';

interface TargetDataMartPickerProps {
  dataMartId: string;
  storageId: string;
  existingRelationships: DataMartRelationship[];
  onCreated: (relationship: DataMartRelationship) => void;
  onCancel: () => void;
}

export function TargetDataMartPicker({
  dataMartId,
  storageId,
  existingRelationships,
  onCreated,
  onCancel,
}: TargetDataMartPickerProps) {
  const [availableDMs, setAvailableDMs] = useState<{ id: string; title: string }[]>([]);
  const [isLoadingDMs, setIsLoadingDMs] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!dataMartId || !storageId) return;
    setIsLoadingDMs(true);
    void (async () => {
      try {
        const [allDMs, srcDM] = await Promise.all([
          dataMartService.getDataMarts(),
          dataMartService.getDataMartById(dataMartId),
        ]);

        const filtered = allDMs
          .filter(dm => dm.id !== dataMartId && dm.storage.title === srcDM.storage.title)
          .map(dm => ({ id: dm.id, title: dm.title }));

        setAvailableDMs(filtered);
      } finally {
        setIsLoadingDMs(false);
      }
    })();
  }, [dataMartId, storageId]);

  const handleSelect = async (targetDMId: string) => {
    if (isCreating) return;
    const dm = availableDMs.find(d => d.id === targetDMId);
    if (!dm) return;

    setIsCreating(true);
    try {
      const takenAliases = new Set(existingRelationships.map(r => r.targetAlias));
      const targetAlias = generateUniqueAlias(slugify(dm.title), takenAliases);

      const created = await dataMartRelationshipService.createRelationship(dataMartId, {
        targetDataMartId: targetDMId,
        targetAlias,
        joinConditions: [],
      });
      onCreated(created);
    } catch {
      toast.error('Failed to add relationship');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className='flex items-center gap-2 pt-2'>
      <div className='w-72'>
        <Combobox
          options={availableDMs.map(dm => ({ value: dm.id, label: dm.title }))}
          value=''
          onValueChange={v => {
            void handleSelect(v);
          }}
          placeholder={isLoadingDMs ? 'Loading...' : isCreating ? 'Adding...' : 'Search data mart'}
          disabled={isLoadingDMs || isCreating}
        />
      </div>
      <Button type='button' variant='ghost' size='sm' onClick={onCancel} aria-label='Cancel'>
        <X className='h-4 w-4' />
        Cancel
      </Button>
    </div>
  );
}
