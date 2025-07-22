import { Column, ColumnOptions } from 'typeorm';
import { jsonTransformer, booleanTransformer } from '../utils/database.js';

/**
 * JSON column stored as TEXT with automatic transformation
 */
export function JsonColumn(options?: ColumnOptions): PropertyDecorator {
  return Column({
    type: 'text',
    transformer: jsonTransformer,
    default: '{}',
    ...options,
  });
}

/**
 * Boolean column stored as INTEGER (0/1) with automatic transformation
 */
export function BooleanColumn(options?: ColumnOptions): PropertyDecorator {
  return Column({
    type: 'integer',
    transformer: booleanTransformer,
    default: 0,
    ...options,
  });
}

/**
 * Text column for IDs
 */
export function IdColumn(options?: ColumnOptions): PropertyDecorator {
  return Column({
    type: 'text',
    ...options,
  });
}
