import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { useState } from 'react';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import type {
  BuilderAuthentication,
  TokenExchangeSpec,
} from '../../../shared/model/manifest.types';
import { toDotPath } from '../../../shared/model/manifestPath';
import { InfoLabel } from '../fields';

export function ExchangeEditor({
  basePath = ['authentication'],
  auth,
}: {
  basePath?: (string | number)[];
  auth?: Extract<BuilderAuthentication, { type: 'tokenExchange' }>;
}) {
  const { setPath } = useBuilder();
  const exchange: TokenExchangeSpec = auth?.exchange ?? {
    url: '',
    method: 'POST',
    body: {},
    tokenPath: ['token'],
  };
  const base = [...basePath, 'exchange'] as (string | number)[];

  const setTokenPath = (text: string) => {
    setPath([...base, 'tokenPath'], toDotPath(text));
  };

  return (
    <div className='flex flex-col gap-3.5' data-testid='exchange-editor'>
      <label className='flex flex-col'>
        <InfoLabel hint='Endpoint that issues the access token.'>Token URL</InfoLabel>
        <Input
          value={exchange.url}
          onChange={e => {
            setPath([...base, 'url'], e.target.value);
          }}
          placeholder='https://api.example.com/auth'
          className='font-mono'
        />
      </label>

      <div className='grid grid-cols-2 gap-3.5'>
        <label className='flex flex-col'>
          <InfoLabel hint='HTTP method used for the token request.'>Method</InfoLabel>
          <Select
            value={exchange.method ?? 'POST'}
            onValueChange={v => {
              setPath([...base, 'method'], v);
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='POST'>POST</SelectItem>
              <SelectItem value='GET'>GET</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className='flex flex-col'>
          <InfoLabel hint='JSON path to the token in the response.'>Token path</InfoLabel>
          <Input
            defaultValue={(exchange.tokenPath.length ? exchange.tokenPath : ['token']).join('.')}
            onChange={e => {
              setTokenPath(e.target.value);
            }}
            placeholder='token or data.access_token'
            className='font-mono'
          />
        </label>
      </div>

      <label className='flex flex-col'>
        <InfoLabel hint='How long a token stays valid before it is refreshed.'>
          TTL (seconds)
        </InfoLabel>
        <Input
          type='number'
          value={exchange.ttlSeconds ?? 0}
          onChange={e => {
            setPath([...base, 'ttlSeconds'], Number(e.target.value));
          }}
        />
      </label>

      <ExchangeBodyEditor
        initial={exchange.body}
        onChange={body => {
          setPath([...base, 'body'], body);
        }}
      />
    </div>
  );
}

function ExchangeBodyEditor({
  initial,
  onChange,
}: {
  initial?: Record<string, unknown>;
  onChange: (body: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(
    initial && Object.keys(initial).length ? JSON.stringify(initial, null, 2) : ''
  );
  const [invalid, setInvalid] = useState(false);
  return (
    <label className='flex flex-col'>
      <InfoLabel hint='Request body sent when exchanging the token.'>Body (JSON)</InfoLabel>
      <textarea
        className='bg-input min-h-24 rounded-lg border p-3 font-mono text-[12.5px] leading-relaxed outline-none'
        value={text}
        data-testid='exchange-body'
        onChange={e => {
          const v = e.target.value;
          setText(v);
          if (v.trim() === '') {
            setInvalid(false);
            onChange({});
            return;
          }
          try {
            onChange(JSON.parse(v) as Record<string, unknown>);
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
      />
      {invalid && (
        <span className='mt-1 text-xs text-red-600 dark:text-red-400'>
          Invalid JSON — not saved
        </span>
      )}
    </label>
  );
}
