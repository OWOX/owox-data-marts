import { REJECT_API_KEY_AUTH_METADATA } from '../../idp/decorators';
import { RequestAccessController } from './request-access.controller';
import { validate } from 'class-validator';
import { CreateNewProjectApiDto } from '../dto/presentation/request-access-api.dto';
import { ProjectCreationIntegration } from '../enums/project-creation-integration.enum';

jest.mock('../../idp', () => ({
  ...jest.requireActual('../../idp/decorators'),
  ...jest.requireActual('../../idp/types'),
}));

describe('RequestAccessController', () => {
  it('rejects API-key authentication at the controller level', () => {
    expect(Reflect.getMetadata(REJECT_API_KEY_AUTH_METADATA, RequestAccessController)).toBe(true);
  });

  it.each(Object.values(ProjectCreationIntegration))(
    'passes validated %s source to project creation',
    async integration => {
      const createNewProject = {
        run: jest.fn().mockResolvedValue({ projectId: 'new-project', projectTitle: 'New project' }),
      };
      const controller = new RequestAccessController(
        {} as never,
        {} as never,
        createNewProject as never
      );
      const dto = Object.assign(new CreateNewProjectApiDto(), { integration });
      expect(await validate(dto)).toEqual([]);
      await controller.createNewProject({ userId: 'actor-user' } as never, dto);
      expect(createNewProject.run).toHaveBeenCalledWith('actor-user', integration);
    }
  );

  it('accepts existing callers without a body and leaves default attribution to the use case', async () => {
    const createNewProject = {
      run: jest.fn().mockResolvedValue({ projectId: 'new-project', projectTitle: 'New project' }),
    };
    const controller = new RequestAccessController(
      {} as never,
      {} as never,
      createNewProject as never
    );
    expect(await validate(new CreateNewProjectApiDto())).toEqual([]);
    await controller.createNewProject({ userId: 'actor-user' } as never);
    expect(createNewProject.run).toHaveBeenCalledWith('actor-user', undefined);
  });

  it.each(['unknown', 'https://untrusted.example', '', ['claude'], 123])(
    'rejects unsupported attribution %p',
    async integration => {
      const dto = Object.assign(new CreateNewProjectApiDto(), { integration });
      const errors = await validate(dto);
      expect(errors).toEqual([
        expect.objectContaining({
          property: 'integration',
          constraints: { isEnum: expect.any(String) },
        }),
      ]);
    }
  );
});
