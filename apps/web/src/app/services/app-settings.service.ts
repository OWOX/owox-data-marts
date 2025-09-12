import { ApiService } from '../../services';

export class AppSettingsService extends ApiService {
  constructor() {
    super('/app');
  }

  getSettings(): Promise<Record<string, unknown>> {
    // TEMP: mock until API is ready. These settings simulate UI feature toggles for menu.
    // Adjust as needed when backend endpoint is available.
    return Promise.resolve({
      flags: {
        IDP_PROVIDER: 'owox',
        MENU_GITHUB_COMMUNITY_VISIBLE: true,
        MENU_UPGRADE_OPTIONS_VISIBLE: true,
        MENU_FEEDBACK_VISIBLE: true,
        MENU_ISSUES_VISIBLE: true,
        MENU_LICENSE_VISIBLE: true,
        MENU_OWOX_BI_VISIBLE: false,
        MENU_HELP_CENTER_VISIBLE: false,
      },
    });

    // When API is ready, use:
    // return this.get<unknown>('/settings');
  }
}

export const appSettingsService = new AppSettingsService();
