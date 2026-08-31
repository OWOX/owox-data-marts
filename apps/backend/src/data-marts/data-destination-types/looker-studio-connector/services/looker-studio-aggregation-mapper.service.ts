import { Injectable } from '@nestjs/common';
import {
  isAggregateLevel,
  type CalculatedFieldLevel,
} from '../../../calculated-fields/formula-level';
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
    dataType: FieldDataType,
    // A calculated field carries no report aggregate function OF ITS OWN — no single
    // one describes a formula — so it usually arrives here with `aggFunc === undefined`, which
    // otherwise means "an ordinary native column". Set exactly when the header IS one, and then to
    // the level its formula was derived to have; the level cannot be re-derived here (see below),
    // so it has to arrive on the header. A row-level field the REPORT aggregates arrives with BOTH:
    // the level says there is no warehouse column behind it, the function says the query
    // aggregated it.
    calculatedFieldLevel?: CalculatedFieldLevel
  ): AggregationSemantics {
    // Spec §8: an AGGREGATING formula's Looker semantics copy COUNT_DISTINCT's — METRIC, NOT
    // re-aggregatable, no default aggregation — for the same reason COUNT_DISTINCT gets them: the
    // value is non-additive, so any roll-up Looker applies to it is a plausible wrong number.
    // Checked FIRST, because the `aggFunc === undefined` branch below would hand Looker
    // `defaultAggregationType: SUM, isReaggregatable: true` and the engine would re-sum a ratio the
    // warehouse already computed at the right grain.
    //
    // Deliberately NOT gated on `dataType === NUMBER`: the declared type is the analyst's own
    // choice, and calling a metric a DIMENSION because it was declared, say, NUMERIC
    // under a name this mapper reads as a string type would let Looker group by it instead. A
    // ROW-LEVEL formula IS a dimension, but that too is known from its level and never from its
    // type — see the arm right below.
    //
    // `undefined` means "not a calculated field", which `isAggregateLevel` alone would read as
    // aggregating — it answers for a field already known to carry a formula.
    if (calculatedFieldLevel !== undefined && isAggregateLevel(calculatedFieldLevel)) {
      return { conceptType: FieldConceptType.METRIC, isReaggregatable: false };
    }

    // The level-keyed arm the paragraph above defers to: with no report aggregation the SQL makes a
    // row-level formula a GROUP BY key, so it is a DIMENSION whatever it was declared to
    // be. Falling through to the ordinary path below with a NUMBER type made it a re-aggregatable
    // METRIC defaulting to SUM, and Looker then summed it over keys the query had already
    // deduplicated — an under-count, silently.
    //
    // Gated on `aggFunc === undefined` because the premise this arm was written on no longer holds:
    // a row-level field once had no report aggregation of its own, and now a report may apply one. The field then stops being a grouping key — the SQL emits
    // `COUNT(DISTINCT (<expr>))` and the header carries that very function — so it is an ordinary
    // aggregated column and takes the function-keyed path below, which answers for exactly this.
    // The function is the signal rather than the declared type for the same reason as above: the
    // type is the analyst's free choice and says nothing about the query's grain.
    if (calculatedFieldLevel !== undefined && aggFunc === undefined) {
      return { conceptType: FieldConceptType.DIMENSION };
    }

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
