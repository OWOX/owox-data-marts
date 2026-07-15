import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import {
  ModelCanvasDataMartsResponseApiDto,
  ModelCanvasEdgesResponseApiDto,
} from '../../dto/presentation/model-canvas-response-api.dto';

export function GetModelCanvasDataMartsSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get a page of data marts of a storage for the project data model canvas',
    }),
    ApiOkResponse({
      description: 'Data marts are access-filtered like the data mart list',
      type: ModelCanvasDataMartsResponseApiDto,
    })
  );
}

export function GetModelCanvasEdgesSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get the relationships between visible data marts of a storage for the model canvas',
    }),
    ApiOkResponse({
      description: 'Edges reference only data marts visible to the current user',
      type: ModelCanvasEdgesResponseApiDto,
    })
  );
}
