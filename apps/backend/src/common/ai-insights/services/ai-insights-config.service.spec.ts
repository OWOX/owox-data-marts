import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiInsightsConfigService } from './ai-insights-config.service';

describe('AiInsightsConfigService', () => {
  let config: jest.Mocked<ConfigService>;
  let loggerLogSpy: jest.SpyInstance;

  beforeEach(async () => {
    config = {
      get: jest.fn(),
      set: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    // Spy on Logger.prototype.log to verify logging behavior
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
  });

  describe('constructor and initializeInsightsFlag', () => {
    it('should set INSIGHTS_ENABLED to true when all AI variables are provided', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'AI_BASE_URL') return 'https://api.openai.com/v1';
        if (key === 'AI_API_KEY') return 'sk-test-key';
        if (key === 'AI_MODEL') return 'gpt-4';
        return undefined;
      });

      new AiInsightsConfigService(config);

      expect(config.set).toHaveBeenCalledWith('INSIGHTS_ENABLED', true);
      expect(loggerLogSpy).toHaveBeenCalledWith(
        'AI Insights enabled: all required AI configuration variables are set'
      );
    });

    it('should set INSIGHTS_ENABLED to false when AI_BASE_URL is missing', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'AI_BASE_URL') return undefined;
        if (key === 'AI_API_KEY') return 'sk-test-key';
        if (key === 'AI_MODEL') return 'gpt-4';
        return undefined;
      });

      new AiInsightsConfigService(config);

      expect(config.set).toHaveBeenCalledWith('INSIGHTS_ENABLED', false);
      expect(loggerLogSpy).not.toHaveBeenCalledWith(
        'AI Insights enabled: all required AI configuration variables are set'
      );
    });

    it('should set INSIGHTS_ENABLED to false when AI_API_KEY is missing', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'AI_BASE_URL') return 'https://api.openai.com/v1';
        if (key === 'AI_API_KEY') return undefined;
        if (key === 'AI_MODEL') return 'gpt-4';
        return undefined;
      });

      new AiInsightsConfigService(config);

      expect(config.set).toHaveBeenCalledWith('INSIGHTS_ENABLED', false);
      expect(loggerLogSpy).not.toHaveBeenCalledWith(
        'AI Insights enabled: all required AI configuration variables are set'
      );
    });

    it('should set INSIGHTS_ENABLED to false when AI_MODEL is missing', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'AI_BASE_URL') return 'https://api.openai.com/v1';
        if (key === 'AI_API_KEY') return 'sk-test-key';
        if (key === 'AI_MODEL') return undefined;
        return undefined;
      });

      new AiInsightsConfigService(config);

      expect(config.set).toHaveBeenCalledWith('INSIGHTS_ENABLED', false);
      expect(loggerLogSpy).not.toHaveBeenCalledWith(
        'AI Insights enabled: all required AI configuration variables are set'
      );
    });

    it('should set INSIGHTS_ENABLED to false when all AI variables are missing', () => {
      config.get.mockImplementation(() => {
        return undefined;
      });

      new AiInsightsConfigService(config);

      expect(config.set).toHaveBeenCalledWith('INSIGHTS_ENABLED', false);
      expect(loggerLogSpy).not.toHaveBeenCalledWith(
        'AI Insights enabled: all required AI configuration variables are set'
      );
    });

    it('should set INSIGHTS_ENABLED to false when AI variables are empty strings', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'AI_BASE_URL') return '';
        if (key === 'AI_API_KEY') return '';
        if (key === 'AI_MODEL') return '';
        return undefined;
      });

      new AiInsightsConfigService(config);

      expect(config.set).toHaveBeenCalledWith('INSIGHTS_ENABLED', false);
      expect(loggerLogSpy).not.toHaveBeenCalledWith(
        'AI Insights enabled: all required AI configuration variables are set'
      );
    });

    it('should set INSIGHTS_ENABLED to false when only one AI variable is provided', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'AI_BASE_URL') return 'https://api.openai.com/v1';
        if (key === 'AI_API_KEY') return undefined;
        if (key === 'AI_MODEL') return undefined;
        return undefined;
      });

      new AiInsightsConfigService(config);

      expect(config.set).toHaveBeenCalledWith('INSIGHTS_ENABLED', false);
      expect(loggerLogSpy).not.toHaveBeenCalledWith(
        'AI Insights enabled: all required AI configuration variables are set'
      );
    });

    it('should set INSIGHTS_ENABLED to false when only two AI variables are provided', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'AI_BASE_URL') return 'https://api.openai.com/v1';
        if (key === 'AI_API_KEY') return 'sk-test-key';
        if (key === 'AI_MODEL') return undefined;
        return undefined;
      });

      new AiInsightsConfigService(config);

      expect(config.set).toHaveBeenCalledWith('INSIGHTS_ENABLED', false);
      expect(loggerLogSpy).not.toHaveBeenCalledWith(
        'AI Insights enabled: all required AI configuration variables are set'
      );
    });
  });

  describe('isInsightsEnabled', () => {
    it('should return true when service was initialized with all AI variables', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'AI_BASE_URL') return 'https://api.openai.com/v1';
        if (key === 'AI_API_KEY') return 'sk-test-key';
        if (key === 'AI_MODEL') return 'gpt-4';
        return undefined;
      });

      const testService = new AiInsightsConfigService(config);

      expect(testService.isInsightsEnabled()).toBe(true);
    });

    it('should return false when service was initialized without AI variables', () => {
      config.get.mockImplementation(() => {
        return undefined;
      });

      const testService = new AiInsightsConfigService(config);

      expect(testService.isInsightsEnabled()).toBe(false);
    });

    it('should return false when service was initialized with incomplete AI variables', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'AI_BASE_URL') return 'https://api.openai.com/v1';
        if (key === 'AI_API_KEY') return 'sk-test-key';
        if (key === 'AI_MODEL') return undefined;
        return undefined;
      });

      const testService = new AiInsightsConfigService(config);

      expect(testService.isInsightsEnabled()).toBe(false);
    });
  });
});
