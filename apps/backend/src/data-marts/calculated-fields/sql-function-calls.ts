import type { SqlToken } from './sql-token-scanner';

export interface SqlFunctionCall {
  name: string;
  nameStart: number;
  /** Offsets of the argument text, exclusive of the parentheses. */
  argStart: number;
  argEnd: number;
  /**
   * Nesting depth among calls: 0 = outermost. Not what rejects a nested aggregate — the analyzer
   * (formula-analyzer.ts) does that by offset containment instead; this field just records the
   * raw depth for whichever future consumer wants it directly.
   */
  depth: number;
  /**
   * False when the scan ran out of tokens before this call's `(` was matched by a `)`. The
   * argument span is then just wherever the scan stopped, not a real boundary — callers must not
   * read an unclosed call's empty-looking span as "no arguments given" — whether that is an error is decided elsewhere; this
   * module only reports the fact.
   */
  closed: boolean;
}

/** One balanced-paren scan. A `(` preceded by a word is a call; any other `(` is a group. */
export function findFunctionCalls(tokens: readonly SqlToken[]): SqlFunctionCall[] {
  const code = tokens.filter(t => t.kind !== 'comment');
  const calls: SqlFunctionCall[] = [];
  const open: { call?: SqlFunctionCall }[] = [];

  for (let i = 0; i < code.length; i++) {
    const token = code[i];
    if (token.kind === 'punct' && token.value === '(') {
      const prev = code[i - 1];
      if (prev?.kind === 'word') {
        const call: SqlFunctionCall = {
          name: prev.value,
          nameStart: prev.start,
          argStart: token.end,
          argEnd: token.end,
          depth: open.filter(f => f.call).length,
          closed: false,
        };
        calls.push(call);
        open.push({ call });
      } else {
        open.push({});
      }
      continue;
    }
    if (token.kind === 'punct' && token.value === ')') {
      const frame = open.pop();
      if (frame?.call) {
        frame.call.argEnd = token.start;
        frame.call.closed = true;
      }
    }
  }

  return calls;
}
