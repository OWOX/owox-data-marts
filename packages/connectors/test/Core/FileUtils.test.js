import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fileUtilsPath = path.join(__dirname, '../../src/Core/Utils/FileUtils.js');

loadGasClass(fileUtilsPath);
const parseCsv = (text, delimiter) => globalThis.FileUtils.parseCsv(text, delimiter);

// Parsing this report keeps about 30 MiB on the heap when cells are slices of the input.
// Building cells a character at a time kept 261 MiB, so the cap fails that regression.
const HEAP_CAP_MB = 96;

describe('FileUtils.parseCsv', () => {
  it('keeps delimiters, line breaks and doubled quotes inside quoted fields', () => {
    expect(parseCsv('"a, b","say ""hi""","two\r\nlines"\r\nx,y,z')).toEqual([
      ['a, b', 'say "hi"', 'two\r\nlines'],
      ['x', 'y', 'z'],
    ]);
  });

  it('treats a quote inside an unquoted field as an ordinary character', () => {
    expect(parseCsv('Keyword,101,12" tv\nKeyword,102,ok')).toEqual([
      ['Keyword', '101', '12" tv'],
      ['Keyword', '102', 'ok'],
    ]);
  });

  it('throws on a quote that never closes instead of swallowing later rows', () => {
    expect(() => parseCsv('Id,Name\n1,"open\n2,next')).toThrow(/never closes/);
  });

  it('drops spaces and a byte order mark around quoted fields and trims unquoted ones', () => {
    expect(parseCsv('﻿"Type" , "Id"\n  a  ,b ')).toEqual([
      ['Type', 'Id'],
      ['a', 'b'],
    ]);
  });

  it('skips blank lines but keeps a row holding one quoted empty value', () => {
    expect(parseCsv('a\n\n   \r\n""\nb\n')).toEqual([['a'], [''], ['b']]);
  });

  it('keeps empty fields, a trailing empty field and a last row without a newline', () => {
    expect(parseCsv('Format Version,,,6.0\na,b,\n"c"')).toEqual([
      ['Format Version', '', '', '6.0'],
      ['a', 'b', ''],
      ['c'],
    ]);
  });

  it('splits on a custom one-character delimiter', () => {
    expect(parseCsv('a;"b;c"\n1;2', ';')).toEqual([
      ['a', 'b;c'],
      ['1', '2'],
    ]);
  });

  it('rejects a delimiter longer than one character', () => {
    expect(() => parseCsv('a||b', '||')).toThrow(/one character/);
  });

  it('parses a large report with long quoted values within a capped heap', () => {
    const script = `
      const vm = require('vm');
      const fs = require('fs');
      vm.runInThisContext(fs.readFileSync(${JSON.stringify(fileUtilsPath)}, 'utf8'));
      const url = 'https://example.com/product/' + 'a'.repeat(140);
      const row = '"Example Energy","Brand campaign","' + url + '","1200","45","30.50"\\r\\n';
      const csv = '"AccountName","CampaignName","FinalUrl","Impressions","Clicks","Spend"\\r\\n'
        + row.repeat(50000);
      const rows = FileUtils.parseCsv(csv);
      process.stdout.write(String(rows.length) + ' ' + rows[50000][2].length);
    `;

    const output = execFileSync(
      process.execPath,
      [`--max-old-space-size=${HEAP_CAP_MB}`, '-e', script],
      { encoding: 'utf8' }
    );

    expect(output).toBe('50001 168');
  });
});
