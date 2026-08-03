import { ArgumentsHost } from '@nestjs/common';
import {
  ACTION_NOT_ALLOWED_IN_VIEW_ONLY_MODE,
  AuthorizationError,
  ViewOnlyModeError,
} from '@owox/idp-protocol';
import { IdpExceptionFilter } from './idp-exception.filter';

describe('IdpExceptionFilter', () => {
  it('returns 403 with ACTION_NOT_ALLOWED_IN_VIEW_ONLY_MODE for ViewOnlyModeError', () => {
    const filter = new IdpExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new ViewOnlyModeError(), host);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: ACTION_NOT_ALLOWED_IN_VIEW_ONLY_MODE,
        message: 'Action not allowed in view-only mode',
      })
    );
  });

  it('keeps generic AuthorizationError code for non-view-only denials', () => {
    const filter = new IdpExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new AuthorizationError('Access denied by api key'), host);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'AUTHORIZATION_ERROR',
        message: 'Access denied by api key',
      })
    );
  });
});
