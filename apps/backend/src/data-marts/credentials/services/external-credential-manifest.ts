import { z } from 'zod';
import {
  CredentialDocumentationUrlSchema,
  type CredentialDefinitionContract,
} from '../credential.types';

const RESERVED_NAMES = new Set([
  'ai',
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
  'github',
  'then',
]);
const BLOCKED_AUTH_HEADERS = new Set([
  'connection',
  'content-length',
  'cookie',
  'forwarded',
  'host',
  'proxy-authorization',
  'set-cookie',
  'transfer-encoding',
]);
const JS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const ModelSchema = z
  .object({
    id: z.string().trim().min(1).max(255),
    name: z.string().trim().min(1).max(255),
  })
  .strict();

const ExternalAiSchema = z
  .object({
    adapter: z
      .object({
        type: z.enum(['openai', 'anthropic', 'google', 'openrouter', 'openai-compatible']),
        baseUrl: z.string().url().startsWith('https://'),
      })
      .strict(),
    models: z
      .object({
        language: z.array(ModelSchema).min(1).max(100),
        embedding: z.array(ModelSchema).max(100).default([]),
      })
      .strict(),
    recommended: z
      .object({
        fast: z.string().trim().min(1),
        reasoning: z.string().trim().min(1),
        embedding: z.string().trim().min(1).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((ai, context) => {
    const languageIds = new Set(ai.models.language.map(model => model.id));
    const embeddingIds = new Set(ai.models.embedding.map(model => model.id));
    for (const capability of ['fast', 'reasoning'] as const) {
      if (!languageIds.has(ai.recommended[capability])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recommended', capability],
          message: `${capability} must reference a declared language model`,
        });
      }
    }
    if (ai.recommended.embedding && !embeddingIds.has(ai.recommended.embedding)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recommended', 'embedding'],
        message: 'embedding must reference a declared embedding model',
      });
    }
  });

const ExternalCredentialManifestSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(2000).default(''),
    delivery: z.object({ type: z.literal('credential-definition') }).strict(),
    credential: z
      .object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .refine(
            name => JS_IDENTIFIER.test(name),
            'credential.name must be a JavaScript identifier'
          )
          .refine(name => !RESERVED_NAMES.has(name), 'credential.name is reserved'),
        documentationUrl: CredentialDocumentationUrlSchema.optional(),
        authentication: z
          .object({
            type: z.literal('secret'),
            label: z.string().trim().min(1).max(255),
            placement: z
              .object({
                type: z.literal('header'),
                name: z
                  .string()
                  .trim()
                  .min(1)
                  .max(255)
                  .refine(name => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name), 'invalid header name')
                  .refine(
                    name => !BLOCKED_AUTH_HEADERS.has(name.toLowerCase()),
                    'header is reserved'
                  ),
                scheme: z.string().trim().min(1).max(64).optional(),
              })
              .strict(),
          })
          .strict(),
        origins: z.array(z.string().url().startsWith('https://')).min(1).max(20),
        validation: z
          .object({
            method: z.enum(['GET', 'POST']).default('GET'),
            path: z.string().startsWith('/').max(2048),
            headers: z.record(z.string()).optional(),
            successStatuses: z.array(z.number().int().min(200).max(399)).min(1).max(20).optional(),
            rejectedStatuses: z.array(z.number().int().min(400).max(499)).min(1).max(20).optional(),
          })
          .strict()
          .optional(),
        ai: ExternalAiSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type ExternalCredentialManifestResult =
  | { readonly ok: true; readonly contract: CredentialDefinitionContract }
  | { readonly ok: false; readonly detail: string };

export function parseExternalCredentialManifest(
  source: string | null
): ExternalCredentialManifestResult {
  if (source === null) return { ok: false, detail: 'plugin.json was not found' };
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    return { ok: false, detail: 'plugin.json is not valid JSON' };
  }
  const parsed = ExternalCredentialManifestSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (!issue) return { ok: false, detail: 'manifest is invalid' };
    const path = issue.path.join('.');
    return { ok: false, detail: path ? `${path}: ${issue.message}` : issue.message };
  }
  const { credential, name, description } = parsed.data;
  return {
    ok: true,
    contract: {
      id: credential.name,
      displayName: name,
      description,
      documentationUrl: credential.documentationUrl,
      auth: {
        type: 'header',
        label: credential.authentication.label,
        headerName: credential.authentication.placement.name,
        prefix: credential.authentication.placement.scheme
          ? `${credential.authentication.placement.scheme} `
          : undefined,
      },
      origins: [...new Set(credential.origins.map(origin => new URL(origin).origin))],
      validation: credential.validation,
      ai: credential.ai
        ? {
            adapter: credential.ai.adapter.type,
            baseUrl: credential.ai.adapter.baseUrl,
            models: credential.ai.models,
            recommended: credential.ai.recommended,
          }
        : undefined,
    },
  };
}
