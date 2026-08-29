import { useMemo } from 'react';
import { Combobox } from '../../../../shared/components/Combobox/combobox';
import type { DataStorageListItem } from '../../../data-storage/shared/model/types/data-storage-list';
import { DataStorageTypeModel } from '../../../data-storage/shared/types/data-storage-type.model';

interface ModelCanvasStorageSelectProps {
  storages: DataStorageListItem[];
  storageId: string | null;
  onStorageChange: (id: string) => void;
  className?: string;
}

/** Storage picker rendered in the Models page header; storages are sorted alphabetically and shown with their type icon. */
export function ModelCanvasStorageSelect(props: ModelCanvasStorageSelectProps) {
  const { storageOptions, storageIcons } = useMemo(() => {
    const sorted = [...props.storages].sort((a, b) => a.title.localeCompare(b.title));
    return {
      storageOptions: sorted.map(storage => ({ value: storage.id, label: storage.title })),
      storageIcons: new Map(
        sorted.map(storage => [storage.id, DataStorageTypeModel.getInfo(storage.type).icon])
      ),
    };
  }, [props.storages]);

  return (
    <div className={props.className}>
      <label className='contents' aria-label='Storage'>
        <Combobox
          options={storageOptions}
          value={props.storageId ?? ''}
          onValueChange={props.onStorageChange}
          placeholder='Select storage'
          emptyMessage='No storages found'
          className='bg-muted/50 h-12 shrink border-0 text-xl shadow-none md:text-2xl [&>svg]:ml-0 [&>svg]:self-center'
          renderLabel={(option, context) => {
            const Icon = storageIcons.get(option.value);
            return (
              <div className='flex min-w-0 flex-1 items-center gap-2'>
                {Icon && (
                  <Icon
                    size={context === 'trigger' ? 24 : 16}
                    className={context === 'trigger' ? 'size-6 shrink-0' : 'shrink-0'}
                  />
                )}
                <span className='min-w-0 truncate'>{option.label}</span>
              </div>
            );
          }}
        />
      </label>
    </div>
  );
}
