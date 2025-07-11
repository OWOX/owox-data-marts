import { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';

export class UpdateDataMartSchemaCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly schema: DataMartSchema
  ) {}
}
