import { Injectable, Logger } from '@nestjs/common';
import { GetConfigRequest, GetConfigResponse } from '../schemas/get-config.schema';
import { GetDataRequest, GetDataResponse } from '../schemas/get-data.schema';
import { GetSchemaRequest, GetSchemaResponse } from '../schemas/get-schema.schema';
import { FieldDataType } from '../enums/field-data-type.enum';
import { FieldConceptType } from '../enums/field-concept-type.enum';
import { LookerStudioConnectorApiConfigService } from './looker-studio-connector-api-config.service';

@Injectable()
export class LookerStudioConnectorApiService {
  private readonly logger = new Logger(LookerStudioConnectorApiService.name);

  constructor(private readonly configService: LookerStudioConnectorApiConfigService) {}

  public async getConfig(request: GetConfigRequest): Promise<GetConfigResponse> {
    return this.configService.getConfig(request);
  }

  public async getSchema(request: GetSchemaRequest): Promise<GetSchemaResponse> {
    this.logger.log('getSchema called with request:', JSON.stringify(request, null, 2));
    return {
      schema: [
        {
          name: 'date',
          label: 'Date',
          description: 'Date dimension',
          dataType: FieldDataType.STRING,
          semantics: {
            conceptType: FieldConceptType.DIMENSION,
            // semanticGroup: FieldSemanticGroup.DATETIME,
          },
          isDefault: true,
        },
        {
          name: 'sessions',
          label: 'Sessions',
          description: 'Number of sessions',
          dataType: FieldDataType.NUMBER,
          semantics: {
            conceptType: FieldConceptType.METRIC,
            // isReaggregatable: true,
          },
          isDefault: true,
        },
        {
          name: 'source',
          label: 'Traffic Source',
          description: 'Source of traffic',
          dataType: FieldDataType.STRING,
          semantics: {
            conceptType: FieldConceptType.DIMENSION,
          },
          isDefault: false,
        },
        {
          name: 'revenue',
          label: 'Revenue',
          description: 'Total revenue',
          dataType: FieldDataType.NUMBER,
          semantics: {
            conceptType: FieldConceptType.METRIC,
            // isReaggregatable: true,
          },
          isDefault: false,
        },
      ],
    };
  }

  public async getData(request: GetDataRequest): Promise<GetDataResponse> {
    this.logger.log('getData called with request:', JSON.stringify(request, null, 2));

    return {
      schema: [
        { name: 'date', dataType: FieldDataType.STRING },
        { name: 'sessions', dataType: FieldDataType.NUMBER },
        { name: 'source', dataType: FieldDataType.STRING },
        { name: 'revenue', dataType: FieldDataType.STRING },
      ],
      rows: [
        { values: ['2024-01-01', 1250, 'google', 15420.5] },
        { values: ['2024-01-01', 890, 'facebook', 8930.25] },
        { values: ['2024-01-01', 456, 'direct', 5670.0] },
        { values: ['2024-01-02', 1340, 'google', 16780.75] },
        { values: ['2024-01-02', 920, 'facebook', 9240.3] },
        { values: ['2024-01-02', 510, 'direct', 6120.45] },
      ],
    };
  }
}
