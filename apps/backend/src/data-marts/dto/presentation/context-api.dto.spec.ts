import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateContextRequestApiDto,
  UpdateContextIconApiDto,
  UpdateContextRequestApiDto,
} from './context-api.dto';

describe('Context icon request validation', () => {
  it.each([
    ['a known key', { icon: 'purchases' }],
    ['a library icon', { icon: 'lucide:megaphone' }],
    ['a library icon with digits', { icon: 'lucide:grid-2x2-check' }],
    ['null', { icon: null }],
  ])('accepts %s on the icon update', async (_label, body) => {
    const errors = await validate(plainToInstance(UpdateContextIconApiDto, body));
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['an unknown key', { icon: 'rocket' }],
    ['a library icon without a name', { icon: 'lucide:' }],
    ['a library icon in PascalCase', { icon: 'lucide:Megaphone' }],
    ['a value longer than the column', { icon: `lucide:${'a'.repeat(60)}` }],
    ['a non-string icon', { icon: 42 }],
    ['a body without icon', {}],
  ])('rejects %s on the icon update', async (_label, body) => {
    const errors = await validate(plainToInstance(UpdateContextIconApiDto, body));
    expect(errors.map(e => e.property)).toEqual(['icon']);
  });

  it('accepts create without an icon or with a library icon, and rejects an unknown one', async () => {
    const base = { name: 'Marketing' };
    expect(await validate(plainToInstance(CreateContextRequestApiDto, base))).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CreateContextRequestApiDto, { ...base, icon: 'lucide:megaphone' })
      )
    ).toHaveLength(0);
    const errors = await validate(
      plainToInstance(CreateContextRequestApiDto, { ...base, icon: 'rocket' })
    );
    expect(errors.map(e => e.property)).toEqual(['icon']);
  });

  it('accepts an update without an icon, with a library icon or with null, and rejects an unknown one', async () => {
    const base = { name: 'Marketing' };
    for (const body of [base, { ...base, icon: 'lucide:megaphone' }, { ...base, icon: null }]) {
      expect(await validate(plainToInstance(UpdateContextRequestApiDto, body))).toHaveLength(0);
    }
    const errors = await validate(
      plainToInstance(UpdateContextRequestApiDto, { ...base, icon: 'rocket' })
    );
    expect(errors.map(e => e.property)).toEqual(['icon']);
  });
});
