import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LookerStudioConnectorApiService } from '../../data-destination-types/looker-studio-connector/services/looker-studio-connector-api.service';
import {
  GetConfigRequest,
  GetConfigResponse,
} from '../../data-destination-types/looker-studio-connector/schemas/get-config.schema';
import {
  GetDataRequest,
  GetDataResponse,
} from '../../data-destination-types/looker-studio-connector/schemas/get-data.schema';
import {
  GetSchemaRequest,
  GetSchemaResponse,
} from '../../data-destination-types/looker-studio-connector/schemas/get-schema.schema';

@Controller('external/looker')
@ApiTags('Looker Studio Connector endpoints')
export class LookerStudioConnectorController {
  constructor(private readonly lookerStudioConnectorService: LookerStudioConnectorApiService) {}

  @HttpCode(200)
  @Post('/get-config')
  async getConfig(@Body() request: GetConfigRequest): Promise<GetConfigResponse> {
    return this.lookerStudioConnectorService.getConfig(request);
  }

  @HttpCode(200)
  @Post('/get-schema')
  async getSchema(@Body() request: GetSchemaRequest): Promise<GetSchemaResponse> {
    return this.lookerStudioConnectorService.getSchema(request);
  }

  @HttpCode(200)
  @Post('/get-data')
  async getData(@Body() request: GetDataRequest): Promise<GetDataResponse> {
    return this.lookerStudioConnectorService.getData(request);
  }
}
