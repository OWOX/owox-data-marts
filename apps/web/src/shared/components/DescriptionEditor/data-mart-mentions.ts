import type { DataMartIconValue } from '../../../features/data-marts/shared/enums/data-mart-icon.enum';

export interface DataMartReference {
  id: string;
  title: string;
  icon?: DataMartIconValue | null;
}

export interface DataMartFieldReference {
  name: string;
  alias: string;
  calculated: boolean;
}

function isMarkdownText(prefix: string): boolean {
  let fence: { character: string; length: number } | null = null;
  let codeDelimiter = 0;
  let brackets = 0;
  let destination = 0;
  const lines = prefix.split('\n');
  for (const [lineIndex, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (
        marker?.[1][0] === fence.character &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      )
        fence = null;
      continue;
    }
    // Inline links and code spans cannot continue across a paragraph boundary.
    if (lineIndex < lines.length - 1 && /^[ \t\r]*$/.test(line)) {
      codeDelimiter = 0;
      brackets = 0;
      destination = 0;
      continue;
    }
    if (marker && !codeDelimiter) {
      fence = { character: marker[1][0], length: marker[1].length };
      continue;
    }
    for (let index = 0; index < line.length; index++) {
      const character = line[index];
      if (character === '`') {
        const start = index;
        while (line[index + 1] === '`') index++;
        const length = index - start + 1;
        if (!codeDelimiter) codeDelimiter = length;
        else if (codeDelimiter === length) codeDelimiter = 0;
      } else if (!codeDelimiter) {
        if (character === '\\') index++;
        else if (destination) {
          if (character === '(') destination++;
          else if (character === ')') destination--;
        } else if (character === '[') brackets++;
        else if (character === ']') {
          brackets = Math.max(0, brackets - 1);
          if (line[index + 1] === '(') {
            destination = 1;
            index++;
          }
        }
      }
    }
  }
  return !fence && !codeDelimiter && !brackets && !destination;
}

export function mentionAtCursor(text: string): { query: string; start: number } | null {
  // The prefix includes previous lines so fenced code and multiline links are excluded.
  const line = text.slice(text.lastIndexOf('\n') + 1);
  const match = /(?:^|\s)@([^@[\]()\n]*)$/.exec(line);
  if (!match) return null;
  const start = text.lastIndexOf('@');
  if (!isMarkdownText(text.slice(0, start))) return null;
  return { query: match[1].trim(), start };
}

export function dataMartMarkdownLink(
  reference: DataMartReference,
  projectId: string,
  origin: string,
  field?: DataMartFieldReference
): string {
  const label = field ? `${reference.title} · ${field.alias}` : reference.title;
  const title = label.replace(/([\\`*_[\]<>])/g, '\\$1').replace(/[\r\n]+/g, ' ');
  const url = new URL(
    `/ui/${encodeURIComponent(projectId)}/data-marts/${encodeURIComponent(reference.id)}/data-setup`,
    origin
  );
  // The saved field name identifies the reference; the link opens the mart's Data Setup.
  // Both the name and label are snapshots, not a live relation to an editable schema field.
  if (field) url.searchParams.set('field', field.name);
  return `[${title}](${url.href})`;
}
