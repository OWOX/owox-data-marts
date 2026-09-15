import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import type {
  AuthInject,
  AuthInto,
  BuilderAuthentication,
} from '../../../shared/model/manifest.types';
import { ParameterPicker } from '../ParameterPicker';
import { InfoLabel } from '../fields';

export function InjectEditor({
  basePath = ['authentication'],
  auth,
}: {
  basePath?: (string | number)[];
  auth?: Extract<BuilderAuthentication, { inject: AuthInject }>;
}) {
  const { setPath } = useBuilder();
  const inject: AuthInject = auth?.inject ?? { into: 'header', name: '', format: '' };
  const base = [...basePath, 'inject'] as (string | number)[];
  return (
    <div className='flex flex-col gap-3.5' data-testid='inject-editor'>
      <div className='grid grid-cols-2 gap-3.5'>
        <label className='flex flex-col'>
          <InfoLabel hint='Where the token is placed on each request.'>Inject into</InfoLabel>
          <Select
            value={inject.into}
            onValueChange={v => {
              setPath([...base, 'into'], v as AuthInto);
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='header'>header</SelectItem>
              <SelectItem value='query'>query</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className='flex flex-col'>
          <InfoLabel hint='Header or query-parameter name the token goes into.'>Name</InfoLabel>
          <Input
            value={inject.name}
            onChange={e => {
              setPath([...base, 'name'], e.target.value);
            }}
            placeholder='Authorization'
          />
        </label>
      </div>
      <label className='flex flex-col'>
        <InfoLabel hint='Template for the final auth header value.'>Format</InfoLabel>
        <div className='relative'>
          <Input
            value={inject.format}
            onChange={e => {
              setPath([...base, 'format'], e.target.value);
            }}
            placeholder='Bearer {{ parameters.Token }}'
            className='pr-9 font-mono'
          />
          <ParameterPicker
            onInsert={token => {
              setPath([...base, 'format'], `${inject.format}${token}`);
            }}
          />
        </div>
      </label>
    </div>
  );
}
