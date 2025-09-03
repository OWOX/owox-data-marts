import { DataDestinationTypeModel } from '../../types';
import { DataDestinationStatus } from '../../enums';
import type { DataDestination } from '../types';

/**
 * Custom hook for validating destination visibility and getting destination info
 * @param destination - The data destination to validate
 * @returns Object containing destination info and visibility status
 */
export function useDataDestinationVisibility(destination: DataDestination) {
  const destinationInfo = DataDestinationTypeModel.getInfo(destination.type);
  const isVisible = destinationInfo.status === DataDestinationStatus.ACTIVE;

  return {
    destinationInfo,
    isVisible,
  };
}
