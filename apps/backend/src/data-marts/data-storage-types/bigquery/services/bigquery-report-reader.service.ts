import { Table } from '@google-cloud/bigquery';
import { Injectable, Logger, Scope } from '@nestjs/common';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  isConnectorDefinition,
  isTableDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { Report } from '../../../entities/report.entity';
import { isBigQueryDataMartSchema } from '../../data-mart-schema.guards';
import { isBigQueryConfig } from '../../data-storage-config.guards';
import { isBigQueryCredentials } from '../../data-storage-credentials.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageReportReader } from '../../interfaces/data-storage-report-reader.interface';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import { BigQueryApiAdapter } from '../adapters/bigquery-api.adapter';
import { BigQueryConfig } from '../schemas/bigquery-config.schema';
import { BigQueryCredentials } from '../schemas/bigquery-credentials.schema';
import { BigQueryQueryBuilder } from './bigquery-query.builder';
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
    private readonly bigQueryQueryBuilder: BigQueryQueryBuilder,
    private readonly formatter: BigQueryReportFormatterService
  ) {}

  public async prepareReportData(report: Report): Promise<ReportDataDescription> {
    const { storage, definition, schema } = report.dataMart;
    if (!storage || !definition) {
      throw new Error('Data Mart is not properly configured');
    }

    if (!isBigQueryCredentials(storage.credentials)) {
      throw new Error('Google BigQuery credentials are not properly configured');
    }

    if (!isBigQueryConfig(storage.config)) {
      throw new Error('Google BigQuery config is not properly configured');
    }

    if (schema && !isBigQueryDataMartSchema(schema)) {
      throw new Error('Google BigQuery data mart schema is expected');
    }

    await this.prepareBigQuery(storage.credentials, storage.config);
    await this.prepareReportResultTable(definition);

    const [metaData] = await this.reportResultTable.getMetadata();
    if (!metaData.numRows || !metaData.schema || !metaData.schema.fields) {
      throw new Error('Failed to get table metadata');
    }

    this.reportResultHeaders = this.formatter.prepareReportResultHeaders(metaData.schema, schema);

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
        const [projectId, datasetId, tableId] = dataMartDefinition.fullyQualifiedName.split('.');
        this.defineReportResultTable(projectId, datasetId, tableId);
      } else if (isConnectorDefinition(dataMartDefinition)) {
        const [projectId, datasetId, tableId] =
          dataMartDefinition.connector.storage.fullyQualifiedName.split('.');
        this.defineReportResultTable(projectId, datasetId, tableId);
      } else {
        const query = this.bigQueryQueryBuilder.buildQuery(dataMartDefinition);
        await this.prepareQueryData(query);
      }
    } catch (error) {
      this.logger.error('Failed to prepare report data', error);
      throw error;
    }
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
