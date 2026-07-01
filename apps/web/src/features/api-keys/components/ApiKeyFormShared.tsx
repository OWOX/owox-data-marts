import type { ReactNode } from 'react';
import { FormLabel, FormSection } from '@owox/ui/components/form';
import { ExternalLink } from 'lucide-react';

const API_KEYS_DOCS_URL = 'https://docs.owox.com/docs/api/api-keys/';
const OWOX_CTL_DOCS_URL = 'https://docs.owox.com/docs/api/owox-ctl/';
const API_CLIENT_DOCS_URL = 'https://docs.owox.com/docs/api/api-client/';
const OPENAPI_DOCS_URL = 'https://docs.owox.com/docs/api/openapi/';

interface ApiKeyFormLabelProps {
  description: string;
  children: ReactNode;
}

export function ApiKeyFormLabel({ description, children }: ApiKeyFormLabelProps) {
  return <FormLabel tooltip={description}>{children}</FormLabel>;
}

interface DocumentationLinkProps {
  href: string;
  title: string;
  description?: string;
  code?: boolean;
}

function DocumentationLink({ href, title, description, code = false }: DocumentationLinkProps) {
  const label = description ? `${title} ${description}` : title;

  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      aria-label={label}
      className='group border-border/70 text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-11 w-full items-center justify-between rounded-md border bg-white/60 px-3 py-2 text-sm font-medium no-underline shadow-xs transition-colors hover:bg-white focus-visible:ring-[3px] focus-visible:outline-none dark:border-white/8 dark:bg-white/4 dark:hover:bg-white/8'
    >
      <span className='flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5'>
        {code ? (
          <code className='bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs font-medium'>
            {title}
          </code>
        ) : (
          <span className='truncate'>{title}</span>
        )}
        {description ? <span className='truncate'>{description}</span> : null}
      </span>
      <ExternalLink
        className='text-muted-foreground ml-2 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100 group-focus-visible:opacity-100'
        aria-hidden='true'
      />
    </a>
  );
}

export function ApiKeyDocumentationSection({ name }: { name: string }) {
  return (
    <FormSection title='Documentation' name={name} defaultOpen={false}>
      <DocumentationLink href={API_KEYS_DOCS_URL} title='API Keys' />
      <DocumentationLink href={OWOX_CTL_DOCS_URL} title='owox-ctl' description='CLI tool' code />
      <DocumentationLink
        href={API_CLIENT_DOCS_URL}
        title='@owox/api-client'
        description='TypeScript/JavaScript API Client'
        code
      />
      <DocumentationLink href={OPENAPI_DOCS_URL} title='OpenAPI and Swagger UI' />
    </FormSection>
  );
}
