import { Body, Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { PreviewDataMartRequestApiDto } from '../dto/presentation/preview-data-mart-request-api.dto';
import { PreviewDataMartResponseApiDto } from '../dto/presentation/preview-data-mart-response-api.dto';
import {
  PreviewDataMartCommand,
  PreviewDataMartService,
} from '../use-cases/preview-data-mart.service';

@Controller('data-marts')
@ApiTags('DataMarts')
export class DataMartPreviewController {
  constructor(private readonly previewDataMartService: PreviewDataMartService) {}

  // POST: not idempotent — every call queries the warehouse and is a new billable run.
  @Auth(Role.viewer(Strategy.PARSE))
  @Post(':id/preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Read a sample of Data Mart rows for the Data Setup preview' })
  async preview(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: PreviewDataMartRequestApiDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<PreviewDataMartResponseApiDto> {
    // The browser drops the request when the person cancels or leaves the page: stop the
    // warehouse query instead of finishing (and charging for) rows nobody will see.
    const abortController = new AbortController();
    // Listens on the response: a request's own 'close' fires as soon as its body has been read.
    response.on('close', () => {
      if (!response.writableFinished) abortController.abort();
    });

    return this.previewDataMartService.run(
      new PreviewDataMartCommand(
        id,
        context.projectId,
        context.userId,
        context.roles ?? [],
        dto.limit,
        dto.filters
      ),
      abortController.signal
    );
  }
}
