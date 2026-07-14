import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectSettings } from '../entities/project-settings.entity';

@Injectable()
export class ProjectSettingsService {
  constructor(
    @InjectRepository(ProjectSettings)
    private readonly repository: Repository<ProjectSettings>
  ) {}

  async findByProjectId(projectId: string): Promise<ProjectSettings | null> {
    return this.repository.findOne({ where: { projectId } });
  }

  async saveDescription(projectId: string, description: string | null): Promise<ProjectSettings> {
    const settings =
      (await this.findByProjectId(projectId)) ?? this.repository.create({ projectId });
    settings.description = description;
    return this.repository.save(settings);
  }
}
