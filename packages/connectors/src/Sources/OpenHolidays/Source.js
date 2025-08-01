/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API Documentation: https://www.openholidaysapi.org/en/#__tabbed_6_1

var OpenHolidaysSource = class OpenHolidaysSource extends AbstractSource {
    constructor(config) {
    super(config.mergeParameters({
      countryIsoCode: {
        isRequired: true,
        requiredType: "string",
        default: "CH",
        label: "Country ISO Code",
        description: "ISO country code for which to fetch holidays (e.g., CH, US, GB)"
        // value: "CH" 
      },
      languageIsoCode: {
        isRequired: true,
        requiredType: "string",
        label: "Language ISO Code",
        description: "ISO language code for holiday names (e.g., EN, DE, FR)"
        // value: "EN" 
      },
      StartDate: {
        requiredType: "date",
        label: "Start Date",
        description: "Start date for data import",
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL]
      },
      EndDate: {
        requiredType: "date",
        label: "End Date",
        description: "End date for data import",
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      }
    }));
  }

    fetchData() {
      // let data = [];

      let countryIsoCode = this.config.countryIsoCode.value;
      let languageIsoCode = this.config.languageIsoCode.value;
      let startDate = EnvironmentAdapter.formatDate(this.config.StartDate.value, "UTC", "yyyy-MM-dd");
      let endDate = EnvironmentAdapter.formatDate(this.config.EndDate.value, "UTC", "yyyy-MM-dd");

        const url = `https://openholidaysapi.org/PublicHolidays?countryIsoCode=${countryIsoCode}&languageIsoCode=${languageIsoCode}&validFrom=${startDate}&validTo=${endDate}`;
        this.config.logMessage(`🔄 This url: ${url}`);

        this.config.logMessage(`🔄 Fetching public holidays from OpenHolidays API`);

        try {
            const response = EnvironmentAdapter.fetch(url, { method: 'get', muteHttpExceptions: true });
            const holidays = JSON.parse(response.getContentText());

            if (!holidays || !holidays.length) {
                this.config.logMessage("ℹ️ No public holidays found for the requested period.");
                return [];
            }

            
            return holidays.map(holiday => ({
                id: holiday.id,
                date: holiday.startDate ? new Date(holiday.startDate) : null,
                name: holiday.name?.find(entry => entry.language === languageIsoCode)?.text || "Unknown",
                type: holiday.type || "Unknown",
                regionalScope: holiday.regionalScope || "Unknown",
                temporalScope: holiday.temporalScope || "Unknown",
                nationwide: holiday.nationwide || false
            }));
        } catch (error) {
            this.config.logMessage(`❌ Error fetching holidays: ${error.message}`);
            throw error;
        }
    }
};