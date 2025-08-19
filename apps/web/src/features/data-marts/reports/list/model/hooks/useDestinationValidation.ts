import { DataDestinationTypeModel } from '../../../../../data-destination/shared/types';
import { DataDestinationStatus } from '../../../../../data-destination/shared/enums';
import type { DataDestination } from '../../../../../data-destination/shared/model/types';

/**
 * Custom hook for validating destination visibility and getting destination info
 * @param destination - The data destination to validate
 * @returns Object containing destination info and visibility status
 */
export function useDestinationValidation(destination: DataDestination) {
  const destinationInfo = DataDestinationTypeModel.getInfo(destination.type);
  const isVisible = destinationInfo.status === DataDestinationStatus.ACTIVE;

  return {
    destinationInfo,
    isVisible,
  };
}
