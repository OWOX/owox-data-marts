import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Plus, Trash2 } from 'lucide-react';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import { createDefaultTransform, type Transform } from '../../../shared/model/manifest.types';
import { ParameterPicker } from '../ParameterPicker';

const TYPE_OPTIONS: { value: Transform['type']; label: string }[] = [
  { value: 'add', label: 'Add field' },
  { value: 'remove', label: 'Remove field' },
  { value: 'keysToLower', label: 'Keys to lowercase' },
  { value: 'flatten', label: 'Flatten' },
];

const TYPE_HELP: Record<Transform['type'], string> = {
  add: 'Sets a top-level field on every record: a constant, or a template such as {{ record.id }}.',
  remove: 'Deletes a top-level field from every record.',
  keysToLower:
    'Lowercases every top-level key. Of two keys that differ only in case, the last one wins.',
  flatten:
    'Moves the values of nested objects to the top level, joining their keys with the separator: stats.clicks becomes stats_clicks. Arrays stay as they are.',
};

// These rename keys, and the node's fields still name the old ones, so the output columns come
// back empty and the transformation looks as if it did nothing.
const RENAMES_KEYS: ReadonlySet<Transform['type']> = new Set(['keysToLower', 'flatten']);

export function TransformationsEditor({ nodeName }: { nodeName: string }) {
  const { manifest, setPath } = useBuilder();
  const transforms: Transform[] = manifest.nodes[nodeName].transformations ?? [];
  const base = ['nodes', nodeName, 'transformations'] as (string | number)[];

  const replace = (next: Transform[]) => {
    setPath(base, next.length ? next : undefined);
  };
  const add = () => {
    replace([...transforms, createDefaultTransform('add')]);
  };
  const removeAt = (i: number) => {
    replace(transforms.filter((_, idx) => idx !== i));
  };
  const setType = (i: number, type: Transform['type']) => {
    replace(transforms.map((t, idx) => (idx === i ? createDefaultTransform(type) : t)));
  };
  const setField = (i: number, key: 'field' | 'value' | 'separator', value: string) => {
    replace(transforms.map((t, idx) => (idx === i ? ({ ...t, [key]: value } as Transform) : t)));
  };

  return (
    <div className='flex flex-col gap-3' data-testid='transformations-editor'>
      <p className='text-muted-foreground text-xs'>
        Reshape raw records before fields are typed. Applied top to bottom.
      </p>
      {transforms.map((t, i) => (
        <div
          key={i}
          className='flex flex-col gap-2 rounded-lg border p-3'
          data-testid={`transform-${i}`}
        >
          <div className='flex items-center gap-2.5'>
            <Select
              value={t.type}
              onValueChange={v => {
                setType(i, v as Transform['type']);
              }}
            >
              <SelectTrigger className='h-[34px] w-48'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              onClick={() => {
                removeAt(i);
              }}
              aria-label={`Remove transformation ${i + 1}`}
              className='text-muted-foreground ml-auto h-8 w-8'
            >
              <Trash2 className='h-[15px] w-[15px]' />
            </Button>
          </div>
          <p className='text-muted-foreground text-xs'>{TYPE_HELP[t.type]}</p>
          {RENAMES_KEYS.has(t.type) && (
            <p className='text-xs text-amber-700 dark:text-amber-400'>
              Fields keep the names and paths they had. Run the test, then Discover fields to pick
              up the new keys.
            </p>
          )}
          {(t.type === 'add' || t.type === 'remove') && (
            <Input
              value={t.field}
              onChange={e => {
                setField(i, 'field', e.target.value);
              }}
              placeholder='field name'
              className='h-[34px] font-mono'
            />
          )}
          {t.type === 'add' && (
            <div className='relative'>
              <Input
                value={t.value}
                onChange={e => {
                  setField(i, 'value', e.target.value);
                }}
                placeholder='{{ record.x }} or constant'
                className='h-[34px] pr-9 font-mono'
              />
              <ParameterPicker
                onInsert={token => {
                  setField(i, 'value', `${t.value}${token}`);
                }}
              />
            </div>
          )}
          {t.type === 'flatten' && (
            <label className='text-muted-foreground flex items-center gap-2 text-xs'>
              Separator
              <Input
                value={t.separator ?? '_'}
                onChange={e => {
                  setField(i, 'separator', e.target.value);
                }}
                placeholder='_'
                className='h-[34px] w-24 font-mono'
              />
            </label>
          )}
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        onClick={add}
        aria-label='Add transformation'
        className='h-[34px] w-fit gap-1.5'
      >
        <Plus className='h-[15px] w-[15px]' /> Add transformation
      </Button>
    </div>
  );
}
