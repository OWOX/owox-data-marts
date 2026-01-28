import { Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { ProjectMemberApiDto } from '../dto/presentation/project-member-api.dto';

@Injectable()
export class GetProjectMembersService {
  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  async run(projectId: string): Promise<ProjectMemberApiDto[]> {
    return this.idpProjectionsFacade.getProjectMembers(projectId);
  }
}
