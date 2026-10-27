import type { DestinationMapper } from './destination-mapper.interface.ts';
import type { DataDestinationResponseDto } from '../../services/types';
import type { GoogleSheetsDataDestination } from '../types';
import { DataDestinationType } from '../../enums';
import type { DataDestinationFormData } from '../../types';
import type {
  UpdateDataDestinationRequestDto,
  CreateDataDestinationRequestDto,
} from '../../services/types';
import { buildDriveFolderUrl } from '../../utils/drive-folder-url.utils.ts';

export class GoogleSheetsMapper implements DestinationMapper {
  mapFromDto(dto: DataDestinationResponseDto): GoogleSheetsDataDestination {
    return {
      id: dto.id,
      title: dto.title,
      type: DataDestinationType.GOOGLE_SHEETS,
      projectId: dto.projectId,
      credentials: {},
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      createdByUser: dto.createdByUser,
      ownerUsers: dto.ownerUsers ?? [],
      // Prefer the stored folderUrl; synthesize one from a legacy folderId so the
      // clickable link still works for destinations created before the URL field.
      config: (() => {
        const folderUrl =
          dto.config?.folderUrl ??
          (dto.config?.folderId ? buildDriveFolderUrl(dto.config.folderId) : undefined);
        return folderUrl ? { folderUrl } : undefined;
      })(),
    };
  }

  mapToUpdateRequest(formData: Partial<DataDestinationFormData>): UpdateDataDestinationRequestDto {
    const result: UpdateDataDestinationRequestDto = {
      title: formData.title ?? '',
    };
    if (formData.type !== DataDestinationType.GOOGLE_SHEETS) return result;

    if (formData.reusableCredentialId) {
      result.reusableCredentialId = formData.reusableCredentialId;
    }
    const folderUrl = formData.config?.folderUrl;
    if (folderUrl !== undefined) {
      result.config = { folderUrl: folderUrl.trim() || null };
    }
    return result;
  }

  mapToCreateRequest(formData: DataDestinationFormData): CreateDataDestinationRequestDto {
    if (formData.type !== DataDestinationType.GOOGLE_SHEETS) {
      throw new Error('Invalid form data for Google Sheets destination');
    }
    if (!formData.reusableCredentialId) {
      throw new Error('Select a Credential');
    }
    const folderUrl = formData.config?.folderUrl?.trim();
    return {
      title: formData.title,
      type: DataDestinationType.GOOGLE_SHEETS,
      reusableCredentialId: formData.reusableCredentialId,
      ...(folderUrl && { config: { folderUrl } }),
    };
  }
}
