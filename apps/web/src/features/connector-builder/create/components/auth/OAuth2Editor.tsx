import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import type { BuilderAuthentication } from '../../../shared/model/manifest.types';
import { InfoLabel } from '../fields';

export function OAuth2Editor({
  basePath = ['authentication'],
  auth,
}: {
  basePath?: (string | number)[];
  auth?: Extract<BuilderAuthentication, { type: 'oauth2' }>;
}) {
  const { setPath } = useBuilder();
  const grantType = auth?.grantType ?? 'refresh_token';

  return (
    <div className='flex flex-col gap-3.5' data-testid='oauth2-editor'>
      <label className='flex flex-col'>
        <InfoLabel hint='OAuth2 token endpoint that issues the access token.'>Token URL</InfoLabel>
        <Input
          value={auth?.tokenUrl ?? ''}
          onChange={e => {
            setPath([...basePath, 'tokenUrl'], e.target.value);
          }}
          placeholder='https://oauth2.googleapis.com/token'
          className='font-mono'
        />
      </label>

      <label className='flex flex-col'>
        <InfoLabel hint='refresh_token uses a stored refresh token; client_credentials authenticates the app itself.'>
          Grant type
        </InfoLabel>
        <Select
          value={grantType}
          onValueChange={v => {
            setPath([...basePath, 'grantType'], v);
          }}
        >
          <SelectTrigger className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='refresh_token'>refresh_token</SelectItem>
            <SelectItem value='client_credentials'>client_credentials</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <div className='grid grid-cols-2 gap-3.5'>
        <label className='flex flex-col'>
          <InfoLabel hint='OAuth client id. Reference a parameter, e.g. {{ parameters.ClientId }}.'>
            Client ID
          </InfoLabel>
          <Input
            value={auth?.clientId ?? ''}
            onChange={e => {
              setPath([...basePath, 'clientId'], e.target.value);
            }}
            placeholder='{{ parameters.ClientId }}'
            className='font-mono'
          />
        </label>
        <label className='flex flex-col'>
          <InfoLabel hint='OAuth client secret. Reference a secret parameter.'>
            Client secret
          </InfoLabel>
          <Input
            value={auth?.clientSecret ?? ''}
            onChange={e => {
              setPath([...basePath, 'clientSecret'], e.target.value);
            }}
            placeholder='{{ parameters.ClientSecret }}'
            className='font-mono'
          />
        </label>
      </div>

      {grantType === 'refresh_token' && (
        <label className='flex flex-col'>
          <InfoLabel hint='Long-lived refresh token. A token the provider rotates is persisted automatically, but only when the connector uses a stored credential.'>
            Refresh token
          </InfoLabel>
          <Input
            value={auth?.refreshToken ?? ''}
            onChange={e => {
              setPath([...basePath, 'refreshToken'], e.target.value);
            }}
            placeholder='{{ parameters.RefreshToken }}'
            className='font-mono'
          />
        </label>
      )}

      <label className='flex flex-col'>
        <InfoLabel hint='Optional space-separated OAuth scopes.'>Scope</InfoLabel>
        <Input
          value={auth?.scope ?? ''}
          onChange={e => {
            setPath([...basePath, 'scope'], e.target.value);
          }}
          placeholder='https://www.googleapis.com/auth/spreadsheets.readonly'
          className='font-mono'
        />
      </label>

      <label className='flex flex-col'>
        <InfoLabel hint='Fallback cache TTL for the access token, used only when the token response does not include an expires_in. Defaults to 300s when left blank.'>
          Access-token TTL (seconds)
        </InfoLabel>
        <Input
          type='number'
          value={auth?.ttlSeconds ?? ''}
          onChange={e => {
            setPath([...basePath, 'ttlSeconds'], Number(e.target.value));
          }}
          placeholder='300'
          className='font-mono'
        />
      </label>
    </div>
  );
}
