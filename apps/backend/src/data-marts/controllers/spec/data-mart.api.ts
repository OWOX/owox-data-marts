import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { CreateDataMartRequestApiDto } from '../../dto/presentation/create-data-mart-request-api.dto';
import { DataMartResponseApiDto } from '../../dto/presentation/data-mart-response-api.dto';
import { CreateDataMartResponseApiDto } from '../../dto/presentation/create-data-mart-response-api.dto';

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
