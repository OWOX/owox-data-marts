import { useState } from 'react';
import { Textarea } from '@owox/ui/components/textarea';
import { InfoLabel } from './fields';

/**
 * A JSON request body typed as free text.
 *
 * The text is local state, not derived from the manifest, because the manifest holds the
 * PARSED object: round-tripping through `JSON.stringify` on every keystroke would reformat
 * what the author is still typing. `onChange` therefore fires only for text that parses —
 * an unparseable draft stays on screen, flagged, while the last valid body remains saved.
 * Clearing the field is a deliberate "no body" and is reported as an empty string.
 */
export function JsonBodyEditor({
  label,
  hint,
  initial,
  onChange,
  testId,
}: {
  label: string;
  hint: string;
  initial?: Record<string, unknown>;
  /** The raw text, guaranteed to be valid JSON — or `''` to clear the body. */
  onChange: (text: string) => void;
  testId?: string;
}) {
  const [text, setText] = useState(initial ? JSON.stringify(initial, null, 2) : '');
  const [invalid, setInvalid] = useState(false);
  return (
    <label className='flex flex-col'>
      <InfoLabel hint={hint}>{label}</InfoLabel>
      <Textarea
        className='bg-card min-h-32 font-mono text-[12.5px] leading-relaxed'
        value={text}
        data-testid={testId}
        aria-invalid={invalid}
        onChange={e => {
          const v = e.target.value;
          setText(v);
          if (v.trim() === '') {
            setInvalid(false);
            onChange('');
            return;
          }
          try {
            JSON.parse(v);
            setInvalid(false);
            onChange(v);
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
