import { DataStorageReportReader } from '../../interfaces/data-storage-report-reader.interface';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { Injectable, Logger, Scope } from '@nestjs/common';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  isSqlDefinition,
  isTableDefinition,
  isTablePatternDefinition,
  isViewDefinition,
  isConnectorDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { TableDefinition } from '../../../dto/schemas/data-mart-table-definitions/table-definition.schema';
import { SqlDefinition } from '../../../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { ViewDefinition } from '../../../dto/schemas/data-mart-table-definitions/view-definition.schema';
import { TablePatternDefinition } from '../../../dto/schemas/data-mart-table-definitions/table-pattern-definition.schema';
import { Report } from '../../../entities/report.entity';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import { BigQueryApiAdapter } from '../adapters/bigquery-api.adapter';
import { Table } from '@google-cloud/bigquery';
import { isBigqueryCredentials } from '../../data-storage-credentials.guards';
import { isBigQueryConfig } from '../../data-storage-config.guards';
import { ConnectorDefinition } from 'src/data-marts/dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { BigQueryCredentials } from '../schemas/bigquery-credentials.schema';
import { BigQueryConfig } from '../schemas/bigquery-config.schema';
import { BigQueryReportFormatterService } from './bigquery-report-formatter.service';

@Injectable({ scope: Scope.TRANSIENT })
export class BigQueryReportReader implements DataStorageReportReader {
  private readonly logger = new Logger(BigQueryReportReader.name);
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

  private adapter: BigQueryApiAdapter;
  private reportResultTable: Table;
  private reportResultHeaders: string[];

  constructor(
    private readonly adapterFactory: BigQueryApiAdapterFactory,
    private readonly formatter: BigQueryReportFormatterService
  ) {}

  public async prepareReportData(report: Report): Promise<ReportDataDescription> {
    const { storage, definition } = report.dataMart;
    if (!storage || !definition) {
      throw new Error('Data Mart is not properly configured');
    }

    if (!isBigqueryCredentials(storage.credentials)) {
      throw new Error('Google BigQuery credentials are not properly configured');
    }

    if (!isBigQueryConfig(storage.config)) {
      throw new Error('Google BigQuery config is not properly configured');
    }

    await this.prepareBigQuery(storage.credentials, storage.config);
    await this.prepareReportResultTable(definition);

    const [metaData] = await this.reportResultTable.getMetadata();
    if (!metaData.numRows || !metaData.schema || !metaData.schema.fields) {
      throw new Error('Failed to get table metadata');
    }

    this.reportResultHeaders = this.formatter.prepareReportResultHeaders(metaData.schema);

    return new ReportDataDescription(this.reportResultHeaders, parseInt(metaData.numRows));
  }

  public async readReportDataBatch(batchId?: string, maxRows = 10000): Promise<ReportDataBatch> {
    if (!this.adapter || !this.reportResultTable) {
      throw new Error('Report data must be prepared before read');
    }

    const [rows, nextBatch] = await this.reportResultTable.getRows({
      pageToken: batchId,
      maxResults: maxRows,
      autoPaginate: false,
    });

    const mappedRows = rows.map(row => this.formatter.getStructuredReportRowData(row));

    return new ReportDataBatch(mappedRows, nextBatch?.pageToken);
  }

  public async finalize(): Promise<void> {
    this.logger.debug('Finalizing report read');
    // no additional actions required
  }

  private async prepareReportResultTable(dataMartDefinition: DataMartDefinition): Promise<void> {
    this.logger.debug('Preparing report result table', dataMartDefinition);
    try {
      if (isTableDefinition(dataMartDefinition)) {
        await this.prepareTableData(dataMartDefinition);
      } else if (isSqlDefinition(dataMartDefinition)) {
        await this.prepareSqlData(dataMartDefinition);
      } else if (isViewDefinition(dataMartDefinition)) {
        await this.prepareViewData(dataMartDefinition);
      } else if (isTablePatternDefinition(dataMartDefinition)) {
        await this.prepareTablePatternData(dataMartDefinition);
      } else if (isConnectorDefinition(dataMartDefinition)) {
        await this.prepareConnectorData(dataMartDefinition);
      } else {
        throw new Error('Invalid data mart definition');
      }
    } catch (error) {
      this.logger.error('Failed to prepare report data', error);
      throw error;
    }
  }

  private async prepareSqlData(dataMartDefinition: SqlDefinition): Promise<void> {
    await this.prepareQueryData(dataMartDefinition.sqlQuery);
  }

  private async prepareViewData(dataMartDefinition: ViewDefinition): Promise<void> {
    await this.prepareQueryData(`SELECT * FROM \`${dataMartDefinition.fullyQualifiedName}\``);
  }

  private async prepareTablePatternData(dataMartDefinition: TablePatternDefinition): Promise<void> {
    await this.prepareQueryData(`SELECT * FROM \`${dataMartDefinition.pattern}*\``);
  }

  private async prepareQueryData(query: string): Promise<void> {
    const { jobId } = await this.adapter.executeQuery(query);
    const jobResult = await this.adapter.getJob(jobId);
    const destinationTable = jobResult.metadata.configuration.query.destinationTable;
    this.defineReportResultTable(
      destinationTable.projectId,
      destinationTable.datasetId,
      destinationTable.tableId
    );
  }

  private async prepareTableData(dataMartDefinition: TableDefinition): Promise<void> {
    const tableRef = dataMartDefinition.fullyQualifiedName.split('.');
    // project.dataset.table
    this.defineReportResultTable(tableRef[0], tableRef[1], tableRef[2]);
  }

  private async prepareConnectorData(dataMartDefinition: ConnectorDefinition): Promise<void> {
    await this.prepareQueryData(
      `SELECT * FROM \`${dataMartDefinition.connector.storage.fullyQualifiedName}\``
    );
  }

  private defineReportResultTable(projectId: string, datasetId: string, tableId: string): void {
    this.reportResultTable = this.adapter.createTableReference(projectId, datasetId, tableId);
    if (!this.reportResultTable) {
      throw new Error('Report result table not set');
    }
  }

  private async prepareBigQuery(
    credentials: BigQueryCredentials,
    dataStorageConfig: BigQueryConfig
  ): Promise<void> {
    try {
      this.adapter = this.adapterFactory.create(credentials, dataStorageConfig);
      this.logger.debug('BigQuery adapter created successfully');
    } catch (error) {
      this.logger.error('Failed to create BigQuery adapter', error);
      throw error;
    }
  }
}
