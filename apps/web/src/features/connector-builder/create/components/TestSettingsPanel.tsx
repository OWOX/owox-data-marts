import { useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import { cn } from '@owox/ui/lib/utils';
import { ConsumerCredentialField } from '../../../credentials';
import type { TestCredentials } from '../../shared/model/hooks/useTestCredentials';
import type { ManifestParameter } from '../../shared/model/manifest.types';
import { asText, firstNonEmpty } from '../../shared/model/asText';
import { GENERATED_REFRESH_TOKEN } from '../../shared/model/credentialParameters';

/** A parameter is "satisfied" if it has a value or a usable default; required ones that are neither are flagged. */
function hasUsableDefault(param: ManifestParameter): boolean {
  return asText(param.default) !== '';
}

/** How the test gets its keys: typed here, or from a Credential. */
export interface TestCredentialControl {
  mode: 'values' | 'credential';
  onModeChange: (mode: 'values' | 'credential') => void;
  state: TestCredentials;
  onRetry: () => void;
  value: string | null;
  onChange: (credentialId: string) => void;
  /** Asks for the fitting list again after a Credential was created from the field. */
  onCreated?: () => void;
  /** The connector's name, for the Credential field's analytics. */
  consumerType: string;
}

const MODES = [
  ['values', 'Enter values'],
  ['credential', 'Use a Credential'],
] as const;

/**
 * The connector test inputs — node, parameter values, max rows — in a roomy
 * right-side panel (it replaced the cramped gear popover). Long parameter names
 * get their own full-width row; required and secret parameters are marked; entered
 * values are persisted by the dock so they survive runs and reloads.
 */
export function TestSettingsPanel({
  open,
  onOpenChange,
  nodeNames,
  node,
  onNodeChange,
  paramEntries,
  secretNames,
  values,
  onChangeValue,
  maxRows,
  onChangeMaxRows,
  onRun,
  running,
  credential,
  runBlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeNames: string[];
  node: string;
  onNodeChange: (node: string) => void;
  paramEntries: [string, ManifestParameter][];
  /** Parameters that hold a credential, masked here and never written to disk. */
  secretNames: Set<string>;
  values: Record<string, string>;
  onChangeValue: (name: string, value: string) => void;
  maxRows: number;
  onChangeMaxRows: (maxRows: number) => void;
  onRun: () => void;
  running: boolean;
  /** Without it the test only takes typed values. */
  credential?: TestCredentialControl;
  runBlocked?: boolean;
}) {
  const hasNodes = nodeNames.length > 0;
  const useCredential = credential?.mode === 'credential';
  const ready = credential?.state.status === 'ready' ? credential.state : null;
  // A refetch keeps the last known keys, so the section stays and the input keeps focus.
  const [lastKeys, setLastKeys] = useState<string[] | null>(null);
  if (ready && ready.requirement.keyParameters !== lastKeys) {
    setLastKeys(ready.requirement.keyParameters);
  }
  const knownKeys =
    ready?.requirement.keyParameters ?? (credential?.state.status === 'loading' ? lastKeys : null);
  const keyParameters = new Set(knownKeys);
  const typable = paramEntries.filter(([name]) => name !== GENERATED_REFRESH_TOKEN);
  // The key parameters are not asked for while a Credential supplies them (or until it is known which they are).
  const shownParams = useCredential
    ? knownKeys
      ? typable.filter(([name]) => !keyParameters.has(name))
      : []
    : typable;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' data-testid='test-settings' className='gap-0'>
        <SheetHeader>
          <SheetTitle>Test settings</SheetTitle>
          <SheetDescription>
            Configure how this connector is test-fetched. Values are saved on this device.
          </SheetDescription>
        </SheetHeader>

        {!hasNodes ? (
          <div className='p-4'>
            <p className='text-muted-foreground text-sm'>Add a node first to test the connector.</p>
          </div>
        ) : (
          <div className='flex flex-1 flex-col gap-5 overflow-auto p-4'>
            <label className='flex flex-col gap-1.5'>
              <span className='text-foreground text-sm font-medium'>Node</span>
              <Select value={node} onValueChange={onNodeChange}>
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {nodeNames.map(n => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            {credential && (
              <div className='flex flex-col gap-3'>
                <div
                  className='inline-flex self-start rounded-md border p-0.5'
                  role='tablist'
                  aria-label='Keys for the test'
                >
                  {MODES.map(([mode, label]) => (
                    <button
                      key={mode}
                      type='button'
                      role='tab'
                      aria-selected={credential.mode === mode}
                      data-testid={mode === 'values' ? 'testModeValues' : 'testModeCredential'}
                      onClick={() => {
                        credential.onModeChange(mode);
                      }}
                      className={cn(
                        'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                        credential.mode === mode
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {useCredential && (
                  <div className='flex flex-col gap-1.5' data-testid='testCredential'>
                    <span className='text-foreground text-sm font-medium'>Credential</span>
                    {credential.state.status === 'error' ? (
                      <div role='alert' className='flex items-center gap-3 text-sm'>
                        <span className='text-muted-foreground'>Could not load Credentials.</span>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={credential.onRetry}
                        >
                          Try again
                        </Button>
                      </div>
                    ) : ready ? (
                      <ConsumerCredentialField
                        consumer='connector-config'
                        consumerType={credential.consumerType}
                        createdFrom='builder'
                        isNew={false}
                        value={credential.value}
                        summary={null}
                        allowedCredentialIds={ready.ids}
                        customConnectorPrefill={{
                          hosts: ready.requirement.hosts,
                          fieldList: ready.requirement.fieldList,
                        }}
                        onChange={credential.onChange}
                        onCreated={credential.onCreated}
                      />
                    ) : (
                      <span className='text-muted-foreground text-sm'>Loading…</span>
                    )}
                    {ready?.requirement.misuse?.length ? (
                      <p className='text-destructive text-sm'>
                        {ready.requirement.misuse.join('; ')}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {shownParams.length > 0 && (
              <section className='flex flex-col gap-3'>
                <h3 className='text-muted-foreground text-[11.5px] font-semibold tracking-wide uppercase'>
                  Parameters
                </h3>
                {shownParams.map(([name, param]) => {
                  const isSecret = secretNames.has(name);
                  const label = firstNonEmpty(param.label, name);
                  const value = values[name] ?? '';
                  const missing = param.isRequired && !value && !hasUsableDefault(param);
                  return (
                    <label key={name} className='flex flex-col gap-1.5'>
                      <span className='text-foreground flex items-center gap-1.5 text-sm font-medium'>
                        <span className='break-all'>{label}</span>
                        {param.isRequired && (
                          <span className='text-red-500' aria-hidden>
                            *
                          </span>
                        )}
                        {isSecret && (
                          <span className='bg-accent text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase'>
                            secret
                          </span>
                        )}
                      </span>
                      {label !== name && (
                        <span className='text-muted-foreground font-mono text-[11px] break-all'>
                          {name}
                        </span>
                      )}
                      <Input
                        type={
                          isSecret
                            ? 'password'
                            : param.requiredType === 'number'
                              ? 'number'
                              : 'text'
                        }
                        value={value}
                        onChange={e => {
                          onChangeValue(name, e.target.value);
                        }}
                        placeholder={
                          hasUsableDefault(param) ? `Default: ${String(param.default)}` : label
                        }
                        aria-invalid={missing || undefined}
                        data-testid={`test-param-${name}`}
                      />
                      {missing && <span className='text-[11px] text-red-500'>Required</span>}
                    </label>
                  );
                })}
              </section>
            )}

            <label className='flex flex-col gap-1.5'>
              <span className='text-foreground text-sm font-medium'>Max rows</span>
              <Input
                type='number'
                className='w-32'
                value={maxRows}
                onChange={e => {
                  onChangeMaxRows(Number(e.target.value));
                }}
              />
            </label>
          </div>
        )}

        {hasNodes && (
          <SheetFooter className='border-t'>
            <Button
              onClick={onRun}
              disabled={running || !node || runBlocked}
              data-testid='run-test-settings'
              className={cn('w-full gap-1.5')}
            >
              <Play className='h-3.5 w-3.5' />
              {running ? 'Running…' : 'Run test'}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
