import {
  DataDestinationType,
  isPullBasedDataDestinationType,
  requiresCredentials,
  usesSuffixedJoinedFieldNames,
} from './data-destination-type.enum';

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

describe('isPullBasedDataDestinationType', () => {
  it.each([DataDestinationType.LOOKER_STUDIO, DataDestinationType.EXCEL])(
    'is pull-based for %s',
    type => {
      expect(isPullBasedDataDestinationType(type)).toBe(true);
    }
  );

  it.each([
    DataDestinationType.GOOGLE_SHEETS,
    DataDestinationType.EMAIL,
    DataDestinationType.SLACK,
    DataDestinationType.MS_TEAMS,
    DataDestinationType.GOOGLE_CHAT,
  ])('is written to by the server for %s', type => {
    expect(isPullBasedDataDestinationType(type)).toBe(false);
  });
});

describe('requiresCredentials', () => {
  it('is false only for Excel, which holds no secret of its own', () => {
    const withoutCredentials = Object.values(DataDestinationType).filter(
      type => !requiresCredentials(type)
    );

    expect(withoutCredentials).toEqual([DataDestinationType.EXCEL]);
  });
});
