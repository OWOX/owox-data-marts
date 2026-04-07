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
    it('should have sharedForReporting boolean column', () => {
      const col = getColumnMeta(DataMart, 'sharedForReporting');
      expect(col).toBeDefined();
      expect(col!.options.type).toBe('boolean');
      expect(col!.options.default).toBe(true);
    });

    it('should have sharedForMaintenance boolean column', () => {
      const col = getColumnMeta(DataMart, 'sharedForMaintenance');
      expect(col).toBeDefined();
      expect(col!.options.type).toBe('boolean');
      expect(col!.options.default).toBe(true);
    });
  });

  describe('DataStorage sharing fields', () => {
    it('should have sharedForUse boolean column', () => {
      const col = getColumnMeta(DataStorage, 'sharedForUse');
      expect(col).toBeDefined();
      expect(col!.options.type).toBe('boolean');
      expect(col!.options.default).toBe(true);
    });

    it('should have sharedForMaintenance boolean column', () => {
      const col = getColumnMeta(DataStorage, 'sharedForMaintenance');
      expect(col).toBeDefined();
      expect(col!.options.type).toBe('boolean');
      expect(col!.options.default).toBe(true);
    });
  });

  describe('DataDestination sharing fields', () => {
    it('should have sharedForUse boolean column', () => {
      const col = getColumnMeta(DataDestination, 'sharedForUse');
      expect(col).toBeDefined();
      expect(col!.options.type).toBe('boolean');
      expect(col!.options.default).toBe(true);
    });

    it('should have sharedForMaintenance boolean column', () => {
      const col = getColumnMeta(DataDestination, 'sharedForMaintenance');
      expect(col).toBeDefined();
      expect(col!.options.type).toBe('boolean');
      expect(col!.options.default).toBe(true);
    });
  });
});
