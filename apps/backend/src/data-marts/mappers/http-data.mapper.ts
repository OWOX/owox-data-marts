import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp/types/auth.types';
import { StreamHttpDataCommand } from '../dto/domain/stream-http-data.command';
import { StreamHttpReportDataCommand } from '../dto/domain/stream-http-report-data.command';

@Injectable()
export class HttpDataMapper {
  toStreamHttpDataCommand(
    dataMartId: string,
    ctx: AuthorizationContext,
    rawQuery: Record<string, unknown>
  ): StreamHttpDataCommand {
    return {
      dataMartId,
      userId: ctx.userId,
      projectId: ctx.projectId,
      roles: ctx.roles ?? [],
      rawQuery,
    };
  }

  toStreamHttpReportDataCommand(
    reportId: string,
    ctx: AuthorizationContext,
    rawQuery: Record<string, unknown>
  ): StreamHttpReportDataCommand {
    return {
      reportId,
      userId: ctx.userId,
      projectId: ctx.projectId,
      roles: ctx.roles ?? [],
      rawQuery,
    };
  }
}
