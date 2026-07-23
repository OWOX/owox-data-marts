import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Auth, AuthContext, AuthorizationContext, Role } from '../../../idp';
import { HttpDataMapper } from '../../mappers/http-data.mapper';
import { StreamHttpDataService } from '../../use-cases/stream-http-data.service';
import { StreamHttpDataSpec } from '../spec/external/http-data.api';

@Controller('external/http-data')
@ApiTags('HTTP Data')
export class HttpDataController {
  constructor(
    private readonly mapper: HttpDataMapper,
    private readonly streamHttpDataService: StreamHttpDataService
  ) {}

  @StreamHttpDataSpec()
  @Auth(Role.viewer())
  @Get('data-marts/:dataMartId.ndjson')
  async stream(
    @Param('dataMartId') dataMartId: string,
    @Query() rawQuery: Record<string, unknown>,
    @AuthContext() ctx: AuthorizationContext,
    @Res() res: Response
  ): Promise<void> {
    const command = this.mapper.toStreamHttpDataCommand(dataMartId, ctx, rawQuery);
    await this.streamHttpDataService.stream(command, res);
  }
}
