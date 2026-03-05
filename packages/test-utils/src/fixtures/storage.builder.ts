import { DataStorageType } from '../../../../apps/backend/src/data-marts/data-storage-types/enums/data-storage-type.enum';

export interface StorageCreatePayload {
  type: DataStorageType;
}

export class StorageBuilder {
  private payload: StorageCreatePayload = {
    type: DataStorageType.GOOGLE_BIGQUERY,
  };

  withType(type: DataStorageType): this {
    this.payload.type = type;
    return this;
  }

  build(): StorageCreatePayload {
    return { ...this.payload };
  }
}
