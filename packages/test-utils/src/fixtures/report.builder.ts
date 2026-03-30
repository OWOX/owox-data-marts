export interface ReportCreatePayload {
  title: string;
  dataMartId: string;
  dataDestinationId: string;
  destinationConfig: Record<string, unknown>;
}

export class ReportBuilder {
  private payload: ReportCreatePayload = {
    title: 'Test Report',
    dataMartId: '', // Must be set via withDataMartId()
    dataDestinationId: '', // Must be set via withDataDestinationId()
    destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
  };

  withTitle(title: string): this {
    this.payload.title = title;
    return this;
  }

  withDataMartId(dataMartId: string): this {
    this.payload.dataMartId = dataMartId;
    return this;
  }

  withDataDestinationId(dataDestinationId: string): this {
    this.payload.dataDestinationId = dataDestinationId;
    return this;
  }

  withDestinationConfig(config: Record<string, unknown>): this {
    this.payload.destinationConfig = config;
    return this;
  }

  build(): ReportCreatePayload {
    if (!this.payload.dataMartId) {
      throw new Error(
        'ReportBuilder: dataMartId is required. Call .withDataMartId() before .build()',
      );
    }
    if (!this.payload.dataDestinationId) {
      throw new Error(
        'ReportBuilder: dataDestinationId is required. Call .withDataDestinationId() before .build()',
      );
    }
    return { ...this.payload };
  }
}
