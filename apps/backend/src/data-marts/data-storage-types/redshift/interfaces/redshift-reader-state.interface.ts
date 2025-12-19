import { DataStorageType } from '../../enums/data-storage-type.enum';

export interface RedshiftReaderState {
  type: DataStorageType.AWS_REDSHIFT;
  statementId: string;
}
