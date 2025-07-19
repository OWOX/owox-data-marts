import { ModuleRef } from '@nestjs/core';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataDestinationType } from './enums/data-destination-type.enum';
import { GoogleSheetsApiAdapterFactory } from './google-sheets/adapters/google-sheets-api-adapter.factory';
import { GoogleSheetsAccessValidator } from './google-sheets/services/google-sheets-access-validator';
import { GoogleSheetsCredentialsValidator } from './google-sheets/services/google-sheets-credentials-validator';
import { GoogleSheetsReportWriter } from './google-sheets/services/google-sheets-report-writer';
import { SheetHeaderFormatter } from './google-sheets/services/sheet-formatters/sheet-header-formatter';
import { SheetMetadataFormatter } from './google-sheets/services/sheet-formatters/sheet-metadata-formatter';
import { DataDestinationAccessValidator } from './interfaces/data-destination-access-validator.interface';
import { DataDestinationCredentialsValidator } from './interfaces/data-destination-credentials-validator.interface';
import { DataDestinationReportWriter } from './interfaces/data-destination-report-writer.interface';
import { LookerStudioConnectorAccessValidator } from './looker-studio-connector/services/looker-studio-connector-access-validator';
import { LookerStudioConnectorApiConfigService } from './looker-studio-connector/services/looker-studio-connector-api-config.service';
import { LookerStudioConnectorApiService } from './looker-studio-connector/services/looker-studio-connector-api.service';
import { LookerStudioConnectorCredentialsValidator } from './looker-studio-connector/services/looker-studio-connector-credentials-validator';

export const DATA_DESTINATION_ACCESS_VALIDATOR_RESOLVER = Symbol(
  'DATA_DESTINATION_ACCESS_VALIDATOR_RESOLVER'
);
export const DATA_DESTINATION_CREDENTIALS_VALIDATOR_RESOLVER = Symbol(
  'DATA_DESTINATION_CREDENTIALS_VALIDATOR_RESOLVER'
);
export const DATA_DESTINATION_REPORT_WRITER_RESOLVER = Symbol(
  'DATA_DESTINATION_REPORT_WRITER_RESOLVER'
);

const accessValidatorProviders = [
  GoogleSheetsAccessValidator,
  LookerStudioConnectorAccessValidator,
];
const credentialsValidatorProviders = [
  GoogleSheetsCredentialsValidator,
  LookerStudioConnectorCredentialsValidator,
];
const reportWriterProviders = [GoogleSheetsReportWriter];
const googleSheetsUtilityProviders = [SheetHeaderFormatter, SheetMetadataFormatter];

export const dataDestinationResolverProviders = [
  ...accessValidatorProviders,
  ...credentialsValidatorProviders,
  ...reportWriterProviders,
  ...googleSheetsUtilityProviders,
  GoogleSheetsApiAdapterFactory,
  LookerStudioConnectorApiConfigService,
  LookerStudioConnectorApiService,
  {
    provide: DATA_DESTINATION_ACCESS_VALIDATOR_RESOLVER,
    useFactory: (...validators: DataDestinationAccessValidator[]) =>
      new TypeResolver<DataDestinationType, DataDestinationAccessValidator>(validators),
    inject: accessValidatorProviders,
  },
  {
    provide: DATA_DESTINATION_CREDENTIALS_VALIDATOR_RESOLVER,
    useFactory: (...validators: DataDestinationCredentialsValidator[]) =>
      new TypeResolver<DataDestinationType, DataDestinationCredentialsValidator>(validators),
    inject: credentialsValidatorProviders,
  },
  {
    provide: DATA_DESTINATION_REPORT_WRITER_RESOLVER,
    useFactory: (moduleRef: ModuleRef, ...writers: DataDestinationReportWriter[]) =>
      new TypeResolver<DataDestinationType, DataDestinationReportWriter>(writers, moduleRef),
    inject: [ModuleRef, ...reportWriterProviders],
  },
];
