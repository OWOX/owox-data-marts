import { z } from 'zod';

const privateKeyRegex = /^-----BEGIN PRIVATE KEY-----\n[\s\S]*\n-----END PRIVATE KEY-----\n?$/;

export const GoogleServiceAccountKeySchema = z
  .object({
    type: z.literal('service_account'),
    project_id: z.string().min(1, 'project_id is required'),
    private_key_id: z.string().min(1, 'private_key_id is required'),
    private_key: z
      .string()
      .min(1, 'private_key is required')
      .regex(privateKeyRegex, 'private_key must be a valid PEM format private key'),
    client_email: z.string().email('client_email must be a valid email'),
    client_id: z.string().min(1, 'client_id is required'),
    auth_uri: z
      .string()
      .url('auth_uri must be a valid URL')
      .default('https://accounts.google.com/o/oauth2/auth'),
    token_uri: z
      .string()
      .url('token_uri must be a valid URL')
      .default('https://oauth2.googleapis.com/token'),
    auth_provider_x509_cert_url: z
      .string()
      .url('auth_provider_x509_cert_url must be a valid URL')
      .default('https://www.googleapis.com/oauth2/v1/certs'),
    client_x509_cert_url: z.string().url('client_x509_cert_url must be a valid URL'),
    universe_domain: z.string().default('googleapis.com'),
  })
  .passthrough();

export type GoogleServiceAccountKey = z.infer<typeof GoogleServiceAccountKeySchema>;
