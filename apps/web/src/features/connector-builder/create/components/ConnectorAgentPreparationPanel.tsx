import { useEffect, useState } from 'react';
import { Button } from '@owox/ui/components/button';
import { ConnectorBuilderApiService } from '../../shared/api/connector-builder-api.service';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import { apiErrorMessage } from '../../../../app/api/extract-api-error.util';

function manifestValuePaths(
  value: unknown,
  path: string[] = []
): { path: string[]; value: string }[] {
  if (path.length > 32) return [];
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, child]) =>
      manifestValuePaths(child, [...path, key])
    );
  return path.length === 1 && path[0] === 'name' ? [] : [{ path, value: JSON.stringify(value) }];
}

/** All credential-bearing values are deliberately selected by the author, never guessed. */
export function ConnectorAgentPreparationPanel() {
  const { state, manifest } = useBuilder();
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [configuration, setConfiguration] = useState('');
  const [message, setMessage] = useState('');
  const [references, setReferences] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSelected([]);
    setReviewed(false);
    setConfiguration('');
  }, [state.id, state.revision, state.loadedVersion]);
  if (!state.id || state.revision === undefined || state.loadedVersion === null) return null;
  const id = state.id;
  const expectedRevision = state.revision;
  const version = state.loadedVersion;
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Review could not be saved'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className='border-border mx-4 rounded border p-3'>
      <summary>Allow AI assistance</summary>
      <p className='my-2 text-sm'>
        Save your draft first. Select every value that contains credentials or other private
        information. The remaining content will be available to your AI assistant.
      </p>
      <fieldset
        disabled={busy || state.dirty}
        className='flex max-h-64 flex-col gap-2 overflow-auto'
      >
        <legend className='text-sm font-medium'>Values to keep private</legend>
        {manifestValuePaths(manifest).map(({ path, value }) => {
          const key = JSON.stringify(path);
          return (
            <label key={key} className='flex gap-2 text-xs'>
              <input
                type='checkbox'
                checked={selected.includes(key)}
                onChange={event => {
                  setReviewed(false);
                  setSelected(current =>
                    event.target.checked ? [...current, key] : current.filter(item => item !== key)
                  );
                }}
              />
              <span className='break-all'>
                {path.join(' / ')}: {value}
              </span>
            </label>
          );
        })}
      </fieldset>
      <label className='my-3 flex gap-2 text-sm'>
        <input
          type='checkbox'
          checked={reviewed}
          disabled={state.dirty || busy}
          onChange={event => {
            setReviewed(event.target.checked);
          }}
        />
        I reviewed all remaining content and confirm it contains no private values.
      </label>
      <Button
        disabled={!reviewed || state.dirty || busy}
        onClick={() => {
          void run(async () => {
            const result = await new ConnectorBuilderApiService().prepareForAgent(id, {
              expectedRevision,
              version,
              protectedPaths: selected.map(key => JSON.parse(key) as string[]),
              reviewedNonSecretContent: true,
            });
            setReferences(current => [...current, result.preparationId]);
            setMessage('Safe editing is ready for your assistant for 30 minutes.');
          });
        }}
      >
        Allow safe editing
      </Button>
      <p className='my-2 text-sm'>
        Approve credentials separately for testing this saved draft. This approval expires in 10
        minutes and cannot authorize a production load.
      </p>
      <label className='flex flex-col gap-1 text-sm'>
        Test parameter values as JSON
        <input
          type='password'
          autoComplete='off'
          value={configuration}
          onChange={event => {
            setConfiguration(event.target.value);
          }}
        />
      </label>
      <Button
        disabled={state.dirty || busy || !configuration}
        onClick={() => {
          void run(async () => {
            const parsed: unknown = JSON.parse(configuration);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
              throw new Error('Enter a JSON object');
            const result = await new ConnectorBuilderApiService().approveAgentTest(id, {
              expectedRevision,
              version,
              configuration: parsed as Record<string, unknown>,
            });
            setConfiguration('');
            setReferences(current => [...current, result.approvalId]);
            setMessage('Test credentials approved for this saved draft for 10 minutes.');
          });
        }}
      >
        Approve test credentials
      </Button>
      {references.length > 0 && (
        <Button
          variant='outline'
          disabled={busy}
          onClick={() => {
            void run(async () => {
              const api = new ConnectorBuilderApiService();
              for (const reference of references) await api.revokeAgentPreparation(id, reference);
              setReferences([]);
              setMessage('Approvals revoked.');
            });
          }}
        >
          Revoke these approvals
        </Button>
      )}
      <p role='status' className='mt-2 text-sm'>
        {message}
      </p>
    </details>
  );
}
