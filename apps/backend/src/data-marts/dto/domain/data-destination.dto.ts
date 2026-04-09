import { z } from 'zod';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { GoogleSheetsCredentialsSchema } from '../../data-destination-types/google-sheets/schemas/google-sheets-credentials.schema';
import { LookerStudioConnectorCredentialsSchema } from '../../data-destination-types/looker-studio-connector/schemas/looker-studio-connector-credentials.schema';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';

export const DataDestinationCredentialsDtoSchema = z.discriminatedUnion('type', [
  GoogleSheetsCredentialsSchema,
  LookerStudioConnectorCredentialsSchema.extend({ destinationId: z.string() }),
]);

export type DataDestinationCredentialsDto = z.infer<typeof DataDestinationCredentialsDtoSchema>;

export class DataDestinationDto {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly type: DataDestinationType,
    public readonly projectId: string,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date,
    public readonly credentialId: string | null | undefined = undefined,
    public readonly createdByUser: UserProjectionDto | null = null,
    public readonly ownerUsers: UserProjectionDto[] = [],
    public readonly availableForUse: boolean = true,
    public readonly availableForMaintenance: boolean = true
  ) {}
}
