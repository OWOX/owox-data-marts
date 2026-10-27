import { maxLength } from 'class-validator';
import { z } from 'zod-v4';
import {
  DATA_MART_ICON_MAX_LENGTH,
  DataMartIcon,
} from '../../../../data-marts/facades/mcp-contexts.facade';

export const contextNameSchema = z
  .string()
  .min(1)
  .refine(value => maxLength(value, 255), 'Name must not exceed 255 characters')
  .describe(
    'Context name, 1–255 characters, using the same Unicode length rules as the Context API.'
  );

export const contextIconSchema = z
  .union([
    z.enum(DataMartIcon),
    z.templateLiteral(['lucide:', z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]),
  ])
  .refine(value => value.length <= DATA_MART_ICON_MAX_LENGTH, 'Icon is too long')
  .meta({ maxLength: DATA_MART_ICON_MAX_LENGTH })
  .describe(
    'Built-in icon key or lucide:<kebab-case-name>, for example purchases or lucide:megaphone.'
  );

export const contextIconOutputSchema = z
  .string()
  .max(DATA_MART_ICON_MAX_LENGTH)
  .nullable()
  .describe(
    'Stored icon key, including keys from other application versions; null uses the default icon.'
  );
