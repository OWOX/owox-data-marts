import { z } from 'zod';

export const EmailCredentialsType = 'email-credentials';

export const EmailCredentialsSchema = z
  .object({
    type: z.literal(EmailCredentialsType),
    to: z.array(z.string().email()).nonempty(),
  })
  .passthrough();

export type EmailCredentials = z.infer<typeof EmailCredentialsSchema>;
