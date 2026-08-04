import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { GetModelCanvasDataMartsQueryApiDto } from '../dto/presentation/get-model-canvas-data-marts-query-api.dto';
import { GetModelCanvasEdgesQueryApiDto } from '../dto/presentation/get-model-canvas-edges-query-api.dto';
import {
  ModelCanvasDataMartsResponseApiDto,
  ModelCanvasEdgesResponseApiDto,
} from '../dto/presentation/model-canvas-response-api.dto';
import { ModelCanvasMapper } from '../mappers/model-canvas.mapper';
import { GetModelCanvasDataMartsService } from '../use-cases/get-model-canvas-data-marts.service';
import { GetModelCanvasEdgesService } from '../use-cases/get-model-canvas-edges.service';
import { GetModelCanvasDataMartsSpec, GetModelCanvasEdgesSpec } from './spec/model-canvas.api';

@Controller('model-canvas')
@ApiTags('Model Canvas')
export class ModelCanvasController {
  constructor(
    private readonly getModelCanvasDataMartsService: GetModelCanvasDataMartsService,
    private readonly getModelCanvasEdgesService: GetModelCanvasEdgesService,
    private readonly mapper: ModelCanvasMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('data-marts')
  @GetModelCanvasDataMartsSpec()
  async getDataMarts(
    @AuthContext() context: AuthorizationContext,
    @Query() query: GetModelCanvasDataMartsQueryApiDto
  ): Promise<ModelCanvasDataMartsResponseApiDto> {
    const command = this.mapper.toDataMartsCommand(context, query);
    const result = await this.getModelCanvasDataMartsService.run(command);
    return this.mapper.toDataMartsResponse(result);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('edges')
  @GetModelCanvasEdgesSpec()
  async getEdges(
    @AuthContext() context: AuthorizationContext,
    @Query() query: GetModelCanvasEdgesQueryApiDto
  ): Promise<ModelCanvasEdgesResponseApiDto> {
    const command = this.mapper.toEdgesCommand(context, query.storageId);
    return this.getModelCanvasEdgesService.run(command);
  }
}
