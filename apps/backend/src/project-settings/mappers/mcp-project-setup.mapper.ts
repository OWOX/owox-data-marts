import { Injectable } from '@nestjs/common';
import type { Project } from '@owox/idp-protocol';
import type { McpProjectSetupDto } from '../dto/domain/mcp-project-setup.dto';
import type { ProjectSettings } from '../entities/project-settings.entity';

@Injectable()
export class McpProjectSetupMapper {
  toSetupDto(project: Project, settings: ProjectSettings | null): McpProjectSetupDto {
    return {
      project: {
        id: project.id,
        title: project.title,
        status: project.status ?? null,
        roles: [...(project.roles ?? [])],
        createdAt: project.createdAt ?? null,
      },
      description: settings?.description ?? null,
      revision: settings?.revision ?? 0,
      canUpdateDescription: project.roles?.includes('admin') ?? false,
    };
  }
}
