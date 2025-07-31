import { DataDestinationAccessValidator } from './interfaces/data-destination-access-validator.interface';
import { DataDestinationCredentialsValidator } from './interfaces/data-destination-credentials-validator.interface';
import { GoogleSheetsAccessValidator } from './google-sheets/services/google-sheets-access-validator';
import { GoogleSheetsCredentialsValidator } from './google-sheets/services/google-sheets-credentials-validator';
import { DataDestinationType } from './enums/data-destination-type.enum';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { GoogleSheetsReportWriter } from './google-sheets/services/google-sheets-report-writer';
import { DataDestinationReportWriter } from './interfaces/data-destination-report-writer.interface';
import { SheetHeaderFormatter } from './google-sheets/services/sheet-formatters/sheet-header-formatter';
import { SheetMetadataFormatter } from './google-sheets/services/sheet-formatters/sheet-metadata-formatter';
import { GoogleSheetsApiAdapterFactory } from './google-sheets/adapters/google-sheets-api-adapter.factory';
import { ModuleRef } from '@nestjs/core';
import { DataDestinationPublicCredentialsFactory } from './factories/data-destination-public-credentials.factory';
import { DataDestinationCredentialsUtils } from './data-destination-credentials.utils';

export const DATA_DESTINATION_ACCESS_VALIDATOR_RESOLVER = Symbol(
  'DATA_DESTINATION_ACCESS_VALIDATOR_RESOLVER'
);
export const DATA_DESTINATION_CREDENTIALS_VALIDATOR_RESOLVER = Symbol(
  'DATA_DESTINATION_CREDENTIALS_VALIDATOR_RESOLVER'
);
export const DATA_DESTINATION_REPORT_WRITER_RESOLVER = Symbol(
  'DATA_DESTINATION_REPORT_WRITER_RESOLVER'
);

const accessValidatorProviders = [GoogleSheetsAccessValidator];
const credentialsValidatorProviders = [GoogleSheetsCredentialsValidator];
const reportWriterProviders = [GoogleSheetsReportWriter];
const googleSheetsUtilityProviders = [SheetHeaderFormatter, SheetMetadataFormatter];
const publicCredentialsProviders = [
  DataDestinationPublicCredentialsFactory,
  DataDestinationCredentialsUtils,
];

export const dataDestinationResolverProviders = [
  ...accessValidatorProviders,
  ...credentialsValidatorProviders,
  ...reportWriterProviders,
  ...googleSheetsUtilityProviders,
  ...publicCredentialsProviders,
  GoogleSheetsApiAdapterFactory,
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
