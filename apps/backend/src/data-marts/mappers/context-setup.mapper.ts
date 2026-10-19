import { Injectable } from '@nestjs/common';
import type { ProjectMemberDto } from '../../idp/dto/domain/project-member.dto';
import type {
  ContextResourceDto,
  ContextResourceType,
  ContextSetupMemberDto,
} from '../dto/domain/mcp-context-setup.dto';
import { RoleScope } from '../enums/role-scope.enum';

@Injectable()
export class ContextSetupMapper {
  resource(
    entity: {
      id: string;
      title?: string | null;
      contexts?: { contextId: string; context?: { id: string } | null }[];
    },
    type: ContextResourceType,
    canSetContexts: boolean
  ): Omit<ContextResourceDto, 'revision' | 'revisionAggregate'> {
    return {
      id: entity.id,
      type,
      title: entity.title ?? null,
      contextIds: (entity.contexts ?? []).filter(row => row.context).map(row => row.contextId),
      canSetContexts,
    };
  }

  member(
    member: ProjectMemberDto,
    administration: { roleScope: RoleScope; contextIds: string[] } | null
  ): Omit<ContextSetupMemberDto, 'administration'> & {
    administration: { roleScope: RoleScope; contextIds: string[] } | null;
  } {
    return {
      userId: member.userId,
      email: member.email,
      displayName: member.displayName ?? null,
      role: member.role,
      administration,
    };
  }
}
