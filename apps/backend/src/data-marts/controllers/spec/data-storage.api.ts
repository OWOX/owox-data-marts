import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { CreateDataStorageApiDto } from '../../dto/presentation/create-data-storage-api.dto';
import { UpdateDataStorageApiDto } from '../../dto/presentation/update-data-storage-api.dto';
import { DataStorageResponseApiDto } from '../../dto/presentation/data-storage-response-api.dto';

export function CreateDataStorageSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new Data Storage' }),
    ApiBody({ type: CreateDataStorageApiDto }),
    ApiResponse({ status: 201, type: DataStorageResponseApiDto })
  );
}

export function UpdateDataStorageSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update Data Storage by ID' }),
    ApiParam({ name: 'id', description: 'Data Storage ID' }),
    ApiBody({ type: UpdateDataStorageApiDto }),
    ApiResponse({ status: 200, type: DataStorageResponseApiDto })
  );
}

export function GetDataStorageSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a Data Storage by ID' }),
    ApiParam({ name: 'id', description: 'Data Storage ID' }),
    ApiResponse({ status: 200, type: DataStorageResponseApiDto })
  );
}
