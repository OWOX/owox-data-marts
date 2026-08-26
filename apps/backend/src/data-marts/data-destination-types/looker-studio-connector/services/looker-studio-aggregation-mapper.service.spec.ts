import { LookerStudioAggregationMapperService } from './looker-studio-aggregation-mapper.service';
import { AggregationType } from '../enums/aggregation-type.enum';
import { FieldConceptType } from '../enums/field-concept-type.enum';
import { FieldDataType } from '../enums/field-data-type.enum';
import { AggregateFunction } from '../../../dto/schemas/aggregate-function.schema';

describe('LookerStudioAggregationMapperService', () => {
  let service: LookerStudioAggregationMapperService;

  beforeEach(() => {
    service = new LookerStudioAggregationMapperService();
  });

  describe('undefined aggFunc (native field)', () => {
    it('NUMBER -> METRIC + SUM + reagg=true', () => {
      const result = service.mapAggregateFunctionToLookerType(undefined, FieldDataType.NUMBER);
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBe(AggregationType.SUM);
      expect(result.isReaggregatable).toBe(true);
    });

    it('STRING -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType(undefined, FieldDataType.STRING);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
      expect(result.defaultAggregationType).toBeUndefined();
    });

    it('BOOLEAN -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType(undefined, FieldDataType.BOOLEAN);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });
  });

  describe('SUM', () => {
    it('NUMBER -> METRIC + SUM + reagg=true', () => {
      const result = service.mapAggregateFunctionToLookerType('SUM', FieldDataType.NUMBER);
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBe(AggregationType.SUM);
      expect(result.isReaggregatable).toBe(true);
    });

    it('STRING -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('SUM', FieldDataType.STRING);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });

    it('BOOLEAN -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('SUM', FieldDataType.BOOLEAN);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });
  });

  describe('AVG', () => {
    it('NUMBER -> METRIC + AVG + reagg=false (average of averages is invalid)', () => {
      const result = service.mapAggregateFunctionToLookerType('AVG', FieldDataType.NUMBER);
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBe(AggregationType.AVG);
      expect(result.isReaggregatable).toBe(false);
    });

    it('STRING -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('AVG', FieldDataType.STRING);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });
  });

  describe('MIN', () => {
    it('NUMBER -> METRIC + MIN + reagg=true', () => {
      const result = service.mapAggregateFunctionToLookerType('MIN', FieldDataType.NUMBER);
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBe(AggregationType.MIN);
      expect(result.isReaggregatable).toBe(true);
    });

    it('STRING -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('MIN', FieldDataType.STRING);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });

    it('BOOLEAN -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('MIN', FieldDataType.BOOLEAN);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });
  });

  describe('MAX', () => {
    it('NUMBER -> METRIC + MAX + reagg=true', () => {
      const result = service.mapAggregateFunctionToLookerType('MAX', FieldDataType.NUMBER);
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBe(AggregationType.MAX);
      expect(result.isReaggregatable).toBe(true);
    });

    it('STRING -> DIMENSION (e.g. MAX(date) -> STRING in Looker)', () => {
      const result = service.mapAggregateFunctionToLookerType('MAX', FieldDataType.STRING);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });

    it('BOOLEAN -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('MAX', FieldDataType.BOOLEAN);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });
  });

  describe('COUNT', () => {
    it('NUMBER -> METRIC + SUM + reagg=true (counts sum correctly across groups)', () => {
      const result = service.mapAggregateFunctionToLookerType('COUNT', FieldDataType.NUMBER);
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBe(AggregationType.SUM);
      expect(result.isReaggregatable).toBe(true);
    });

    it('STRING -> METRIC + SUM + reagg=true (effective type is always INTEGER for COUNT)', () => {
      const result = service.mapAggregateFunctionToLookerType('COUNT', FieldDataType.STRING);
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBe(AggregationType.SUM);
      expect(result.isReaggregatable).toBe(true);
    });

    it('BOOLEAN -> METRIC + SUM + reagg=true', () => {
      const result = service.mapAggregateFunctionToLookerType('COUNT', FieldDataType.BOOLEAN);
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBe(AggregationType.SUM);
      expect(result.isReaggregatable).toBe(true);
    });
  });

  describe('COUNT_DISTINCT', () => {
    it('NUMBER -> METRIC + no defaultAgg + reagg=false', () => {
      const result = service.mapAggregateFunctionToLookerType(
        'COUNT_DISTINCT',
        FieldDataType.NUMBER
      );
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBeUndefined();
      expect(result.isReaggregatable).toBe(false);
    });

    it('STRING -> METRIC + no defaultAgg + reagg=false', () => {
      const result = service.mapAggregateFunctionToLookerType(
        'COUNT_DISTINCT',
        FieldDataType.STRING
      );
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBeUndefined();
      expect(result.isReaggregatable).toBe(false);
    });

    it('BOOLEAN -> METRIC + no defaultAgg + reagg=false', () => {
      const result = service.mapAggregateFunctionToLookerType(
        'COUNT_DISTINCT',
        FieldDataType.BOOLEAN
      );
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBeUndefined();
      expect(result.isReaggregatable).toBe(false);
    });
  });

  describe('STRING_AGG', () => {
    it('NUMBER -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('STRING_AGG', FieldDataType.NUMBER);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });

    it('STRING -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('STRING_AGG', FieldDataType.STRING);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });

    it('BOOLEAN -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('STRING_AGG', FieldDataType.BOOLEAN);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });
  });

  describe('ANY_VALUE', () => {
    it('NUMBER -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('ANY_VALUE', FieldDataType.NUMBER);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });

    it('STRING -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('ANY_VALUE', FieldDataType.STRING);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });

    it('BOOLEAN -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('ANY_VALUE', FieldDataType.BOOLEAN);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });
  });

  describe('P25', () => {
    it('NUMBER -> METRIC + no defaultAgg + reagg=false', () => {
      const result = service.mapAggregateFunctionToLookerType('P25', FieldDataType.NUMBER);
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBeUndefined();
      expect(result.isReaggregatable).toBe(false);
    });
    it('STRING -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('P25', FieldDataType.STRING);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });
  });

  describe('P50', () => {
    it('NUMBER -> METRIC + no defaultAgg + reagg=false', () => {
      const result = service.mapAggregateFunctionToLookerType('P50', FieldDataType.NUMBER);
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBeUndefined();
      expect(result.isReaggregatable).toBe(false);
    });
    it('STRING -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('P50', FieldDataType.STRING);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });
  });

  describe('P75', () => {
    it('NUMBER -> METRIC + no defaultAgg + reagg=false', () => {
      const result = service.mapAggregateFunctionToLookerType('P75', FieldDataType.NUMBER);
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBeUndefined();
      expect(result.isReaggregatable).toBe(false);
    });
    it('STRING -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('P75', FieldDataType.STRING);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });
  });

  describe('P95', () => {
    it('NUMBER -> METRIC + no defaultAgg + reagg=false', () => {
      const result = service.mapAggregateFunctionToLookerType('P95', FieldDataType.NUMBER);
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.defaultAggregationType).toBeUndefined();
      expect(result.isReaggregatable).toBe(false);
    });
    it('STRING -> DIMENSION', () => {
      const result = service.mapAggregateFunctionToLookerType('P95', FieldDataType.STRING);
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
    });
  });

  // Spec §8: an AGGREGATING calculated field's Looker semantics copy COUNT_DISTINCT's. It reaches
  // this mapper with NO aggregate function (no single report function describes a formula), which
  // is also how a plain native column arrives — and that branch answers METRIC + defaultAggregation
  // SUM + isReaggregatable true. Applied to `SUM(clicks) / NULLIF(SUM(impressions), 0)` that tells
  // Looker to sum a ratio: the non-additive roll-up this whole feature exists to remove.
  describe("level 'metric' (copies COUNT_DISTINCT semantics)", () => {
    it('NUMBER -> METRIC, not re-aggregatable, NO default aggregation', () => {
      const result = service.mapAggregateFunctionToLookerType(
        undefined,
        FieldDataType.NUMBER,
        'metric'
      );
      expect(result).toEqual({
        conceptType: FieldConceptType.METRIC,
        isReaggregatable: false,
      });
      expect(result.defaultAggregationType).toBeUndefined();
    });

    // Byte-for-byte the COUNT_DISTINCT answer — the spec names that mapping as the reference, so
    // pin the two together rather than restating the constant twice.
    it('matches the COUNT_DISTINCT semantics exactly', () => {
      expect(
        service.mapAggregateFunctionToLookerType(undefined, FieldDataType.NUMBER, 'metric')
      ).toEqual(service.mapAggregateFunctionToLookerType('COUNT_DISTINCT', FieldDataType.NUMBER));
    });

    // The declared type is the analyst's own choice; an aggregating field must not
    // become a groupable DIMENSION because its declared type name maps to a non-NUMBER Looker type.
    it('stays a non-re-aggregatable METRIC for a non-NUMBER declared type', () => {
      const result = service.mapAggregateFunctionToLookerType(
        undefined,
        FieldDataType.STRING,
        'metric'
      );
      expect(result.conceptType).toBe(FieldConceptType.METRIC);
      expect(result.isReaggregatable).toBe(false);
      expect(result.defaultAggregationType).toBeUndefined();
    });

    it('leaves a plain native NUMBER column untouched when no level is carried', () => {
      const result = service.mapAggregateFunctionToLookerType(undefined, FieldDataType.NUMBER);
      expect(result.defaultAggregationType).toBe(AggregationType.SUM);
      expect(result.isReaggregatable).toBe(true);
    });
  });

  // A ROW-LEVEL formula is a dimension: the SQL always makes it a GROUP BY key,
  // so it arrives in Looker under Dimensions — which is what `.changeset/6732-calculated-fields.md`
  // and the setup guide both promise. The level has to ARRIVE here for that: deriving it from
  // `dataType` is what the METRIC branch above deliberately refuses to do, and the declared type is
  // the analyst's own free choice, so it cannot stand in for the level.
  describe("level 'column' (row-level — a DIMENSION whatever its declared type)", () => {
    it('STRING -> DIMENSION, not the METRIC an aggregating formula gets', () => {
      const result = service.mapAggregateFunctionToLookerType(
        undefined,
        FieldDataType.STRING,
        'column'
      );
      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
      expect(result).not.toEqual(
        service.mapAggregateFunctionToLookerType(undefined, FieldDataType.STRING, 'metric')
      );
    });

    // The under-count this arm exists to remove: a NUMBER-typed row-level field on the ordinary
    // path came out METRIC + defaultAggregation SUM + re-aggregatable, so Looker re-summed
    // `price * quantity` over group keys the report's own GROUP BY had already deduplicated. Two
    // order lines of equal value in one country collapsed to one row, and the total under-counted
    // with no error anywhere.
    it('NUMBER -> DIMENSION, NOT the summable answer a native NUMBER column gets', () => {
      const result = service.mapAggregateFunctionToLookerType(
        undefined,
        FieldDataType.NUMBER,
        'column'
      );

      expect(result.conceptType).toBe(FieldConceptType.DIMENSION);
      expect(result.defaultAggregationType).toBeUndefined();
      expect(result.isReaggregatable).toBeUndefined();
      expect(result).not.toEqual(
        service.mapAggregateFunctionToLookerType(undefined, FieldDataType.NUMBER)
      );
    });

    // The declared type is the analyst's free choice, so the answer must not vary
    // with it — a type-keyed reading is the one "fix" that would pass the two tests above while
    // still handing Looker a summable metric for, say, a FLOAT-declared row-level field.
    it('answers DIMENSION for every declared type alike', () => {
      for (const dataType of Object.values(FieldDataType)) {
        expect(service.mapAggregateFunctionToLookerType(undefined, dataType, 'column')).toEqual({
          conceptType: FieldConceptType.DIMENSION,
        });
      }
    });
  });

  // The arm above premises "a row-level field has no report aggregation of its own, so being a
  // grouping key is its only shape". That premise is false: a report may apply
  // one, and the field then STOPS being a grouping key. The SQL emits
  // `COUNT(DISTINCT (<expr>)) AS "session_key | COUNTUNIQUE"` and the header carries that function,
  // so leaving it a DIMENSION files a count under Looker's Dimensions — a number the analyst cannot
  // plot, on a column the warehouse already aggregated.
  describe("level 'column' WITH a report aggregate function (the report aggregates it)", () => {
    // Not "METRIC because COUNT_DISTINCT", stated as a constant: once the report aggregates it, it
    // IS an ordinary aggregated column, so it must answer identically to one — including the
    // functions whose answer is DIMENSION (STRING_AGG, ANY_VALUE) and the type-gated ones.
    it('answers exactly as the same aggregation on a native column, for every function and type', () => {
      const allFuncs: AggregateFunction[] = [
        'SUM',
        'AVG',
        'MIN',
        'MAX',
        'COUNT',
        'COUNT_DISTINCT',
        'STRING_AGG',
        'ANY_VALUE',
      ];
      for (const fn of allFuncs) {
        for (const dataType of Object.values(FieldDataType)) {
          expect(service.mapAggregateFunctionToLookerType(fn, dataType, 'column')).toEqual(
            service.mapAggregateFunctionToLookerType(fn, dataType)
          );
        }
      }
    });

    // The headline case spelled out, so the pass above cannot be satisfied by both sides being
    // DIMENSION: `COUNT_DISTINCT(session_key)` is a METRIC Looker must not roll up further.
    it('COUNT_DISTINCT -> METRIC, not re-aggregatable — not the DIMENSION a grouping key gets', () => {
      const result = service.mapAggregateFunctionToLookerType(
        'COUNT_DISTINCT',
        FieldDataType.NUMBER,
        'column'
      );

      expect(result).toEqual({ conceptType: FieldConceptType.METRIC, isReaggregatable: false });
      expect(result).not.toEqual(
        service.mapAggregateFunctionToLookerType(undefined, FieldDataType.NUMBER, 'column')
      );
    });

    // An AGGREGATING formula is non-additive whatever function reaches here, so its arm stays
    // FIRST and never falls through to the switch. No rule may legally name such a field
    // (AGGREGATION_ON_CALCULATED_FIELD), and a stray one must not turn a ratio into a summable
    // metric.
    it("leaves level 'metric' on its own answer even when a function arrives", () => {
      expect(
        service.mapAggregateFunctionToLookerType('SUM', FieldDataType.NUMBER, 'metric')
      ).toEqual({ conceptType: FieldConceptType.METRIC, isReaggregatable: false });
    });
  });

  it('covers all AggregateFunction values (exhaustive check)', () => {
    const allFuncs: AggregateFunction[] = [
      'STRING_AGG',
      'MAX',
      'MIN',
      'SUM',
      'AVG',
      'COUNT',
      'COUNT_DISTINCT',
      'ANY_VALUE',
    ];
    for (const func of allFuncs) {
      for (const dt of Object.values(FieldDataType)) {
        expect(() => service.mapAggregateFunctionToLookerType(func, dt)).not.toThrow();
      }
    }
  });
});
