import { describe, expect, it } from 'vitest';
import { flattenNativeFields } from './flatten-native-fields';
import type { NativeField } from '../types/relationship.types';

const field = (name: string, extra: Partial<NativeField> = {}): NativeField =>
  ({ name, type: 'STRING', status: 'CONNECTED', ...extra }) as NativeField;

describe('flattenNativeFields', () => {
  it('flattens a nested RECORD into dotted paths beside its parent', () => {
    const fields = [
      field('country'),
      field('metrics', {
        type: 'RECORD',
        fields: [field('clicks', { type: 'INTEGER' })],
      } as Partial<NativeField>),
    ];

    expect(flattenNativeFields(fields).map(f => f.name)).toEqual([
      'country',
      'metrics',
      'metrics.clicks',
    ]);
  });

  it('drops a field hidden for reporting, and its subtree with it', () => {
    const fields = [
      field('country'),
      field('internal', {
        type: 'RECORD',
        isHiddenForReporting: true,
        fields: [field('secret')],
      } as Partial<NativeField>),
    ];

    expect(flattenNativeFields(fields).map(f => f.name)).toEqual(['country']);
  });

  it('drops a DISCONNECTED warehouse column, which is unavailable for reporting', () => {
    const fields = [field('country'), field('gone', { status: 'DISCONNECTED' })];

    expect(flattenNativeFields(fields).map(f => f.name)).toEqual(['country']);
  });

  it('keeps a DISCONNECTED calculated field: it is never sourced from the warehouse', () => {
    // The status is warehouse-derived and means nothing for a formula, so it must not hide one.
    const fields = [
      field('country'),
      field('ratio', {
        status: 'DISCONNECTED',
        calculated: { formula: '1', level: 'column' },
      } as Partial<NativeField>),
    ];

    expect(flattenNativeFields(fields).map(f => f.name)).toEqual(['country', 'ratio']);
  });

  it('still hides a calculated field the analyst hid for reporting', () => {
    // That one IS a governance choice rather than a warehouse-status artifact.
    const fields = [
      field('ratio', {
        isHiddenForReporting: true,
        calculated: { formula: '1', level: 'column' },
      } as Partial<NativeField>),
    ];

    expect(flattenNativeFields(fields)).toEqual([]);
  });

  it('reports a REPEATED field by its ARRAY comparison type, not its element type', () => {
    // String operators are type errors on an array column, and the backend validator says so.
    const fields = [field('tags', { mode: 'REPEATED' } as Partial<NativeField>)];

    expect(flattenNativeFields(fields)[0].type).toBe('ARRAY<STRING>');
  });
});
