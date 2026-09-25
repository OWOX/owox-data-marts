import { Body, Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  Auth,
  AuthContext,
  AuthorizationContext,
  RejectApiKeyAuth,
  Role,
  Strategy,
} from '../../idp';
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

  // POST: not idempotent — every call queries the warehouse, so the token is re-checked with the
  // IdP (INTROSPECT) like other warehouse reads. It is not a run and consumes no credits.
  // A UI setup aid, not a data API: API keys read data through HTTP Data, which is gated and
  // recorded in Run History.
  @Auth(Role.viewer(Strategy.INTROSPECT))
  @RejectApiKeyAuth()
  @Post(':id/preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Read a sample of Data Mart rows for the Data Setup preview' })
  @ApiOkResponse({ type: PreviewDataMartResponseApiDto })
  async preview(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: PreviewDataMartRequestApiDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<PreviewDataMartResponseApiDto> {
    // The browser drops the request when the person cancels or leaves the page: stop the
    // warehouse query instead of finishing rows nobody will see.
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
        dto.filters,
        dto.sort
      ),
      abortController.signal
    );
  }
}
