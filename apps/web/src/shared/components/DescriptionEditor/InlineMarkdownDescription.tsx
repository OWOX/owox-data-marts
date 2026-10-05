import { useEffect, useState } from 'react';
import { Button } from '@owox/ui/components/button';
import type { InlineEditDescriptionProps } from '../InlineEditDescription/InlineEditDescription';
import { MarkdownEditorPreview, useMarkdownPreview } from '../MarkdownEditor';
import { DescriptionEditor } from './DescriptionEditor';

export function InlineMarkdownDescription({
  projectId,
  currentDataMartId,
  description,
  onUpdate,
  placeholder = 'Add description…',
  readOnly = false,
  aiButton,
}: InlineEditDescriptionProps & { projectId: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useMarkdownPreview({ markdown: description ?? '', enabled: !editing });
  useEffect(() => {
    setValue(description ?? '');
    setEditing(false);
    setError(null);
  }, [description, projectId]);
  const cancel = () => {
    if (saving) return;
    setValue(description ?? '');
    setEditing(false);
    setError(null);
  };
  const save = async () => {
    if (saving || readOnly) return;
    const next = value.trim() || null;
    if (next === (description ?? null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onUpdate(next);
      setEditing(false);
    } catch {
      setError('Could not save description. Your changes are still in the editor.');
    } finally {
      setSaving(false);
    }
  };
  const ai = typeof aiButton === 'function' ? aiButton({ setValue }) : aiButton;
  return (
    <div className='w-full space-y-2'>
      {editing ? (
        <>
          <DescriptionEditor
            projectId={projectId}
            currentDataMartId={currentDataMartId}
            value={value}
            onChange={setValue}
            disabled={saving}
            placeholder={placeholder}
            autoFocus
            onSave={() => {
              void save();
            }}
            onCancel={cancel}
          />
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              size='sm'
              onClick={() => {
                void save();
              }}
              disabled={saving}
            >
              Save
            </Button>
            <Button type='button' variant='outline' size='sm' onClick={cancel} disabled={saving}>
              Cancel
            </Button>
            {ai}
          </div>
          {error && (
            <p className='text-destructive text-xs' role='alert'>
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          {!description || preview.loading || preview.error ? (
            <p className='text-muted-foreground whitespace-pre-wrap'>
              {description ?? placeholder}
            </p>
          ) : (
            <MarkdownEditorPreview {...preview} />
          )}
          {!readOnly && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => {
                setEditing(true);
              }}
            >
              Edit description
            </Button>
          )}
        </>
      )}
    </div>
  );
}
