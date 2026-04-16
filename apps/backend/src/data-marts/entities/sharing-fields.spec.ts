import 'reflect-metadata';
import { DataMart } from './data-mart.entity';
import { DataStorage } from './data-storage.entity';
import { DataDestination } from './data-destination.entity';
import { getMetadataArgsStorage } from 'typeorm';

describe('Sharing fields on entities', () => {
  const columns = getMetadataArgsStorage().columns;

  function getColumnMeta(target: unknown, propertyName: string) {
    return columns.find(c => c.target === target && c.propertyName === propertyName);
  }

  describe('DataMart sharing fields', () => {
    it('should have availableForReporting boolean column', () => {
      const col = getColumnMeta(DataMart, 'availableForReporting');
      expect(col).toBeDefined();
      expect(col!.options.type).toBe('boolean');
      expect(col!.options.default).toBe(false);
    });

    it('should have availableForMaintenance boolean column', () => {
      const col = getColumnMeta(DataMart, 'availableForMaintenance');
      expect(col).toBeDefined();
      expect(col!.options.type).toBe('boolean');
      expect(col!.options.default).toBe(false);
    });
  });

  describe('DataStorage sharing fields', () => {
    it('should have availableForUse boolean column', () => {
      const col = getColumnMeta(DataStorage, 'availableForUse');
      expect(col).toBeDefined();
      expect(col!.options.type).toBe('boolean');
      expect(col!.options.default).toBe(false);
    });

    it('should have availableForMaintenance boolean column', () => {
      const col = getColumnMeta(DataStorage, 'availableForMaintenance');
      expect(col).toBeDefined();
      expect(col!.options.type).toBe('boolean');
      expect(col!.options.default).toBe(false);
    });
  });

  describe('DataDestination sharing fields', () => {
    it('should have availableForUse boolean column', () => {
      const col = getColumnMeta(DataDestination, 'availableForUse');
      expect(col).toBeDefined();
      expect(col!.options.type).toBe('boolean');
      expect(col!.options.default).toBe(false);
    });

    it('should have availableForMaintenance boolean column', () => {
      const col = getColumnMeta(DataDestination, 'availableForMaintenance');
      expect(col).toBeDefined();
      expect(col!.options.type).toBe('boolean');
      expect(col!.options.default).toBe(false);
    });
  });
});
