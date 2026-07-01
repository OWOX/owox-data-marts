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
