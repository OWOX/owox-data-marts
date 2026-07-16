import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import {
  BatchRunDataQualityRequestApiDto,
  BatchRunDataQualityResponseApiDto,
  DataQualityConfigResponseApiDto,
  LatestDataQualityRunResponseApiDto,
  RunDataQualityRequestApiDto,
  RunDataQualityResponseApiDto,
} from '../dto/presentation/data-quality-api.dto';
import { DataQualityApiMapper } from '../mappers/data-quality-api.mapper';
import { DataQualityApiService } from '../services/data-quality-api.service';
import {
  GetDataQualityConfigSpec,
  GetLatestDataQualityRunSpec,
  ReplaceDataQualityConfigSpec,
  RunDataQualityBatchSpec,
  RunDataQualitySpec,
} from './spec/data-quality.api';

@Controller('data-marts/data-quality')
@ApiTags('Data Quality')
export class DataQualityBatchController {
  constructor(
    private readonly service: DataQualityApiService,
    private readonly mapper: DataQualityApiMapper
  ) {}

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post('runs/batch')
  @HttpCode(HttpStatus.OK)
  @RunDataQualityBatchSpec()
  async runBatch(
    @AuthContext() context: AuthorizationContext,
    @Body() request: BatchRunDataQualityRequestApiDto
  ): Promise<BatchRunDataQualityResponseApiDto> {
    return this.service.runBatch(context, this.mapper.toBatchIds(request));
  }
}

@Controller('data-marts/:dataMartId/data-quality')
@ApiTags('Data Quality')
export class DataQualityController {
  constructor(
    private readonly service: DataQualityApiService,
    private readonly mapper: DataQualityApiMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('config')
  @GetDataQualityConfigSpec()
  getConfig(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string
  ): Promise<DataQualityConfigResponseApiDto> {
    return this.service.getConfig(context, dataMartId);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put('config')
  @ReplaceDataQualityConfigSpec()
  replaceConfig(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Body() body: unknown
  ): Promise<DataQualityConfigResponseApiDto> {
    return this.service.replaceConfig(context, dataMartId, this.mapper.toReplacementConfig(body));
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post('runs')
  @RunDataQualitySpec()
  run(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Body() body: RunDataQualityRequestApiDto
  ): Promise<RunDataQualityResponseApiDto> {
    return this.service.run(context, dataMartId, this.mapper.toRunInput(body));
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('runs/latest')
  @GetLatestDataQualityRunSpec()
  getLatest(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string
  ): Promise<LatestDataQualityRunResponseApiDto | null> {
    return this.service.getLatest(context, dataMartId);
  }
}
