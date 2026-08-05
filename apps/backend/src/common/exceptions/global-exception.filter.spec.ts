import { ArgumentsHost, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

function validationException(constraints: unknown[]): BadRequestException {
  return new BadRequestException(constraints);
}

function hostFor(json: jest.Mock): ArgumentsHost {
  const status = jest.fn().mockReturnValue({ json });
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => ({ status, headersSent: false }),
      getRequest: () => ({ method: 'POST', originalUrl: '/api/reports', headers: {} }),
    }),
  } as unknown as ArgumentsHost;
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let json: jest.Mock;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter = new GlobalExceptionFilter();
    json = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function body(): Record<string, unknown> {
    expect(json).toHaveBeenCalledTimes(1);
    return json.mock.calls[0][0] as Record<string, unknown>;
  }

  describe('class-validator constraint lists', () => {
    it('reports each failed constraint instead of the generic exception name', () => {
      filter.catch(
        validationException(['title must be a string', 'property foo should not exist']),
        hostFor(json)
      );

      const response = body();
      expect(response.message).toBe('Request validation failed');
      expect(response.details).toEqual({
        errors: [
          { message: 'title must be a string.' },
          { message: 'property foo should not exist.' },
        ],
      });
    });

    it('leaves a constraint that already ends in punctuation alone', () => {
      filter.catch(validationException(['Pick at least one column!']), hostFor(json));

      expect(body().details).toEqual({ errors: [{ message: 'Pick at least one column!' }] });
    });

    it('keeps `message` a string so callers can use string methods on it', () => {
      filter.catch(validationException(['title must be a string']), hostFor(json));

      expect(typeof body().message).toBe('string');
    });

    it('does not clobber a `details` envelope the thrower built itself', () => {
      const own = {
        errors: [{ code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD', column: 'cost' }],
      };
      filter.catch(
        new BadRequestException({ message: ['ignored constraint'], details: own }),
        hostFor(json)
      );

      expect(body().details).toEqual(own);
    });

    it('ignores non-string entries and falls back when none survive', () => {
      filter.catch(validationException([{ property: 'title' }, 42]), hostFor(json));

      const response = body();
      expect(response.message).toBe('Bad Request Exception');
      expect(response.details).toBeUndefined();
    });

    it('ignores an empty constraint list', () => {
      filter.catch(validationException(['   ']), hostFor(json));

      expect(body().details).toBeUndefined();
    });
  });

  describe('other exceptions are unchanged', () => {
    it('prefers a written message over the exception name', () => {
      filter.catch(new NotFoundException('Data Mart not found'), hostFor(json));

      const response = body();
      expect(response.message).toBe('Data Mart not found');
      expect(response.statusCode).toBe(404);
      expect(response.details).toBeUndefined();
    });

    it('adds no details envelope to a non-HTTP failure', () => {
      filter.catch(new Error('boom'), hostFor(json));

      const response = body();
      expect(response.statusCode).toBe(500);
      expect(response.details).toBeUndefined();
    });

    it('keeps extra payload fields a structured thrower attached', () => {
      filter.catch(
        new BadRequestException({ message: 'Context is attached', affectedMemberIds: ['m1'] }),
        hostFor(json)
      );

      const response = body();
      expect(response.message).toBe('Context is attached');
      expect(response.affectedMemberIds).toEqual(['m1']);
    });
  });
});
