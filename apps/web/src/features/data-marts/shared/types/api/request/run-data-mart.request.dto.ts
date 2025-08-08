/**
 * Data transfer object for running a data mart
 */
export interface RunDataMartRequestDto {
  /**
   * Id of the data mart
   */
  id: string;

  /**
   * Payload of the run. This is map of unknown structure.
   */
  payload: Record<string, unknown>;
}
