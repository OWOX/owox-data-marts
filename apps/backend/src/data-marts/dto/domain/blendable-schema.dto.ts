import { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';
import { AggregateFunction } from '../schemas/relationship-schemas';

export class BlendedFieldDto {
  name: string;
  sourceRelationshipId: string;
  sourceDataMartId: string;
  sourceDataMartTitle: string;
  targetAlias: string;
  originalFieldName: string;
  type: string;
  alias: string;
  description: string;
  isHidden: boolean;
  aggregateFunction: AggregateFunction;
  transitiveDepth: number;
  aliasPath: string;
  outputPrefix: string;
}

export class AvailableSourceDto {
  aliasPath: string;
  title: string;
  description?: string;
  defaultAlias: string;
  depth: number;
  fieldCount: number;
  isIncluded: boolean;
  relationshipId: string;
  dataMartId: string;
}

export class BlendableSchemaDto {
  nativeFields: DataMartSchema['fields'];
  nativeDescription?: string;
  blendedFields: BlendedFieldDto[];
  availableSources: AvailableSourceDto[];
}
