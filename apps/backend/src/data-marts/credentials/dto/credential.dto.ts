import type { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import type { ContextSummary } from '../../utils/extract-context-summaries';
import type {
  CredentialAiModelMappingModes,
  CredentialAiModelMappings,
  CredentialValidationState,
} from '../credential.types';
import type {
  CredentialConsumerReferenceApiDto,
  CredentialDefinitionApiDto,
} from './credential-api.dto';

export interface CredentialDto {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly definition: CredentialDefinitionApiDto;
  readonly definitionConsentRequired: boolean;
  readonly enabled: boolean;
  readonly availableForUse: boolean;
  readonly availableForMaintenance: boolean;
  readonly validationState: CredentialValidationState;
  readonly validationMessage: string | null;
  readonly validatedAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly aiModelMappings: CredentialAiModelMappings | null;
  readonly aiModelMappingModes: CredentialAiModelMappingModes | null;
  readonly ownerUsers: UserProjectionDto[];
  readonly contexts: ContextSummary[];
  readonly usedBy: CredentialConsumerReferenceApiDto[];
  readonly createdAt: Date;
  readonly modifiedAt: Date;
}
