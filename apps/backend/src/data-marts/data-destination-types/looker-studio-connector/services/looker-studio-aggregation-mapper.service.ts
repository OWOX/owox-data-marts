import { Injectable } from '@nestjs/common';
import { ReportAggregateFunction } from '../../../dto/schemas/aggregate-function.schema';
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
    aggFunc: ReportAggregateFunction | undefined,
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
      case 'AVG':
        // Averages are not re-aggregatable (an average of averages is not the
        // overall average), so Looker must not roll them up further.
        return dataType === FieldDataType.NUMBER
          ? {
              conceptType: FieldConceptType.METRIC,
              defaultAggregationType: AggregationType.AVG,
              isReaggregatable: false,
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
      case 'P25':
      case 'P50':
      case 'P75':
      case 'P95':
        return dataType === FieldDataType.NUMBER
          ? { conceptType: FieldConceptType.METRIC, isReaggregatable: false }
          : { conceptType: FieldConceptType.DIMENSION };
      default: {
        const _exhaustive: never = aggFunc;
        return _exhaustive;
      }
    }
  }
}
