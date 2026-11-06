import { z } from 'zod';

/**
 * Allowed values of a connector configuration field resolved from the source
 * at configuration time (fields declared with the DYNAMIC_OPTIONS attribute).
 *
 * `url`, when a source provides it, opens the value in the provider (for example
 * one tab of a spreadsheet). Only `https://` links are kept: the web renders it as
 * a link, and a malformed one is dropped rather than failing the whole list.
 */
export const ConnectorFieldOptions = z.array(
  z.object({
    value: z.string(),
    label: z.string(),
    url: z
      .url({ protocol: /^https$/ })
      .optional()
      .catch(() => undefined),
  })
);

export type ConnectorFieldOptions = z.infer<typeof ConnectorFieldOptions>;
