import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GoogleJwtBody } from '../../../common/jwt-body/google-jwt-body.decorator';
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
import { LookerStudioConnectorApiService } from '../../data-destination-types/looker-studio-connector/services/looker-studio-connector-api.service';
import { Auth } from '../../../idp';
import { Role } from '../../../idp/types/role-config.types';

const LOOKER_STUDIO_SERVICE_ACCOUNT =
  'connector@owox-p-odm-looker-studio-001.iam.gserviceaccount.com';

@Controller('external/looker')
@ApiTags('Looker Studio Connector endpoints')
export class LookerStudioConnectorController {
  constructor(private readonly lookerStudioConnectorService: LookerStudioConnectorApiService) {}

  @Auth(Role.none())
  @HttpCode(200)
  @Post('/get-config')
  async getConfig(
    @GoogleJwtBody(LOOKER_STUDIO_SERVICE_ACCOUNT)
    request: GetConfigRequest
  ): Promise<GetConfigResponse> {
    return this.lookerStudioConnectorService.getConfig(request);
  }

  @Auth(Role.none())
  @HttpCode(200)
  @Post('/get-schema')
  async getSchema(
    @GoogleJwtBody(LOOKER_STUDIO_SERVICE_ACCOUNT)
    request: GetSchemaRequest
  ): Promise<GetSchemaResponse> {
    return this.lookerStudioConnectorService.getSchema(request);
  }

  @Auth(Role.none())
  @HttpCode(200)
  @Post('/get-data')
  async getData(
    @GoogleJwtBody(LOOKER_STUDIO_SERVICE_ACCOUNT)
    request: GetDataRequest
  ): Promise<GetDataResponse> {
    return this.lookerStudioConnectorService.getData(request);
  }
}
