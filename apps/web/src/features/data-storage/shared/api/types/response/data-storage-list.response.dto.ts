import type { DataStorageResponseDto } from './data-storage.response.dto.ts';

export type DataStorageListItemResponseDto = Pick<
  DataStorageResponseDto,
  | 'id'
  | 'type'
  | 'title'
  | 'createdAt'
  | 'modifiedAt'
  | 'publishedDataMartsCount'
  | 'draftDataMartsCount'
  | 'createdByUser'
  | 'ownerUsers'
>;
export type DataStorageListResponseDto = DataStorageListItemResponseDto[];
