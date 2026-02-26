import { Injectable } from '@nestjs/common';
import { DataMartTableReferenceService } from '../../services/data-mart-table-reference.service';

/**
 * Tool to retrieve the fully qualified table name for a Data Mart
 */
@Injectable()
export class TableNameRetrieverTool {
  constructor(private readonly dataMartTableReferenceService: DataMartTableReferenceService) {}

  async retrieveTableName(datamartId: string, projectId: string): Promise<string> {
    return this.dataMartTableReferenceService.resolveTableName(datamartId, projectId);
  }
}
