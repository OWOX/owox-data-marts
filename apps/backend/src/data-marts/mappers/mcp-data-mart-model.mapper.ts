import { BadGatewayException, Injectable } from '@nestjs/common';
import type { DataMartModelPreviewDto } from '../dto/domain/data-mart-model.dto';
import type { DataMartPreviewObservation } from '../use-cases/preview-data-mart.service';

export const SETUP_PREVIEW_MAX_BYTES = 256 * 1024;

@Injectable()
export class McpDataMartModelMapper {
  toPreview(dataMartId: string, observation: DataMartPreviewObservation): DataMartModelPreviewDto {
    const source = observation.preview;
    const result: DataMartModelPreviewDto = {
      dataMartId,
      revision: observation.revision,
      observedModifiedAt: observation.observedModifiedAt,
      observedStatus: observation.observedStatus,
      observedDefinitionType: observation.observedDefinitionType,
      currentness: observation.currentness,
      schema: {
        freshness: observation.schemaFreshness,
        inputRevision: observation.schemaInputRevision,
        actualizedAt: observation.schemaActualizedAt,
      },
      columns: source.columns.map(column => ({
        name: column.name,
        ...(column.alias ? { alias: column.alias } : {}),
        ...(column.type ? { type: column.type } : {}),
      })),
      rows: [],
      rowCount: 0,
      limit: source.limit,
      truncated: source.truncated,
      payloadTruncated: false,
      warehouseChargesApply: true,
      warehouseTimeout: 'provider-dependent',
      reportRunCreated: false,
      owoxConsumptionRecorded: false,
    };
    // Reserve space for rowCount and truncation flag changes after appending rows.
    let bytes = Buffer.byteLength(JSON.stringify(result, null, 2)) + 1024;
    if (bytes > SETUP_PREVIEW_MAX_BYTES) {
      throw new BadGatewayException('Preview headers exceed the output payload limit');
    }
    for (const row of source.rows) {
      const rowBytes =
        Buffer.byteLength(JSON.stringify(row, null, 2).replace(/\n/g, '\n    ')) + 16;
      if (bytes + rowBytes > SETUP_PREVIEW_MAX_BYTES) {
        result.payloadTruncated = true;
        result.truncated = true;
        break;
      }
      result.rows.push([...row]);
      bytes += rowBytes;
    }
    result.rowCount = result.rows.length;
    return result;
  }
}
