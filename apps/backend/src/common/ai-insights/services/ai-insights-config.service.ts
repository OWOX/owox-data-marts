import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Service responsible for AI Insights configuration and feature flag management.
 * Checks if all required AI environment variables are set and enables the insights feature accordingly.
 */
@Injectable()
export class AiInsightsConfigService {
  private readonly logger = new Logger(AiInsightsConfigService.name);

  private readonly insightsEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    const aiBaseUrl = this.config.get<string>('AI_BASE_URL');
    const aiApiKey = this.config.get<string>('AI_API_KEY');
    const aiModel = this.config.get<string>('AI_MODEL');

    this.insightsEnabled = !!(aiBaseUrl && aiApiKey && aiModel);
    this.config.set('INSIGHTS_ENABLED', this.insightsEnabled);

    if (this.insightsEnabled) {
      this.logger.log('AI Insights enabled: all required AI configuration variables are set');
    }
  }

  /**
   * Checks if AI Insights feature is enabled.
   */
  public isInsightsEnabled(): boolean {
    return this.insightsEnabled;
  }
}
