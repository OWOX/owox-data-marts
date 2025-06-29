import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { CreateDataDestinationApiDto } from '../../dto/presentation/create-data-destination-api.dto';
import { UpdateDataDestinationApiDto } from '../../dto/presentation/update-data-destination-api.dto';
import { DataDestinationResponseApiDto } from '../../dto/presentation/data-destination-response-api.dto';

export function CreateDataDestinationSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new Data Destination' }),
    ApiBody({ type: CreateDataDestinationApiDto }),
    ApiCreatedResponse({ type: DataDestinationResponseApiDto })
  );
}

export function UpdateDataDestinationSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update Data Destination by ID' }),
    ApiParam({ name: 'id', description: 'Data Destination ID' }),
    ApiBody({ type: UpdateDataDestinationApiDto }),
    ApiOkResponse({ type: DataDestinationResponseApiDto })
  );
}

export function GetDataDestinationSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a Data Destination by ID' }),
    ApiParam({ name: 'id', description: 'Data Destination ID' }),
    ApiOkResponse({ type: DataDestinationResponseApiDto })
  );
}

export function ListDataDestinationsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get all Data Destinations' }),
    ApiOkResponse({ type: [DataDestinationResponseApiDto] })
  );
}

export function DeleteDataDestinationSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Delete Data Destination by ID' }),
    ApiParam({ name: 'id', description: 'Data Destination ID' }),
    ApiNoContentResponse({ description: 'Data Destination successfully deleted' })
  );
}
