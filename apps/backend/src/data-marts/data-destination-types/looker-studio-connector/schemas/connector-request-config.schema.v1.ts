import { z } from 'zod';
import { ConnectorRequestBaseConfigSchema } from './connector-request-base-config.schema';

export const ConnectorRequestConfigV1Schema = ConnectorRequestBaseConfigSchema.extend({
  reportId: z.string(),
});

export type ConnectorRequestConfigV1 = z.infer<typeof ConnectorRequestConfigV1Schema>;
