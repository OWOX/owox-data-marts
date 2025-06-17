import { AuthorizationContext } from '../../../common/authorization-context/authorization.context';

export class DeleteDataStorageCommand {
  constructor(
    public readonly id: string,
    public readonly context: AuthorizationContext
  ) {}
}
