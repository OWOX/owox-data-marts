import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type {
  DataMartModelPreviewDto,
  DataMartModelPreviewRequest,
} from '../dto/domain/data-mart-model.dto';
import { McpDataMartModelMapper } from '../mappers/mcp-data-mart-model.mapper';
import { PreviewDataMartCommand, PreviewDataMartService } from './preview-data-mart.service';

@Injectable()
export class DataMartModelService {
  constructor(
    private readonly previewService: PreviewDataMartService,
    private readonly mapper: McpDataMartModelMapper
  ) {}

  async preview(
    request: DataMartModelPreviewRequest,
    signal?: AbortSignal
  ): Promise<DataMartModelPreviewDto> {
    if (!request.projectId?.trim() || !request.userId?.trim() || !Array.isArray(request.roles)) {
      throw new UnauthorizedException('Authenticated actor and project are required');
    }
    if (!request.roles.some(role => role === 'admin' || role === 'editor')) {
      throw new ForbiddenException('Setup requires an admin or editor');
    }
    const observation = await this.previewService.runForSetup(
      new PreviewDataMartCommand(
        request.dataMartId,
        request.projectId,
        request.userId,
        request.roles,
        request.limit,
        undefined
      ),
      signal
    );
    return this.mapper.toPreview(request.dataMartId, observation);
  }
}
