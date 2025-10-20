import { z } from 'zod';

/**
 * Provides OWOX style message envelope format.
 * {
 *   "version": "1.0",
 *   "body": { ... },
 *   "order": 123456, // timestamp with millis
 *   "producer": { "name": "owox-data-mats" }
 * }
 */

const MESSAGE_VERSION = '1.0' as const;
const DEFAULT_PRODUCER_NAME = 'owox-data-mats' as const;

export interface ProducerInfo {
  name: string;
}

export interface OwoxMessage<TBody extends Record<string, unknown> = Record<string, unknown>> {
  version: typeof MESSAGE_VERSION;
  body: TBody;
  /** Timestamp with milliseconds since epoch */
  order: number;
  producer: ProducerInfo;
}

const ProducerSchema = z.object({
  name: z.string().min(1),
});

// We validate the envelope shape (version/order/producer). Body is kept generic
const OwoxMessageBaseSchema = z.object({
  version: z.literal(MESSAGE_VERSION),
  order: z.number().int().nonnegative(),
  producer: ProducerSchema,
});

/**
 * Build an OWOX message envelope around provided body.
 */
export function buildOwoxMessage<TBody extends Record<string, unknown>>(
  body: TBody
): OwoxMessage<TBody> {
  const message: OwoxMessage<TBody> = {
    version: MESSAGE_VERSION,
    body,
    order: Date.now(),
    producer: {
      name: DEFAULT_PRODUCER_NAME,
    },
  };

  OwoxMessageBaseSchema.parse({
    version: message.version,
    order: message.order,
    producer: message.producer,
  });

  return message;
}
