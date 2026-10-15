import type { NormalizedCredentialRequirement } from '../../data-marts/credentials/credential.types';
import type { PluginCredentialHandleDto } from '../dto/domain/plugin-installation.dto';

export function toCredentialHandles(
  ready: readonly NormalizedCredentialRequirement[]
): PluginCredentialHandleDto[] {
  return ready.map(requirement =>
    requirement.definitionId === null
      ? {
          name: requirement.key,
          kind: 'ai' as const,
          models: requirement.models as Array<'fast' | 'reasoning' | 'embedding'>,
        }
      : { name: requirement.key, kind: 'exact' as const }
  );
}
