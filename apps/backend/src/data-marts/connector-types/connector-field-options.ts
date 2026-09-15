import { z } from 'zod';

/**
 * Allowed values of a connector configuration field resolved from the source
 * at configuration time (fields declared with the DYNAMIC_OPTIONS attribute).
 */
export const ConnectorFieldOptions = z.array(
  z.object({
    value: z.string(),
    label: z.string(),
  })
);

export type ConnectorFieldOptions = z.infer<typeof ConnectorFieldOptions>;
