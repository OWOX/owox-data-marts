import { DataDestinationType } from '../../../../apps/backend/src/data-marts/data-destination-types/enums/data-destination-type.enum';

export interface DataDestinationCreatePayload {
  title: string;
  type: DataDestinationType;
  credentials?: Record<string, unknown>;
}

export class DataDestinationBuilder {
  private payload: DataDestinationCreatePayload = {
    title: 'Test Destination',
    type: DataDestinationType.GOOGLE_SHEETS,
  };

  withTitle(title: string): this {
    this.payload.title = title;
    return this;
  }

  withType(type: DataDestinationType): this {
    this.payload.type = type;
    return this;
  }

  withCredentials(credentials: Record<string, unknown>): this {
    this.payload.credentials = credentials;
    return this;
  }

  build(): DataDestinationCreatePayload {
    return { ...this.payload };
  }
}
