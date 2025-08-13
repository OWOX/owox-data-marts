import { Table, TableRow } from '@google-cloud/bigquery';
import { BigQueryRange } from '@google-cloud/bigquery/build/src/bigquery';
import { Injectable, Logger, Scope } from '@nestjs/common';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
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
import { DataStorageReportReaderState } from '../../interfaces/data-storage-report-reader-state.interface';
import {
  BigQueryReaderState,
  isBigQueryReaderState,
} from '../interfaces/bigquery-reader-state.interface';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import { BigQueryApiAdapter } from '../adapters/bigquery-api.adapter';
import { BigQueryConfig } from '../schemas/bigquery-config.schema';
import { BigQueryCredentials } from '../schemas/bigquery-credentials.schema';
import { BigQueryQueryBuilder } from './bigquery-query.builder';
import { BigQueryReportHeadersGenerator } from './bigquery-report-headers-generator.service';

@Injectable({ scope: Scope.TRANSIENT })
export class BigQueryReportReader implements DataStorageReportReader {
  private readonly logger = new Logger(BigQueryReportReader.name);
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

  private adapter: BigQueryApiAdapter;
  private reportResultTable: Table;
  private reportDataHeaders: ReportDataHeader[];
  private contextGcpProject: string;

  private reportConfig: {
    storageCredentials: BigQueryCredentials;
    storageConfig: BigQueryConfig;
    definition: DataMartDefinition;
  };

  constructor(
    private readonly adapterFactory: BigQueryApiAdapterFactory,
    private readonly bigQueryQueryBuilder: BigQueryQueryBuilder,
    private readonly headersGenerator: BigQueryReportHeadersGenerator
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

    if (!schema) {
      throw new Error('BigQuery data mart schema is required for header generation');
    }

    if (!isBigQueryDataMartSchema(schema)) {
      throw new Error('Google BigQuery data mart schema is expected');
    }

    this.reportConfig = {
      storageCredentials: storage.credentials,
      storageConfig: storage.config,
      definition,
    };

    this.reportDataHeaders = this.headersGenerator.generateHeaders(schema);

    await this.prepareBigQuery(
      this.reportConfig.storageCredentials,
      this.reportConfig.storageConfig
    );

    return new ReportDataDescription(this.reportDataHeaders);
  }

  public async readReportDataBatch(batchId?: string, maxRows = 5000): Promise<ReportDataBatch> {
    if (!this.reportResultTable) {
      await this.initializeReportData();
    }

    if (!this.adapter || !this.reportResultTable) {
      throw new Error('Report data must be prepared before read');
    }

    const [rows, nextBatch] = await this.reportResultTable.getRows({
      pageToken: batchId,
      maxResults: maxRows,
      autoPaginate: false,
    });

    const dataHeaders = this.reportDataHeaders.map(header => header.name);
    const mappedRows = rows.map(row => this.getStructuredReportRowData(row, dataHeaders));

    return new ReportDataBatch(mappedRows, nextBatch?.pageToken);
  }

  public async finalize(): Promise<void> {
    this.logger.debug('Finalizing report read');
    // no additional actions required
  }

  private async initializeReportData(): Promise<void> {
    if (!this.reportConfig) {
      throw new Error('Report data must be prepared before read');
    }

    await this.prepareReportResultTable(this.reportConfig.definition);
  }

  private async prepareReportResultTable(dataMartDefinition: DataMartDefinition): Promise<void> {
    this.logger.debug('Preparing report result table', dataMartDefinition);
    try {
      if (isTableDefinition(dataMartDefinition)) {
        const [projectId, datasetId, tableId] = dataMartDefinition.fullyQualifiedName.split('.');
        this.defineReportResultTable(projectId, datasetId, tableId);
      } else if (isConnectorDefinition(dataMartDefinition)) {
        const tablePath = dataMartDefinition.connector.storage.fullyQualifiedName.split('.');
        const [projectId, datasetId, tableId] =
          tablePath.length === 2 ? [this.contextGcpProject, ...tablePath] : tablePath;
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
      this.contextGcpProject = dataStorageConfig.projectId;
      this.logger.debug('BigQuery adapter created successfully');
    } catch (error) {
      this.logger.error('Failed to create BigQuery adapter', error);
      throw error;
    }
  }

  /**
   * Converts table row data to structured report row data
   */
  public getStructuredReportRowData(tableRow: TableRow, columnNames: string[]): unknown[] {
    const rowData: unknown[] = [];
    for (let i = 0; i < columnNames.length; i++) {
      const fieldPathNodes = columnNames[i].split('.');

      let cell = null;
      for (let j = 0; j < fieldPathNodes.length; j++) {
        cell = cell ? cell[fieldPathNodes[j]] : tableRow[fieldPathNodes[j]];
      }

      const cellValue = this.getReportCellValue(cell);
      rowData.push(cellValue);
    }
    return rowData;
  }

  private getReportCellValue(cell: unknown): unknown {
    const isCellPresent = cell !== null && cell !== undefined;
    if (isCellPresent && cell instanceof Array) {
      return JSON.stringify(cell.map(this.getReportCellValue.bind(this)), null, 2);
    } else if (isCellPresent && cell instanceof BigQueryRange) {
      return JSON.stringify(cell, null, 2);
    } else if (isCellPresent && cell instanceof Buffer) {
      return cell.toString('utf-8');
    } else if (isCellPresent && typeof cell === 'object') {
      if (cell.constructor.name === 'Big') {
        // BigQuery NUMERIC and BIGNUMERIC wrapper handling
        return cell.toString();
      } else if (cell['value']) {
        // other BigQuery types with wrappers
        return cell['value'];
      } else {
        return cell;
      }
    } else {
      return cell;
    }
  }

  getState(): BigQueryReaderState | null {
    if (!this.reportResultTable || !this.contextGcpProject) {
      return null;
    }

    return {
      type: DataStorageType.GOOGLE_BIGQUERY,
      reportResultTable: this.reportResultTable
        ? {
            projectId: this.reportResultTable.dataset.projectId!,
            datasetId: this.reportResultTable.dataset.id!,
            tableId: this.reportResultTable.id!,
          }
        : undefined,
      contextGcpProject: this.contextGcpProject,
    };
  }

  async initFromState(
    state: DataStorageReportReaderState,
    reportDataHeaders: ReportDataHeader[]
  ): Promise<void> {
    if (!isBigQueryReaderState(state)) {
      throw new Error('Invalid state type for BigQuery reader');
    }

    this.contextGcpProject = state.contextGcpProject;
    this.reportDataHeaders = reportDataHeaders;

    if (state.reportResultTable && this.adapter) {
      this.reportResultTable = this.adapter.createTableReference(
        state.reportResultTable.projectId,
        state.reportResultTable.datasetId,
        state.reportResultTable.tableId
      );
    }
  }
}
