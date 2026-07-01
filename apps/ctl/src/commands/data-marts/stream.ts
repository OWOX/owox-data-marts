import { once } from 'node:events';
import type { Writable } from 'node:stream';

import { Args, Flags } from '@oclif/core';
import {
  OWOXConfigError,
  type OWOXApiClient,
  type OWOXDataMartRow,
  type TraverseDataOptions,
} from '@owox/api-client';

import { BaseCommand } from '../../base-command.js';

export type DataMartsStreamClient = {
  dataMarts: Pick<OWOXApiClient['dataMarts'], 'traverseData'>;
};

type DataMartsStreamFlags = {
  columns?: string;
  column?: string[];
  filter?: string;
  sort?: string;
  limit?: number;
};

function parseJsonArrayFlag(
  value: string | undefined,
  flagName: '--filter' | '--sort'
): unknown[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new OWOXConfigError(`${flagName} must be valid JSON`, { cause: error });
  }

  if (!Array.isArray(parsed)) {
    throw new OWOXConfigError(`${flagName} must be a JSON array`);
  }

  return parsed;
}

export function buildTraverseDataOptions(flags: DataMartsStreamFlags): TraverseDataOptions {
  return {
    columns: flags.columns as TraverseDataOptions['columns'],
    column: flags.column,
    filter: parseJsonArrayFlag(flags.filter, '--filter'),
    sort: parseJsonArrayFlag(flags.sort, '--sort'),
    limit: flags.limit,
  };
}

async function writeNdjsonRows(stream: Writable, rows: OWOXDataMartRow[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const chunk = `${rows.map(row => JSON.stringify(row)).join('\n')}\n`;
  if (!stream.write(chunk)) {
    await once(stream, 'drain');
  }
}

export async function streamDataMart(
  client: DataMartsStreamClient,
  dataMartId: string,
  options: TraverseDataOptions,
  stdout: Writable = process.stdout
): Promise<void> {
  const data = await client.dataMarts.traverseData(dataMartId, options);
  for await (const rows of data.rowChunks()) {
    await writeNdjsonRows(stdout, rows);
  }
}

export default class DataMartsStream extends BaseCommand {
  static override description = 'Stream data mart rows as newline-delimited JSON';
  static override args = {
    dataMartId: Args.string({
      required: true,
      description: 'Data Mart ID',
    }),
  };
  static override flags = {
    ...BaseCommand.baseFlags,
    columns: Flags.string({
      description: 'Column-set selector. Quote "*" and "**" so the shell does not expand them.',
      options: ['*', '**'],
    }),
    column: Flags.string({
      description: 'Exact column name to include. Repeat for multiple columns.',
      multiple: true,
    }),
    limit: Flags.integer({
      description: 'Optional row cap',
    }),
    filter: Flags.string({
      description: 'Filter config as a JSON array',
    }),
    sort: Flags.string({
      description: 'Sort config as a JSON array',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DataMartsStream);

    try {
      this.loadEnvironment(flags);
      await streamDataMart(
        await this.getAuthenticatedClient(),
        args.dataMartId,
        buildTraverseDataOptions(flags),
        process.stdout
      );
    } catch (error) {
      this.handleCliError(error);
    }
  }
}
