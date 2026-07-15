import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { GetModelCanvasDataMartsCommand } from '../dto/domain/get-model-canvas-data-marts.command';
import { GetModelCanvasEdgesCommand } from '../dto/domain/get-model-canvas-edges.command';
import { ModelCanvasDataMartsDto, ModelCanvasNodeDto } from '../dto/domain/model-canvas.dto';
import { GetModelCanvasDataMartsQueryApiDto } from '../dto/presentation/get-model-canvas-data-marts-query-api.dto';
import { ModelCanvasDataMartsResponseApiDto } from '../dto/presentation/model-canvas-response-api.dto';
import { DataMart } from '../entities/data-mart.entity';

@Injectable()
export class ModelCanvasMapper {
  toDataMartsCommand(
    context: AuthorizationContext,
    query: GetModelCanvasDataMartsQueryApiDto
  ): GetModelCanvasDataMartsCommand {
    return new GetModelCanvasDataMartsCommand(
      context.projectId,
      context.userId,
      context.roles ?? [],
      query.storageId,
      query.offset
    );
  }

  toEdgesCommand(context: AuthorizationContext, storageId: string): GetModelCanvasEdgesCommand {
    return new GetModelCanvasEdgesCommand(
      context.projectId,
      context.userId,
      context.roles ?? [],
      storageId
    );
  }

  toNodeDto(dataMart: DataMart): ModelCanvasNodeDto {
    return {
      id: dataMart.id,
      title: dataMart.title,
      status: dataMart.status,
      description: dataMart.description ?? null,
      fieldCount: dataMart.schema?.fields?.length ?? 0,
    };
  }

  toDataMartsDto(dataMarts: DataMart[], total: number, offset: number): ModelCanvasDataMartsDto {
    return {
      items: dataMarts.map(dataMart => this.toNodeDto(dataMart)),
      total,
      offset,
    };
  }

  toDataMartsResponse(dto: ModelCanvasDataMartsDto): ModelCanvasDataMartsResponseApiDto {
    const nextOffset = dto.offset + dto.items.length;
    return {
      items: dto.items,
      total: dto.total,
      nextOffset: nextOffset < dto.total ? nextOffset : null,
    };
  }
}
