import { DataDestinationType, usesSuffixedJoinedFieldNames } from './data-destination-type.enum';

describe('usesSuffixedJoinedFieldNames', () => {
  it('is enabled for Google Sheets', () => {
    expect(usesSuffixedJoinedFieldNames(DataDestinationType.GOOGLE_SHEETS)).toBe(true);
  });

  // Driven off the enum rather than a hand-written list so a newly added destination type is
  // covered the moment it appears, pinning the prefix default until someone opts it in explicitly.
  it.each(
    Object.values(DataDestinationType).filter(type => type !== DataDestinationType.GOOGLE_SHEETS)
  )('keeps the prefix for %s', type => {
    expect(usesSuffixedJoinedFieldNames(type)).toBe(false);
  });
});
