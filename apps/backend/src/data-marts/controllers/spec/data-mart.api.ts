import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBody, ApiParam, ApiOkResponse } from '@nestjs/swagger';
import { CreateDataMartRequestApiDto } from '../../dto/presentation/create-data-mart-request-api.dto';
import { DataMartResponseApiDto } from '../../dto/presentation/data-mart-response-api.dto';
import { CreateDataMartResponseApiDto } from '../../dto/presentation/create-data-mart-response-api.dto';
import { UpdateDataMartDescriptionApiDto } from '../../dto/presentation/update-data-mart-description-api.dto';
import { UpdateDataMartTitleApiDto } from '../../dto/presentation/update-data-mart-title-api.dto';
import { UpdateDataMartDefinitionApiDto } from '../../dto/presentation/update-data-mart-definition-api.dto';

export function CreateDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new DataMart' }),
    ApiBody({ type: CreateDataMartRequestApiDto }),
    ApiResponse({ status: 201, type: CreateDataMartResponseApiDto })
  );
}

export function ListDataMartsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List all DataMarts' }),
    ApiResponse({ status: 200, type: DataMartResponseApiDto, isArray: true })
  );
}

export function GetDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a DataMart by ID' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiResponse({ status: 200, type: DataMartResponseApiDto })
  );
}

export function UpdateDataMartDefinitionSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update DataMart definition' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiBody({ type: UpdateDataMartDefinitionApiDto }),
    ApiOkResponse({ type: DataMartResponseApiDto })
  );
}

export function PublishDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Publish DataMart' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiOkResponse({ type: DataMartResponseApiDto })
  );
}

export function UpdateDataMartDescriptionSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update DataMart description' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiBody({ type: UpdateDataMartDescriptionApiDto }),
    ApiOkResponse({ type: DataMartResponseApiDto })
  );
}

export function UpdateDataMartTitleSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update DataMart title' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiBody({ type: UpdateDataMartTitleApiDto }),
    ApiOkResponse({ type: DataMartResponseApiDto })
  );
}
