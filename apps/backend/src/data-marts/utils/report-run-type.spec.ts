import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { toReportRunType } from './report-run-type';

describe('toReportRunType', () => {
  it.each([
    [DataDestinationType.GOOGLE_SHEETS, DataMartRunType.GOOGLE_SHEETS_EXPORT],
    [DataDestinationType.LOOKER_STUDIO, DataMartRunType.LOOKER_STUDIO],
    [DataDestinationType.EMAIL, DataMartRunType.EMAIL],
    [DataDestinationType.SLACK, DataMartRunType.SLACK],
    [DataDestinationType.GOOGLE_CHAT, DataMartRunType.GOOGLE_CHAT],
    [DataDestinationType.MS_TEAMS, DataMartRunType.MS_TEAMS],
  ])('maps %s to %s', (destinationType, runType) => {
    expect(toReportRunType(destinationType)).toBe(runType);
  });

  it('throws for values outside the destination enum', () => {
    expect(() => toReportRunType('SOMETHING_NEW' as DataDestinationType)).toThrow(
      'Unexpected Data Destination Type - SOMETHING_NEW'
    );
  });
});
