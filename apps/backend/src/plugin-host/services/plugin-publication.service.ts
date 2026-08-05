import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { PluginPublicationProject } from '../entities/plugin-publication-project.entity';
import { PluginPublication } from '../entities/plugin-publication.entity';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';

export interface CreatePublicationInput {
  readonly pluginId: string;
  readonly scope: PluginPublicationScope;
  readonly uniquenessKey: string;
  readonly projectId: string | null;
  readonly userId: string | null;
  readonly allProjects: boolean;
}

/**
 * Repository access for publications and their deployment audiences.
 *
 * Nothing here is deleted. Publications and audience rows are deactivated so that
 * republishing restores the original record rather than creating a duplicate, and so
 * the history of who published what survives.
 */
@Injectable()
export class PluginPublicationService {
  constructor(
    @InjectRepository(PluginPublication)
    private readonly publications: Repository<PluginPublication>,
    @InjectRepository(PluginPublicationProject)
    private readonly audiences: Repository<PluginPublicationProject>
  ) {}

  findByUniquenessKey(uniquenessKey: string): Promise<PluginPublication | null> {
    return this.publications.findOneBy({ uniquenessKey });
  }

  create(input: CreatePublicationInput): Promise<PluginPublication> {
    return this.publications.save(
      this.publications.create({ ...input, isActive: true, publishedAt: new Date() })
    );
  }

  async activate(publicationId: string, allProjects: boolean): Promise<void> {
    await this.publications.update(publicationId, {
      isActive: true,
      allProjects,
      publishedAt: new Date(),
      unpublishedAt: null,
    });
  }

  async deactivate(publicationId: string): Promise<void> {
    await this.publications.update(publicationId, {
      isActive: false,
      unpublishedAt: new Date(),
    });
  }

  listActiveAudience(publicationId: string): Promise<PluginPublicationProject[]> {
    return this.audiences.findBy({ publicationId, isActive: true });
  }

  /** Adds projects to the audience, reviving any that were removed earlier. */
  async addToAudience(publicationId: string, projectIds: string[]): Promise<void> {
    for (const projectId of projectIds) {
      const existing = await this.audiences.findOneBy({ publicationId, projectId });
      if (existing) {
        await this.audiences.update(existing.id, { isActive: true });
      } else {
        await this.audiences.save(this.audiences.create({ publicationId, projectId }));
      }
    }
  }

  /** Omit projectIds to clear the whole audience. */
  async removeFromAudience(publicationId: string, projectIds?: string[]): Promise<void> {
    await this.audiences.update(
      projectIds ? { publicationId, projectId: In(projectIds) } : { publicationId },
      { isActive: false }
    );
  }

  /**
   * Every active publication that makes a plugin visible to one member in one project.
   *
   * The three authority levels are independent, so this is a union rather than a
   * precedence chain: a plugin exposed by all three comes back three times and is
   * grouped by the caller. There is no substitution -- one publication being present
   * never hides another.
   */
  findVisibleTo(projectId: string, userId: string): Promise<PluginPublication[]> {
    return this.publications
      .createQueryBuilder('publication')
      .where('publication.isActive = :isActive', { isActive: true })
      .andWhere(
        new Brackets(scopes => {
          scopes
            .where(
              new Brackets(deployment => {
                deployment
                  .where('publication.scope = :deploymentScope', {
                    deploymentScope: PluginPublicationScope.DEPLOYMENT,
                  })
                  .andWhere(
                    new Brackets(audience => {
                      audience
                        .where('publication.allProjects = :isActive', { isActive: true })
                        .orWhere(
                          `EXISTS (
                            SELECT 1 FROM plugin_publication_project audience_row
                            WHERE audience_row.publicationId = publication.id
                              AND audience_row.projectId = :projectId
                              AND audience_row.isActive = :isActive
                          )`
                        );
                    })
                  );
              })
            )
            .orWhere(
              new Brackets(project => {
                project
                  .where('publication.scope = :projectScope', {
                    projectScope: PluginPublicationScope.PROJECT,
                  })
                  .andWhere('publication.projectId = :projectId');
              })
            )
            .orWhere(
              new Brackets(member => {
                member
                  .where('publication.scope = :memberScope', {
                    memberScope: PluginPublicationScope.MEMBER,
                  })
                  .andWhere('publication.projectId = :projectId')
                  .andWhere('publication.userId = :userId');
              })
            );
        })
      )
      .setParameters({ projectId, userId })
      .getMany();
  }

  listManageable(
    scope: PluginPublicationScope,
    filters: { projectId?: string; userId?: string }
  ): Promise<PluginPublication[]> {
    return this.publications.findBy({
      scope,
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
    });
  }
}
