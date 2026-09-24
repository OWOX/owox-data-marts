import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUrl,
  MaxLength,
  ValidateBy,
} from 'class-validator';
import { z } from 'zod';
import { DataDestinationType } from '../../../data-marts/data-destination-types/enums/data-destination-type.enum';
import { DataStorageType } from '../../../data-marts/data-storage-types/enums/data-storage-type.enum';
import {
  REPORT_RUN_KINDS,
  RunKind,
} from '../../../data-marts/services/project-billing/project-billing.service';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';

const id = z.string().trim().min(1);
const baseConsumptionPayload = z
  .object({
    projectId: id,
    dataMartId: id,
    dataStorageId: id,
    dataStorageType: z.nativeEnum(DataStorageType),
    runTime: z.string().datetime(),
  })
  .passthrough();
const reportConsumptionPayload = baseConsumptionPayload.extend({
  reportId: id,
  reportRunId: id,
  dataDestinationId: id,
  dataDestinationType: z.nativeEnum(DataDestinationType),
});
const consumptionPayloadSchemas: Partial<Record<RunKind, z.ZodTypeAny>> = {
  [RunKind.SHEETS_REPORT_RUN]: reportConsumptionPayload.extend({
    dataDestinationType: z.literal(DataDestinationType.GOOGLE_SHEETS),
    googleSheetsDocumentId: id,
    googleSheetsListId: z.union([id, z.number().int().nonnegative()]),
  }),
  [RunKind.LOOKER_REPORT_RUN]: reportConsumptionPayload.extend({
    dataDestinationType: z.literal(DataDestinationType.LOOKER_STUDIO),
  }),
  // Same shape as any other pulled report: the workbook is not addressable from here, so there
  // is nothing destination-specific to carry — unlike Google Sheets, which names a document.
  [RunKind.EXCEL_REPORT_RUN]: reportConsumptionPayload.extend({
    dataDestinationType: z.literal(DataDestinationType.EXCEL),
  }),
  [RunKind.EMAIL_BASED_REPORT_RUN]: reportConsumptionPayload.extend({
    dataDestinationType: z.union([
      z.literal(DataDestinationType.EMAIL),
      z.literal(DataDestinationType.SLACK),
      z.literal(DataDestinationType.MS_TEAMS),
      z.literal(DataDestinationType.GOOGLE_CHAT),
    ]),
  }),
  [RunKind.HTTP_DATA_RUN]: baseConsumptionPayload.extend({ reportRunId: id }),
  [RunKind.MCP_QUERY_RUN]: baseConsumptionPayload.extend({ runId: id }),
};

export class CreateLicenseKeyRequestDto {
  @ApiProperty({ description: 'Human-readable key name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Public origin of the deployment the key is bound to',
    example: 'https://data-marts.example.com',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true, require_tld: false },
    {
      message:
        'Public origin must be a full http or https address, for example https://data-marts.example.com',
    }
  )
  origin: string;
}

export class UpdateLicenseKeyRequestDto {
  @ApiProperty({ description: 'Human-readable key name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}

export class LicenseKeyResponseDto {
  @ApiProperty() licenseKeyId: string;
  @ApiProperty() name: string;
  @ApiProperty() origin: string;
  @ApiProperty() expiresAt: string;
  @ApiProperty({ nullable: true }) lastUsedAt: string | null;
  @ApiProperty() createdAt: string;
  @ApiProperty({ type: UserProjectionDto, nullable: true })
  createdByUser: UserProjectionDto | null;
}

export class CreateLicenseKeyResponseDto extends LicenseKeyResponseDto {
  @ApiProperty({ description: 'Full license key, shown once and never stored' })
  licenseKey: string;
}

export class LicenseConsumptionRequestDto {
  @ApiProperty({ enum: REPORT_RUN_KINDS })
  @IsIn(REPORT_RUN_KINDS)
  kind: RunKind;

  @ApiProperty({ type: Object })
  @IsObject()
  @ValidateBy({
    name: 'isLicenseConsumptionPayload',
    validator: {
      validate: (payload, args) => {
        if (!args) return false;
        const { kind } = args.object as LicenseConsumptionRequestDto;
        return consumptionPayloadSchemas[kind]?.safeParse(payload).success ?? false;
      },
      defaultMessage: () => 'payload does not match the selected Report Run kind',
    },
  })
  payload: Record<string, unknown>;
}
