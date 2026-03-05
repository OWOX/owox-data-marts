export interface DataMartCreatePayload {
  title: string;
  storageId: string;
}

export class DataMartBuilder {
  private payload: DataMartCreatePayload = {
    title: 'Test Data Mart',
    storageId: '', // Must be set via withStorageId()
  };

  withTitle(title: string): this {
    this.payload.title = title;
    return this;
  }

  withStorageId(storageId: string): this {
    this.payload.storageId = storageId;
    return this;
  }

  build(): DataMartCreatePayload {
    if (!this.payload.storageId) {
      throw new Error(
        'DataMartBuilder: storageId is required. Call .withStorageId() before .build()',
      );
    }
    return { ...this.payload };
  }
}
