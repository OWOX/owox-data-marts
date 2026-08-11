import { Input } from '@owox/ui/components/input';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import type { BuilderAuthentication } from '../../../shared/model/manifest.types';
import { ParameterPicker } from '../ParameterPicker';
import { InfoLabel } from '../fields';

export function BasicEditor({
  basePath = ['authentication'],
  auth,
}: {
  basePath?: (string | number)[];
  auth?: Extract<BuilderAuthentication, { type: 'basic' }>;
}) {
  const { setPath } = useBuilder();
  const username = auth?.username ?? '';
  const password = auth?.password ?? '';
  return (
    <div className='flex flex-col gap-3.5' data-testid='basic-editor'>
      <label className='flex flex-col'>
        <InfoLabel hint='Username for HTTP Basic auth. Bind it to a secret parameter.'>
          Username
        </InfoLabel>
        <div className='relative'>
          <Input
            value={username}
            onChange={e => {
              setPath([...basePath, 'username'], e.target.value);
            }}
            placeholder='{{ parameters.User }}'
            className='pr-9 font-mono'
          />
          <ParameterPicker
            onInsert={token => {
              setPath([...basePath, 'username'], `${username}${token}`);
            }}
          />
        </div>
      </label>
      <label className='flex flex-col'>
        <InfoLabel hint='Password for HTTP Basic auth (optional). Bind it to a secret parameter.'>
          Password (optional)
        </InfoLabel>
        <div className='relative'>
          <Input
            value={password}
            onChange={e => {
              setPath([...basePath, 'password'], e.target.value);
            }}
            placeholder='{{ parameters.Pass }}'
            className='pr-9 font-mono'
          />
          <ParameterPicker
            onInsert={token => {
              setPath([...basePath, 'password'], `${password}${token}`);
            }}
          />
        </div>
      </label>
    </div>
  );
}
