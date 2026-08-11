import { Input } from '@owox/ui/components/input';
import type { ErrorBackoff } from '../../../shared/model/manifest.types';
import { OptionSelect } from '../fields';

const TYPES: ErrorBackoff['type'][] = [
  'constant',
  'exponential',
  'waitTimeFromHeader',
  'waitUntilTimeFromHeader',
];

export function BackoffEditor({
  value,
  onChange,
  label,
}: {
  value?: ErrorBackoff;
  onChange: (b: ErrorBackoff | undefined) => void;
  label: string;
}) {
  const setType = (t: string) => {
    if (!t) {
      onChange(undefined);
      return;
    }
    if (t === 'constant') {
      onChange({ type: 'constant', delayMs: 1000 });
      return;
    }
    if (t === 'exponential') {
      onChange({ type: 'exponential', factor: 2 });
      return;
    }
    if (t === 'waitTimeFromHeader') {
      onChange({ type: 'waitTimeFromHeader', header: 'Retry-After' });
      return;
    }
    onChange({ type: 'waitUntilTimeFromHeader', header: '' });
  };
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <OptionSelect
        ariaLabel={label}
        value={value?.type}
        onValueChange={next => {
          setType(next ?? '');
        }}
        options={TYPES.map(t => ({ value: t, label: t }))}
        unsetLabel='No backoff (default)'
        className='h-[34px] text-[13px]'
      />
      {value?.type === 'constant' && (
        <Input
          type='number'
          aria-label={`${label} delayMs`}
          value={value.delayMs}
          onChange={e => {
            onChange({ type: 'constant', delayMs: Number(e.target.value) });
          }}
          placeholder='delayMs'
          className='h-[34px] w-28 font-mono'
        />
      )}
      {value?.type === 'exponential' && (
        <>
          <Input
            type='number'
            aria-label={`${label} factor`}
            value={value.factor ?? 2}
            onChange={e => {
              onChange({ ...value, factor: Number(e.target.value) });
            }}
            placeholder='factor'
            className='h-[34px] w-24 font-mono'
          />
          <Input
            type='number'
            aria-label={`${label} baseMs`}
            value={value.baseMs ?? ''}
            onChange={e => {
              onChange({
                ...value,
                baseMs: e.target.value === '' ? undefined : Number(e.target.value),
              });
            }}
            placeholder='baseMs'
            className='h-[34px] w-28 font-mono'
          />
        </>
      )}
      {(value?.type === 'waitTimeFromHeader' || value?.type === 'waitUntilTimeFromHeader') && (
        <Input
          aria-label={`${label} header`}
          value={value.header ?? ''}
          onChange={e => {
            onChange({ ...value, header: e.target.value } as ErrorBackoff);
          }}
          placeholder='Retry-After'
          className='h-[34px] w-40 font-mono'
        />
      )}
      {value?.type === 'waitUntilTimeFromHeader' && (
        <>
          <Input
            aria-label={`${label} regex`}
            value={value.regex ?? ''}
            onChange={e => {
              onChange({ ...value, regex: e.target.value || undefined });
            }}
            placeholder='regex'
            className='h-[34px] w-32 font-mono'
          />
          <Input
            type='number'
            aria-label={`${label} minMs`}
            value={value.minMs ?? ''}
            onChange={e => {
              onChange({
                ...value,
                minMs: e.target.value === '' ? undefined : Number(e.target.value),
              });
            }}
            placeholder='minMs'
            className='h-[34px] w-24 font-mono'
          />
        </>
      )}
    </div>
  );
}
