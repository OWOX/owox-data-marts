import { ApiProperty } from '@nestjs/swagger';
import { RelationshipResponseApiDto } from './relationship-response-api.dto';

export class RelationshipGraphNodeResponseApiDto {
  @ApiProperty({ type: RelationshipResponseApiDto })
  relationship: RelationshipResponseApiDto;

  @ApiProperty({
    example: 'orders.line_items',
    description: 'Dot-separated alias path from the root data mart down to this relationship',
  })
  aliasPath: string;

  @ApiProperty({ example: 2, description: 'Distance from the root (root direct children = 1)' })
  depth: number;

  @ApiProperty({
    example: false,
    description:
      'True when traversal reached an ancestor already on the path; the subtree below is not expanded',
  })
  isCycleStub: boolean;

  @ApiProperty({
    example: false,
    description:
      'Cumulative flag: true when any ancestor in the path is DRAFT or has no join conditions configured',
  })
  isBlocked: boolean;
}

export class RelationshipGraphResponseApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  rootDataMartId: string;

  @ApiProperty({ type: [RelationshipGraphNodeResponseApiDto] })
  nodes: RelationshipGraphNodeResponseApiDto[];
}
