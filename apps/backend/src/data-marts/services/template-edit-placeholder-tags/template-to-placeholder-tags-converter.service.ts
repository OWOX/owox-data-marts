import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import { TemplateEditPlaceholderTag } from './template-edit-placeholder-tags.contracts';

export interface PlaceholderTemplateDocument {
  text: string;
  tags: TemplateEditPlaceholderTag[];
}

interface SourcePosition {
  line: number;
  column: number;
}

interface SourceLocation {
  start: SourcePosition;
  end: SourcePosition;
}

interface HashPairNode {
  key?: string;
  value?: unknown;
}

interface HashNode {
  pairs?: HashPairNode[];
}

interface MustacheStatementNode {
  type?: string;
  path?: { original?: string };
  hash?: HashNode;
  loc?: SourceLocation;
}

interface SupportedTagOccurrence {
  name: 'table' | 'value';
  params: Record<string, unknown>;
  start: number;
  end: number;
}

@Injectable()
export class TemplateToPlaceholderTagsConverterService {
  toPlaceholderDocument(template: string): PlaceholderTemplateDocument {
    if (!template.length) {
      return { text: '', tags: [] };
    }

    const ast = Handlebars.parse(template);
    const lineOffsets = this.buildLineOffsets(template);
    const occurrences = this.collectSupportedTagOccurrences(ast, template, lineOffsets).sort(
      (a, b) => a.start - b.start
    );

    if (!occurrences.length) {
      return {
        text: template,
        tags: [],
      };
    }

    const tags: TemplateEditPlaceholderTag[] = [];
    const replacements: Array<{ start: number; end: number; replacement: string }> = [];

    occurrences.forEach((occurrence, index) => {
      const id = `t${index + 1}`;
      tags.push({
        id,
        name: occurrence.name,
        params: occurrence.params,
      });
      replacements.push({
        start: occurrence.start,
        end: occurrence.end,
        replacement: `[[TAG:${id}]]`,
      });
    });

    let nextText = template;
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
      nextText =
        nextText.slice(0, replacement.start) +
        replacement.replacement +
        nextText.slice(replacement.end);
    }

    return {
      text: nextText,
      tags,
    };
  }

  private collectSupportedTagOccurrences(
    node: unknown,
    source: string,
    lineOffsets: number[]
  ): SupportedTagOccurrence[] {
    const collected: SupportedTagOccurrence[] = [];

    this.walkNode(node, current => {
      if (current.type !== 'MustacheStatement') {
        return;
      }

      const mustache = current as MustacheStatementNode;
      const tagName = mustache.path?.original;
      if (tagName !== 'table' && tagName !== 'value') {
        return;
      }

      const range = this.resolveRange(mustache.loc, lineOffsets);
      if (!range) {
        return;
      }

      collected.push({
        name: tagName,
        params: this.extractParams(mustache.hash, source, lineOffsets),
        start: range.start,
        end: range.end,
      });
    });

    return collected;
  }

  private extractParams(
    hash: HashNode | undefined,
    source: string,
    lineOffsets: number[]
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    for (const pair of hash?.pairs ?? []) {
      if (!pair?.key) {
        continue;
      }

      const parsedValue = this.parseHashValue(pair.value, source, lineOffsets);
      if (parsedValue !== undefined) {
        params[pair.key] = parsedValue;
      }
    }

    return params;
  }

  private parseHashValue(
    valueNode: unknown,
    source: string,
    lineOffsets: number[]
  ): unknown | undefined {
    if (!valueNode || typeof valueNode !== 'object') {
      return undefined;
    }

    const value = valueNode as {
      type?: string;
      value?: unknown;
      original?: string;
      loc?: SourceLocation;
    };

    switch (value.type) {
      case 'StringLiteral':
      case 'NumberLiteral':
      case 'BooleanLiteral':
      case 'NullLiteral':
        return value.value;
      case 'PathExpression':
        return value.original;
      case 'UndefinedLiteral':
        return undefined;
      default:
        return this.sliceByLocation(source, value.loc, lineOffsets);
    }
  }

  private sliceByLocation(
    source: string,
    location: SourceLocation | undefined,
    lineOffsets: number[]
  ): string | undefined {
    const range = this.resolveRange(location, lineOffsets);
    if (!range) {
      return undefined;
    }

    return source.slice(range.start, range.end);
  }

  private resolveRange(
    location: SourceLocation | undefined,
    lineOffsets: number[]
  ): { start: number; end: number } | null {
    if (!location) {
      return null;
    }

    const start = this.positionToOffset(location.start, lineOffsets);
    const end = this.positionToOffset(location.end, lineOffsets);
    if (start >= end) {
      return null;
    }

    return { start, end };
  }

  private positionToOffset(position: SourcePosition, lineOffsets: number[]): number {
    const lineStartOffset = lineOffsets[position.line - 1];
    return (lineStartOffset ?? 0) + position.column;
  }

  private buildLineOffsets(text: string): number[] {
    const offsets = [0];
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === '\n') {
        offsets.push(index + 1);
      }
    }
    return offsets;
  }

  private walkNode(node: unknown, visitor: (node: Record<string, unknown>) => void): void {
    if (Array.isArray(node)) {
      for (const item of node) {
        this.walkNode(item, visitor);
      }
      return;
    }

    if (!node || typeof node !== 'object') {
      return;
    }

    const record = node as Record<string, unknown>;
    visitor(record);

    for (const value of Object.values(record)) {
      this.walkNode(value, visitor);
    }
  }
}
