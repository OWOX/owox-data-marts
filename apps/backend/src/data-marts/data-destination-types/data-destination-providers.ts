import { ModuleRef } from '@nestjs/core';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { AvailableDestinationTypesService } from './available-destination-types.service';
import {
  EmailReportWriter,
  GoogleChatReportWriter,
  MsTeamsReportWriter,
  SlackReportWriter,
} from './ee/email/services/email-report-writer';
import { DataDestinationType } from './enums/data-destination-type.enum';
import { GoogleSheetsApiAdapterFactory } from './google-sheets/adapters/google-sheets-api-adapter.factory';
import { GoogleSheetsAccessValidator } from './google-sheets/services/google-sheets-access-validator';
import { GoogleSheetsCredentialsValidator } from './google-sheets/services/google-sheets-credentials-validator';
import { GoogleSheetsReportWriter } from './google-sheets/services/google-sheets-report-writer';
import { SheetHeaderFormatter } from './google-sheets/services/sheet-formatters/sheet-header-formatter';
import { SheetMetadataFormatter } from './google-sheets/services/sheet-formatters/sheet-metadata-formatter';
import { DataDestinationPublicCredentialsFactory } from './factories/data-destination-public-credentials.factory';
import { DataDestinationCredentialsUtils } from './data-destination-credentials.utils';
import { SheetValuesFormatter } from './google-sheets/services/sheet-formatters/sheet-values-formatter';
import { DataDestinationAccessValidator } from './interfaces/data-destination-access-validator.interface';
import { DataDestinationCredentialsValidator } from './interfaces/data-destination-credentials-validator.interface';
import { DataDestinationCredentialsProcessor } from './interfaces/data-destination-credentials-processor.interface';
import { DataDestinationReportWriter } from './interfaces/data-destination-report-writer.interface';
import { DataDestinationSecretKeyRotator } from './interfaces/data-destination-secret-key-rotator.interface';
import { LookerStudioConnectorAccessValidator } from './looker-studio-connector/services/looker-studio-connector-access-validator';
import { LookerStudioConnectorApiConfigService } from './looker-studio-connector/services/looker-studio-connector-api-config.service';
import { LookerStudioConnectorApiDataService } from './looker-studio-connector/services/looker-studio-connector-api-data.service';
import { LookerStudioConnectorApiSchemaService } from './looker-studio-connector/services/looker-studio-connector-api-schema.service';
import { LookerStudioConnectorApiService } from './looker-studio-connector/services/looker-studio-connector-api.service';
import { LookerStudioConnectorCredentialsValidator } from './looker-studio-connector/services/looker-studio-connector-credentials-validator';
import { LookerStudioConnectorCredentialsProcessor } from './looker-studio-connector/services/looker-studio-connector-credentials-processor';
import { LookerStudioConnectorSecretKeyRotator } from './looker-studio-connector/services/looker-studio-connector-secret-key-rotator';
import { LookerStudioTypeMapperService } from './looker-studio-connector/services/looker-studio-type-mapper.service';
import {
  EmailAccessValidator,
  GoogleChatAccessValidator,
  MsTeamsAccessValidator,
  SlackAccessValidator,
} from './ee/email/services/email-access-validator';
import {
  EmailCredentialsValidator,
  GoogleChatCredentialsValidator,
  MsTeamsCredentialsValidator,
  SlackCredentialsValidator,
} from './ee/email/services/email-credentials-validator';

export const DATA_DESTINATION_ACCESS_VALIDATOR_RESOLVER = Symbol(
  'DATA_DESTINATION_ACCESS_VALIDATOR_RESOLVER'
);
export const DATA_DESTINATION_CREDENTIALS_VALIDATOR_RESOLVER = Symbol(
  'DATA_DESTINATION_CREDENTIALS_VALIDATOR_RESOLVER'
);
export const DATA_DESTINATION_CREDENTIALS_PROCESSOR_RESOLVER = Symbol(
  'DATA_DESTINATION_CREDENTIALS_PROCESSOR_RESOLVER'
);
export const DATA_DESTINATION_REPORT_WRITER_RESOLVER = Symbol(
  'DATA_DESTINATION_REPORT_WRITER_RESOLVER'
);
export const DATA_DESTINATION_SECRET_KEY_ROTATOR_RESOLVER = Symbol(
  'DATA_DESTINATION_SECRET_KEY_ROTATOR_RESOLVER'
);

const accessValidatorProviders = [
  GoogleSheetsAccessValidator,
  LookerStudioConnectorAccessValidator,
  EmailAccessValidator,
  SlackAccessValidator,
  MsTeamsAccessValidator,
  GoogleChatAccessValidator,
];
const credentialsValidatorProviders = [
  GoogleSheetsCredentialsValidator,
  LookerStudioConnectorCredentialsValidator,
  EmailCredentialsValidator,
  SlackCredentialsValidator,
  MsTeamsCredentialsValidator,
  GoogleChatCredentialsValidator,
];
const credentialsProcessorProviders = [LookerStudioConnectorCredentialsProcessor];
const secretKeyRotatorProviders = [LookerStudioConnectorSecretKeyRotator];
const reportWriterProviders = [
  GoogleSheetsReportWriter,
  EmailReportWriter,
  SlackReportWriter,
  MsTeamsReportWriter,
  GoogleChatReportWriter,
];
const googleSheetsUtilityProviders = [
  SheetHeaderFormatter,
  SheetMetadataFormatter,
  SheetValuesFormatter,
];
const publicCredentialsProviders = [
  DataDestinationPublicCredentialsFactory,
  DataDestinationCredentialsUtils,
];

export const dataDestinationResolverProviders = [
  AvailableDestinationTypesService,
  ...accessValidatorProviders,
  ...credentialsValidatorProviders,
  ...credentialsProcessorProviders,
  ...secretKeyRotatorProviders,
  ...reportWriterProviders,
  ...googleSheetsUtilityProviders,
  ...publicCredentialsProviders,
  GoogleSheetsApiAdapterFactory,
  LookerStudioConnectorApiConfigService,
  LookerStudioConnectorApiSchemaService,
  LookerStudioConnectorApiDataService,
  LookerStudioConnectorApiService,
  LookerStudioTypeMapperService,
  {
    provide: DATA_DESTINATION_ACCESS_VALIDATOR_RESOLVER,
    useFactory: (
      available: AvailableDestinationTypesService,
      ...validators: DataDestinationAccessValidator[]
    ) => {
      const allowed = validators.filter(v => available.isAllowed(v.type));
      return new TypeResolver<DataDestinationType, DataDestinationAccessValidator>(allowed);
    },
    inject: [AvailableDestinationTypesService, ...accessValidatorProviders],
  },
  {
    provide: DATA_DESTINATION_CREDENTIALS_VALIDATOR_RESOLVER,
    useFactory: (
      available: AvailableDestinationTypesService,
      ...validators: DataDestinationCredentialsValidator[]
    ) => {
      const allowed = validators.filter(v => available.isAllowed(v.type));
      return new TypeResolver<DataDestinationType, DataDestinationCredentialsValidator>(allowed);
    },
    inject: [AvailableDestinationTypesService, ...credentialsValidatorProviders],
  },
  {
    provide: DATA_DESTINATION_CREDENTIALS_PROCESSOR_RESOLVER,
    useFactory: (
      available: AvailableDestinationTypesService,
      ...processors: DataDestinationCredentialsProcessor[]
    ) => {
      const allowed = processors.filter(p => available.isAllowed(p.type));
      return new TypeResolver<DataDestinationType, DataDestinationCredentialsProcessor>(allowed);
    },
    inject: [AvailableDestinationTypesService, ...credentialsProcessorProviders],
  },
  {
    provide: DATA_DESTINATION_REPORT_WRITER_RESOLVER,
    useFactory: (
      moduleRef: ModuleRef,
      available: AvailableDestinationTypesService,
      ...writers: DataDestinationReportWriter[]
    ) => {
      const allowed = writers.filter(w => available.isAllowed(w.type));
      return new TypeResolver<DataDestinationType, DataDestinationReportWriter>(allowed, moduleRef);
    },
    inject: [ModuleRef, AvailableDestinationTypesService, ...reportWriterProviders],
  },
  {
    provide: DATA_DESTINATION_SECRET_KEY_ROTATOR_RESOLVER,
    useFactory: (
      available: AvailableDestinationTypesService,
      ...rotators: DataDestinationSecretKeyRotator[]
    ) => {
      const allowed = rotators.filter(r => available.isAllowed(r.type));
      return new TypeResolver<DataDestinationType, DataDestinationSecretKeyRotator>(allowed);
    },
    inject: [AvailableDestinationTypesService, ...secretKeyRotatorProviders],
  },
];
