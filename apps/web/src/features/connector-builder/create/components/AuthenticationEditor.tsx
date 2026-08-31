import { useState, type ReactNode } from 'react';
import { Input } from '@owox/ui/components/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { Lock } from 'lucide-react';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../../shared/components/CollapsibleCard';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import {
  createDefaultAuthentication,
  type AuthInject,
  type BranchAuthentication,
  type BuilderAuthentication,
  type SelectiveAuthentication,
} from '../../shared/model/manifest.types';
import { BasicEditor } from './auth/BasicEditor';
import { ExchangeEditor } from './auth/ExchangeEditor';
import { InjectEditor } from './auth/InjectEditor';
import { OAuth2Editor } from './auth/OAuth2Editor';
import { InfoLabel, OptionSelect, Segmented } from './fields';

type AuthChoice = 'none' | BuilderAuthentication['type'];
const CHOICES: { key: AuthChoice; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'apiKey', label: 'API Key' },
  { key: 'basic', label: 'Basic' },
  { key: 'bearer', label: 'Bearer' },
  { key: 'tokenExchange', label: 'Token Exchange' },
  { key: 'oauth2', label: 'OAuth2' },
  { key: 'selective', label: 'Selective' },
];

type BranchType = BranchAuthentication['type'];
const BRANCH_CHOICES: { value: BranchType; label: string }[] = [
  { value: 'apiKey', label: 'API Key' },
  { value: 'basic', label: 'Basic' },
  { value: 'bearer', label: 'Bearer' },
  { value: 'tokenExchange', label: 'Token Exchange' },
  { value: 'oauth2', label: 'OAuth2' },
];

const Tok = ({ children }: { children: ReactNode }) => (
  <code className='bg-background rounded px-1 py-0.5 font-mono text-[12px]'>{children}</code>
);

/** Short explainer for each authentication type, shown in a collapsible hint under the picker. */
const AUTH_HELP: Record<AuthChoice, { title: string; body: ReactNode }> = {
  none: {
    title: 'What does "None" mean?',
    body: (
      <p>
        Requests are sent without any credentials. Use this for public APIs that need no
        authentication.
      </p>
    ),
  },
  apiKey: {
    title: 'How does API Key authentication work?',
    body: (
      <>
        <p>
          The connector adds a secret value to every request as an API key — either a query
          parameter or a header.
        </p>
        <p>
          Set <strong>Into</strong> (query or header), the field <strong>Name</strong> (e.g.{' '}
          <Tok>api_key</Tok> or <Tok>X-Api-Key</Tok>), and the value <strong>Format</strong>,
          usually a parameter token like <Tok>{'{{ parameters.ApiKey }}'}</Tok>.
        </p>
      </>
    ),
  },
  basic: {
    title: 'How does Basic authentication work?',
    body: (
      <p>
        HTTP Basic auth. The connector base64-encodes a <strong>Username</strong> and{' '}
        <strong>Password</strong> (typically parameter tokens like{' '}
        <Tok>{'{{ parameters.User }}'}</Tok> / <Tok>{'{{ parameters.Pass }}'}</Tok>) into the{' '}
        <Tok>Authorization</Tok> header.
      </p>
    ),
  },
  bearer: {
    title: 'How does Bearer authentication work?',
    body: (
      <p>
        The connector sends a token in the <Tok>Authorization</Tok> header as{' '}
        <Tok>Bearer &lt;token&gt;</Tok>. The <strong>Format</strong> holds the value, e.g.{' '}
        <Tok>{'Bearer {{ parameters.Token }}'}</Tok>. Set a <strong>Token URL</strong> only if the
        token must be fetched first.
      </p>
    ),
  },
  tokenExchange: {
    title: 'How does Token Exchange work?',
    body: (
      <>
        <p>
          The connector first calls a token endpoint (<strong>URL</strong>) with a{' '}
          <strong>Body</strong> to obtain a short-lived token, then reads it from the response at{' '}
          <strong>Token path</strong>.
        </p>
        <p>
          That token becomes available as <Tok>{'{{ auth.token }}'}</Tok> and is injected into the
          following requests, e.g. <Tok>{'Bearer {{ auth.token }}'}</Tok>.
        </p>
      </>
    ),
  },
  oauth2: {
    title: 'How does OAuth2 authentication work?',
    body: (
      <p>
        Exchanges a refresh token for an access token and refreshes it automatically. A rotated
        refresh token is stored for the next run when the connector uses a stored credential.
      </p>
    ),
  },
  selective: {
    title: 'How does Selective authentication work?',
    body: (
      <p>
        Pick one of several authenticators at run time. The value of the{' '}
        <strong>Selection parameter</strong> chooses which branch is used — handy when one API
        supports more than one auth scheme.
      </p>
    ),
  },
};

function AuthTypeHelp({ choice }: { choice: AuthChoice }) {
  const help = AUTH_HELP[choice];
  return (
    <Accordion variant='common' type='single' collapsible>
      {/* keyed by choice so the hint resets (collapsed) when the type changes */}
      <AccordionItem value={`auth-help-${choice}`}>
        <AccordionTrigger>{help.title}</AccordionTrigger>
        <AccordionContent>{help.body}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function SelectiveEditor({ auth }: { auth: SelectiveAuthentication }) {
  const { setPath } = useBuilder();
  const [newKey, setNewKey] = useState('');

  const addBranch = () => {
    const key = newKey.trim();
    if (!key || key in auth.authenticators) return;
    setPath(['authentication', 'authenticators', key], createDefaultAuthentication('apiKey'));
    setNewKey('');
  };

  const removeBranch = (key: string) => {
    const next = Object.fromEntries(Object.entries(auth.authenticators).filter(([k]) => k !== key));
    setPath(['authentication', 'authenticators'], next);
  };

  // A manifest loaded from JSON can carry a null branch, which the type does not
  // spell out — widened here so the guard below is meaningful to the checker.
  const branchEntries = Object.entries(
    auth.authenticators as Record<string, (typeof auth.authenticators)[string] | undefined>
  ).filter((entry): entry is [string, (typeof auth.authenticators)[string]] => entry[1] != null);

  const changeBranchType = (key: string, type: BranchType) => {
    setPath(['authentication', 'authenticators', key], createDefaultAuthentication(type));
  };

  return (
    <div className='flex flex-col gap-4'>
      <label className='flex flex-col'>
        <InfoLabel hint='The request parameter whose value selects the authenticator branch.'>
          Selection parameter
        </InfoLabel>
        <Input
          aria-label='Selection parameter'
          value={auth.selectionParameter}
          onChange={e => {
            setPath(['authentication', 'selectionParameter'], e.target.value);
          }}
          placeholder='AuthMethod'
        />
      </label>

      {branchEntries.map(([key, branch]) => {
        const basePath: (string | number)[] = ['authentication', 'authenticators', key];
        return (
          <div key={key} className='flex flex-col gap-2 rounded-lg border p-4'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium'>{key}</span>
              <button
                type='button'
                onClick={() => {
                  removeBranch(key);
                }}
                className='text-muted-foreground hover:text-destructive text-xs'
              >
                Remove
              </button>
            </div>
            <label className='flex flex-col'>
              <InfoLabel hint='Authentication type for this branch.'>Branch type</InfoLabel>
              <OptionSelect
                ariaLabel={`Branch ${key} type`}
                value={branch.type}
                onValueChange={raw => {
                  changeBranchType(key, raw as BranchType);
                }}
                options={BRANCH_CHOICES}
                className='w-auto'
              />
            </label>
            {(branch.type === 'apiKey' || branch.type === 'bearer' || branch.type === 'oauth2') && (
              <InjectEditor
                basePath={basePath}
                auth={branch as Extract<BranchAuthentication, { inject: AuthInject }>}
              />
            )}
            {branch.type === 'basic' && <BasicEditor basePath={basePath} auth={branch} />}
            {branch.type === 'tokenExchange' && (
              <ExchangeEditor basePath={basePath} auth={branch} />
            )}
            {branch.type === 'oauth2' && <OAuth2Editor basePath={basePath} auth={branch} />}
          </div>
        );
      })}

      <div className='flex gap-2'>
        <Input
          value={newKey}
          onChange={e => {
            setNewKey(e.target.value);
          }}
          placeholder='branch key'
          className='flex-1'
        />
        <button
          type='button'
          onClick={addBranch}
          className='bg-input text-muted-foreground rounded-lg border px-4 py-2 text-[13px]'
        >
          Add branch
        </button>
      </div>
    </div>
  );
}

export function AuthenticationEditor() {
  const { manifest, setPath } = useBuilder();
  const auth = manifest.authentication;
  const current: AuthChoice = auth?.type ?? 'none';

  const choose = (choice: AuthChoice) => {
    if (choice === 'none') setPath(['authentication'], undefined);
    else setPath(['authentication'], createDefaultAuthentication(choice));
  };

  return (
    <div className='px-6 py-[18px]' data-testid='authentication-editor'>
      <CollapsibleCard collapsible name='connector-authentication'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={Lock}
            tooltip='How the connector authorizes its requests.'
          >
            Authentication
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='flex max-w-[760px] flex-col gap-4'>
            <div>
              <InfoLabel hint='How the connector authorizes its requests. Switching it swaps the configuration below.'>
                Authentication type
              </InfoLabel>
              {/* The shared control, not a local copy of its markup: it is what makes
                  re-clicking the current type a no-op instead of a silent reset. */}
              <Segmented
                options={CHOICES}
                value={current}
                onChange={choose}
                ariaLabel='Authentication type'
              />
            </div>

            <AuthTypeHelp choice={current} />

            {current === 'bearer' && (
              <label className='flex flex-col'>
                <InfoLabel hint='Endpoint that issues the bearer token (optional).'>
                  Token URL (optional)
                </InfoLabel>
                <Input
                  value={(auth as { tokenUrl?: string } | undefined)?.tokenUrl ?? ''}
                  onChange={e => {
                    setPath(
                      ['authentication', 'tokenUrl'],
                      e.target.value === '' ? undefined : e.target.value
                    );
                  }}
                  placeholder='https://auth.example.com/token'
                  className='font-mono'
                />
              </label>
            )}

            {current === 'tokenExchange' && (
              <ExchangeEditor
                auth={auth as Extract<BuilderAuthentication, { type: 'tokenExchange' }>}
              />
            )}
            {current === 'oauth2' && (
              <OAuth2Editor auth={auth as Extract<BuilderAuthentication, { type: 'oauth2' }>} />
            )}
            {current === 'basic' && (
              <BasicEditor auth={auth as Extract<BuilderAuthentication, { type: 'basic' }>} />
            )}
            {current !== 'none' && current !== 'basic' && current !== 'selective' && (
              <InjectEditor auth={auth as Extract<BuilderAuthentication, { inject: AuthInject }>} />
            )}
            {current === 'selective' && <SelectiveEditor auth={auth as SelectiveAuthentication} />}
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>
    </div>
  );
}
