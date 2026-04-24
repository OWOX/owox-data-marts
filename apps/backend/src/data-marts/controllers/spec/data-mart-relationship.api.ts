import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { RelationshipResponseApiDto } from '../../dto/presentation/relationship-response-api.dto';
import { CreateRelationshipRequestApiDto } from '../../dto/presentation/create-relationship-request-api.dto';
import { UpdateRelationshipRequestApiDto } from '../../dto/presentation/update-relationship-request-api.dto';

export function CreateRelationshipSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new relationship for a data mart' }),
    ApiParam({ name: 'dataMartId', description: 'Source data mart ID' }),
    ApiBody({ type: CreateRelationshipRequestApiDto }),
    ApiCreatedResponse({
      description: 'The relationship has been successfully created.',
      type: RelationshipResponseApiDto,
    })
  );
}

export function ListRelationshipsByDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List all relationships for a data mart' }),
    ApiParam({ name: 'dataMartId', description: 'Source data mart ID' }),
    ApiOkResponse({
      description: 'List of relationships for the data mart',
      type: [RelationshipResponseApiDto],
    })
  );
}

export function GetRelationshipSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a relationship by ID' }),
    ApiParam({ name: 'dataMartId', description: 'Source data mart ID' }),
    ApiParam({ name: 'id', description: 'Relationship ID' }),
    ApiOkResponse({
      description: 'The relationship',
      type: RelationshipResponseApiDto,
    })
  );
}

export function UpdateRelationshipSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update an existing relationship' }),
    ApiParam({ name: 'dataMartId', description: 'Source data mart ID' }),
    ApiParam({ name: 'id', description: 'Relationship ID' }),
    ApiBody({ type: UpdateRelationshipRequestApiDto }),
    ApiOkResponse({
      description: 'The relationship has been successfully updated.',
      type: RelationshipResponseApiDto,
    })
  );
}

export function DeleteRelationshipSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Delete a relationship' }),
    ApiParam({ name: 'dataMartId', description: 'Source data mart ID' }),
    ApiParam({ name: 'id', description: 'Relationship ID' }),
    ApiNoContentResponse({
      description: 'The relationship has been successfully deleted.',
    })
  );
}
