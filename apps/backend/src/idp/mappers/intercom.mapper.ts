import type { AuthorizationContext } from '../types';
import type { IntercomToken } from '../types/intercom-token.types';
import { IssueIntercomJwtCommand } from '../dto/domain/issue-intercom-jwt.command';
import { IntercomTokenResponseApiDto } from '../dto/presentation/intercom-token-response-api.dto';

export class IntercomMapper {
  toIssueJwtCommand(context: AuthorizationContext): IssueIntercomJwtCommand {
    return new IssueIntercomJwtCommand(context.userId);
  }

  toResponse(result: IntercomToken): IntercomTokenResponseApiDto {
    return { token: result.token };
  }
}
