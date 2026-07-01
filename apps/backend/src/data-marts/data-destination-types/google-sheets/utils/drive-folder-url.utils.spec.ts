import { extractDriveFolderId } from './drive-folder-url.utils';

describe('extractDriveFolderId', () => {
  it.each([
    ['https://drive.google.com/drive/folders/0ACT850ZhKCTfUk9PVA', '0ACT850ZhKCTfUk9PVA'],
    [
      'https://drive.google.com/drive/folders/1qK8KfH8-8ujCRidySMjgBGbBsnKH5GdN',
      '1qK8KfH8-8ujCRidySMjgBGbBsnKH5GdN',
    ],
    [
      'https://drive.google.com/drive/u/0/folders/1KnUz_PO9AL_mAcl6B5eWSpsIyKCs-IaU',
      '1KnUz_PO9AL_mAcl6B5eWSpsIyKCs-IaU',
    ],
    [
      'https://drive.google.com/drive/folders/0ACT850ZhKCTfUk9PVA?usp=sharing',
      '0ACT850ZhKCTfUk9PVA',
    ],
    [
      'https://drive.google.com/drive/folders/0ACT850ZhKCTfUk9PVA?resourcekey=abc&usp=drive_link',
      '0ACT850ZhKCTfUk9PVA',
    ],
    ['https://drive.google.com/open?id=0ACT850ZhKCTfUk9PVA', '0ACT850ZhKCTfUk9PVA'],
    ['0ACT850ZhKCTfUk9PVA', '0ACT850ZhKCTfUk9PVA'],
    ['  0ACT850ZhKCTfUk9PVA  ', '0ACT850ZhKCTfUk9PVA'],
  ])('extracts the folder id from %s', (input, expected) => {
    expect(extractDriveFolderId(input)).toBe(expected);
  });

  it.each([[''], [null], [undefined], ['not a url with spaces'], ['https://example.com/whatever']])(
    'returns null for invalid input %s',
    input => {
      expect(extractDriveFolderId(input)).toBeNull();
    }
  );
});
