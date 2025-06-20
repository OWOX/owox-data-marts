import type { DataStorage } from '../../../data-storage/shared/model/types/data-storage.ts';
import { ListItemCard } from '../../../../shared/components/ListItemCard';
import { DataStorageTypeModel } from '../../../data-storage/shared/types/data-storage-type.model.ts';

interface DataMartDataStorageViewProps {
  dataStorage: DataStorage;
}
export const DataMartDataStorageView = ({ dataStorage }: DataMartDataStorageViewProps) => {
  return (
    <ListItemCard
      title={dataStorage.title}
      icon={DataStorageTypeModel.getInfo(dataStorage.type).icon}
      subtitle={'project-d-dubovyi'}
    ></ListItemCard>
  );
};
