import { useEffect, useRef, useState } from 'react';
import { Button } from '@owox/ui/components/button';
import type { InlineEditDescriptionProps } from '../InlineEditDescription/InlineEditDescription';
import { DescriptionEditor } from './DescriptionEditor';
import { DescriptionView } from './DescriptionView';

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
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (!editing && wasEditing.current) editButtonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const scope = currentDataMartId ? 'data_mart' : 'project';
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
      {editing && !readOnly ? (
        <>
          <DescriptionEditor
            projectId={projectId}
            currentDataMartId={currentDataMartId}
            value={value}
            onChange={setValue}
            disabled={saving}
            placeholder={placeholder}
            autoFocus
            startEditing
            scope={scope}
            saveError={error}
            returnFocusRef={editButtonRef}
            onSave={() => {
              void save();
            }}
            onCancel={cancel}
            footer={
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
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={cancel}
                  disabled={saving}
                >
                  Cancel
                </Button>
                {ai}
              </div>
            }
          />
        </>
      ) : (
        <DescriptionView
          projectId={projectId}
          value={description ?? ''}
          placeholder={placeholder}
          scope={scope}
          editButtonProps={{ ref: editButtonRef }}
          onEdit={
            readOnly
              ? undefined
              : () => {
                  setEditing(true);
                }
          }
        />
      )}
    </div>
  );
}
