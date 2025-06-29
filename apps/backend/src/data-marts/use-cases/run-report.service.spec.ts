import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RunReportService } from './run-report.service';
import { Report } from '../entities/report.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { BigQueryReportReader } from '../data-storage-types/bigquery/services/bigquery-report-reader.service';
import { AthenaReportReader } from '../data-storage-types/athena/services/athena-report-reader.service';
import { GoogleSheetsReportWriter } from '../data-destination-types/google-sheets/services/google-sheets-report-writer';
import { SqlDefinition } from '../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { GoogleSheetsConfig } from '../data-destination-types/google-sheets/schemas/google-sheets-config.schema';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { RunReportCommand } from '../dto/domain/run-report.command';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DATA_DESTINATION_REPORT_WRITER_RESOLVER } from '../data-destination-types/data-destination-providers';
import { SheetHeaderFormatter } from '../data-destination-types/google-sheets/services/sheet-formatters/sheet-header-formatter';
import { SheetMetadataFormatter } from '../data-destination-types/google-sheets/services/sheet-formatters/sheet-metadata-formatter';
import { GoogleSheetsApiAdapterFactory } from '../data-destination-types/google-sheets/adapters/google-sheets-api-adapter.factory';
import { BigQueryApiAdapterFactory } from '../data-storage-types/bigquery/adapters/bigquery-api-adapter.factory';
import { AthenaApiAdapterFactory } from '../data-storage-types/athena/adapters/athena-api-adapter.factory';
import { S3ApiAdapterFactory } from '../data-storage-types/athena/adapters/s3-api-adapter.factory';

describe.skip('RunReportService', () => {
  let service: RunReportService;
  let reportRepository: Repository<Report>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunReportService,
        BigQueryReportReader,
        AthenaReportReader,
        GoogleSheetsReportWriter,
        SheetHeaderFormatter,
        SheetMetadataFormatter,
        GoogleSheetsApiAdapterFactory,
        BigQueryApiAdapterFactory,
        AthenaApiAdapterFactory,
        S3ApiAdapterFactory,
        {
          provide: getRepositoryToken(Report),
          useClass: Repository,
        },
        {
          provide: DATA_STORAGE_REPORT_READER_RESOLVER,
          useFactory: () => {
            return {
              resolve: (type: DataStorageType) => {
                if (type === DataStorageType.GOOGLE_BIGQUERY) {
                  return module.resolve<BigQueryReportReader>(BigQueryReportReader);
                }
                if (type === DataStorageType.AWS_ATHENA) {
                  return module.resolve<AthenaReportReader>(AthenaReportReader);
                }
                return null;
              },
            };
          },
        },
        {
          provide: DATA_DESTINATION_REPORT_WRITER_RESOLVER,
          useFactory: () => {
            return {
              resolve: (type: DataDestinationType) => {
                if (type === DataDestinationType.GOOGLE_SHEETS) {
                  return module.resolve<GoogleSheetsReportWriter>(GoogleSheetsReportWriter);
                }
                return null;
              },
            };
          },
        },
      ],
    }).compile();

    service = module.get<RunReportService>(RunReportService);
    reportRepository = module.get<Repository<Report>>(getRepositoryToken(Report));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Manual Test for RunReportService', () => {
    /**
     * Manual test for running a report with BigQuery as data source and Google Sheets as destination.
     *
     * To use this test:
     * 1. Replace the SERVICE_ACCOUNT_KEY with your actual service account key JSON
     * 2. Configure the SQL_QUERY, SPREADSHEET_ID, and SHEET_ID as needed
     * 3. Uncomment the test and run it with: npm test -- -t "should run a report manually"
     */
    it.skip(
      'should run a report with BigQuery',
      async () => {
        // ============= CONFIGURATION (MODIFY THESE VALUES) =============

        // Service account key for both BigQuery and Google Sheets
        // This should be a JSON string of your service account key
        const SERVICE_ACCOUNT_KEY = ``;

        // BigQuery configuration
        const BQ_PROJECT_ID = '';
        const BQ_LOCATION = 'us'; // e.g., 'us', 'eu', etc.

        // SQL query to execute
        const SQL_QUERY = '';

        // Google Sheets configuration
        const SPREADSHEET_ID = '1hKsqRGXCsLeOOK1VFE6GYt7j5JGJp1YMmy37NfCwoes'; // ID from the URL of your Google Sheet
        const SHEET_ID = 1037644677; // Usually 0 for the first sheet, or find the gid in the URL

        // ===============================================================

        // Parse the service account key to extract client_email
        const parsedCreds = JSON.parse(SERVICE_ACCOUNT_KEY);

        // Create data storage (BigQuery)
        const dataStorage: DataStorage = {
          id: 'test-storage-id',
          type: DataStorageType.GOOGLE_BIGQUERY,
          projectId: BQ_PROJECT_ID,
          credentials: parsedCreds,
          config: {
            projectId: BQ_PROJECT_ID,
            location: BQ_LOCATION,
          },
          createdAt: new Date(),
          modifiedAt: new Date(),
        };

        // Create data destination (Google Sheets)
        const dataDestination: DataDestination = {
          id: 'test-destination-id',
          title: 'Test Google Sheets Destination',
          type: DataDestinationType.GOOGLE_SHEETS,
          projectId: BQ_PROJECT_ID,
          credentials: {
            type: 'google-sheets-credentials',
            serviceAccountKey: parsedCreds,
          },
          createdAt: new Date(),
          modifiedAt: new Date(),
        };

        // Create SQL definition
        const sqlDefinition: SqlDefinition = {
          sqlQuery: SQL_QUERY,
        };

        // Create data mart
        const dataMart: DataMart = {
          id: 'test-datamart-id',
          title: 'Test Data Mart',
          storage: dataStorage,
          status: DataMartStatus.PUBLISHED,
          definitionType: DataMartDefinitionType.SQL,
          definition: sqlDefinition,
          projectId: BQ_PROJECT_ID,
          createdById: 'test-user',
          createdAt: new Date(),
          modifiedAt: new Date(),
        };

        // Create Google Sheets config
        const sheetsConfig: GoogleSheetsConfig = {
          type: 'google-sheets-config',
          spreadsheetId: SPREADSHEET_ID,
          sheetId: SHEET_ID,
        };

        // Create report
        const report: Report = {
          id: 'test-report-id',
          title: 'Test Report',
          dataMart: dataMart,
          dataDestination: dataDestination,
          destinationConfig: sheetsConfig,
          runsCount: 0,
          createdAt: new Date(),
          modifiedAt: new Date(),
        };

        // Mock repository to return our test report
        jest.spyOn(reportRepository, 'findOne').mockResolvedValue(report);
        jest.spyOn(reportRepository, 'save').mockResolvedValue(report);

        // Note: We're using real services for everything except the repository
        // This means BigQueryReportReader and GoogleSheetsReportWriter will use their actual implementations
        // The TypeResolver has been configured to return the real service instances

        // Run the report
        const command = { reportId: 'test-report-id' } as RunReportCommand;
        await service.run(command);
      },
      5 * 60 * 1000
    ); // Increase timeout for BigQuery operations

    /**
     * Manual test for running a report with AWS Athena as data source and Google Sheets as destination.
     *
     * To use this test:
     * 1. Configure the AWS credentials (ACCESS_KEY_ID, SECRET_ACCESS_KEY)
     * 2. Configure the AWS_REGION, DATABASE_NAME, OUTPUT_BUCKET, and SQL_QUERY
     * 3. Configure the SPREADSHEET_ID and SHEET_ID for Google Sheets
     * 4. Uncomment the test and run it with: npm test -- -t "should run a report with Athena"
     */
    it.skip(
      'should run a report with Athena',
      async () => {
        // ============= CONFIGURATION (MODIFY THESE VALUES) =============

        // AWS Credentials
        const ACCESS_KEY_ID = '';
        const SECRET_ACCESS_KEY = '';
        const SESSION_TOKEN = ''; // Optional

        // Athena configuration
        const AWS_REGION = '';
        const DATABASE_NAME = '';
        const OUTPUT_BUCKET = '';

        // SQL query to execute
        const SQL_QUERY = '';

        // Google Sheets configuration
        const SPREADSHEET_ID = '1hKsqRGXCsLeOOK1VFE6GYt7j5JGJp1YMmy37NfCwoes'; // ID from the URL of your Google Sheet
        const SHEET_ID = 599439254; // Usually 0 for the first sheet, or find the gid in the URL

        // Service account key for Google Sheets
        // This should be a JSON string of your service account key
        const GOOGLE_SERVICE_ACCOUNT_KEY = ``;

        // ===============================================================

        // Parse the Google service account key
        const parsedGoogleCreds = JSON.parse(GOOGLE_SERVICE_ACCOUNT_KEY || '{}');

        // Create data storage (Athena)
        const dataStorage: DataStorage = {
          id: 'test-athena-storage-id',
          type: DataStorageType.AWS_ATHENA,
          projectId: 'test-project',
          credentials: {
            accessKeyId: ACCESS_KEY_ID,
            secretAccessKey: SECRET_ACCESS_KEY,
            sessionToken: SESSION_TOKEN,
          },
          config: {
            region: AWS_REGION,
            databaseName: DATABASE_NAME,
            outputBucket: OUTPUT_BUCKET,
          },
          createdAt: new Date(),
          modifiedAt: new Date(),
        };

        // Create data destination (Google Sheets)
        const dataDestination: DataDestination = {
          id: 'test-destination-id',
          title: 'Test Google Sheets Destination',
          type: DataDestinationType.GOOGLE_SHEETS,
          projectId: 'test-project',
          credentials: {
            type: 'google-sheets-credentials',
            serviceAccountKey: parsedGoogleCreds,
          },
          createdAt: new Date(),
          modifiedAt: new Date(),
        };

        // Create SQL definition
        const sqlDefinition: SqlDefinition = {
          sqlQuery: SQL_QUERY,
        };

        // Create data mart
        const dataMart: DataMart = {
          id: 'test-datamart-id',
          title: 'Test Athena Data Mart',
          storage: dataStorage,
          status: DataMartStatus.PUBLISHED,
          definitionType: DataMartDefinitionType.SQL,
          definition: sqlDefinition,
          projectId: 'test-project',
          createdById: 'test-user',
          createdAt: new Date(),
          modifiedAt: new Date(),
        };

        // Create Google Sheets config
        const sheetsConfig: GoogleSheetsConfig = {
          type: 'google-sheets-config',
          spreadsheetId: SPREADSHEET_ID,
          sheetId: SHEET_ID,
        };

        // Create report
        const report: Report = {
          id: 'test-athena-report-id',
          title: 'Test Athena Report',
          dataMart: dataMart,
          dataDestination: dataDestination,
          destinationConfig: sheetsConfig,
          runsCount: 0,
          createdAt: new Date(),
          modifiedAt: new Date(),
        };

        // Mock repository to return our test report
        jest.spyOn(reportRepository, 'findOne').mockResolvedValue(report);
        jest.spyOn(reportRepository, 'save').mockResolvedValue(report);

        // Run the report
        const command = { reportId: 'test-athena-report-id' } as RunReportCommand;
        await service.run(command);
      },
      5 * 60 * 1000
    ); // Increase timeout for Athena operations
  });
});
