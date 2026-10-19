import { ConflictException, Injectable } from '@nestjs/common';
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

  async saveDescription(
    projectId: string,
    description: string | null,
    expectedRevision?: number
  ): Promise<ProjectSettings> {
    return this.repository.manager.connection.transaction(async manager => {
      const repository = manager.getRepository(ProjectSettings);
      if (expectedRevision === undefined || expectedRevision === 0) {
        // A no-op upsert acquires an exclusive duplicate-key lock on MySQL.
        // INSERT IGNORE would take shared locks that concurrent writers must upgrade.
        await repository
          .createQueryBuilder()
          .insert()
          .values({ projectId, description: null, revision: 0 })
          .orUpdate(['projectId'], ['projectId'])
          .execute();
      }
      const result = await repository
        .createQueryBuilder()
        .update()
        .set({
          description,
          revision: () => 'revision + 1',
        })
        .where(
          expectedRevision === undefined ? { projectId } : { projectId, revision: expectedRevision }
        )
        .execute();
      if (result.affected !== 1) {
        throw new ConflictException(
          'Project description has changed. Read the current settings before saving again.'
        );
      }
      // The UPDATE holds the row lock until commit, so this is this write's own result.
      return repository.findOneByOrFail({ projectId });
    });
  }
}
