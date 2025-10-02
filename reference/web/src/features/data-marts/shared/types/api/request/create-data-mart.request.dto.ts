/**
 * Data transfer object for creating a new data mart
 */
export interface CreateDataMartRequestDto {
  /**
   * Title of the data mart
   */
  title: string;

  /**
   * Storage id for the data mart
   */
  storageId: string;
}
