import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam } from '@nestjs/swagger';
import { RelationshipResponseApiDto } from '../../dto/presentation/relationship-response-api.dto';

export function ListRelationshipsByStorageSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List all relationships for a data storage' }),
    ApiParam({ name: 'storageId', description: 'Data storage ID' }),
    ApiOkResponse({
      description: 'List of relationships for the data storage',
      type: [RelationshipResponseApiDto],
    })
  );
}
