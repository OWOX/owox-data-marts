import { Injectable } from '@nestjs/common';
import { AggregateFunction } from '../../../dto/schemas/aggregate-function.schema';
import { AggregationType } from '../enums/aggregation-type.enum';
import { FieldConceptType } from '../enums/field-concept-type.enum';
import { FieldDataType } from '../enums/field-data-type.enum';

export interface AggregationSemantics {
  conceptType: FieldConceptType;
  defaultAggregationType?: AggregationType;
  isReaggregatable?: boolean;
}

@Injectable()
export class LookerStudioAggregationMapperService {
  mapAggregateFunctionToLookerType(
    aggFunc: AggregateFunction | undefined,
    dataType: FieldDataType
  ): AggregationSemantics {
    if (aggFunc === undefined) {
      return dataType === FieldDataType.NUMBER
        ? {
            conceptType: FieldConceptType.METRIC,
            defaultAggregationType: AggregationType.SUM,
            isReaggregatable: true,
          }
        : { conceptType: FieldConceptType.DIMENSION };
    }

    switch (aggFunc) {
      case 'SUM':
        return dataType === FieldDataType.NUMBER
          ? {
              conceptType: FieldConceptType.METRIC,
              defaultAggregationType: AggregationType.SUM,
              isReaggregatable: true,
            }
          : { conceptType: FieldConceptType.DIMENSION };
      case 'MIN':
        return dataType === FieldDataType.NUMBER
          ? {
              conceptType: FieldConceptType.METRIC,
              defaultAggregationType: AggregationType.MIN,
              isReaggregatable: true,
            }
          : { conceptType: FieldConceptType.DIMENSION };
      case 'MAX':
        return dataType === FieldDataType.NUMBER
          ? {
              conceptType: FieldConceptType.METRIC,
              defaultAggregationType: AggregationType.MAX,
              isReaggregatable: true,
            }
          : { conceptType: FieldConceptType.DIMENSION };
      case 'COUNT':
        return {
          conceptType: FieldConceptType.METRIC,
          defaultAggregationType: AggregationType.SUM,
          isReaggregatable: true,
        };
      case 'COUNT_DISTINCT':
        return { conceptType: FieldConceptType.METRIC, isReaggregatable: false };
      case 'STRING_AGG':
      case 'ANY_VALUE':
        return { conceptType: FieldConceptType.DIMENSION };
      default: {
        const _exhaustive: never = aggFunc;
        return _exhaustive;
      }
    }
  }
}
