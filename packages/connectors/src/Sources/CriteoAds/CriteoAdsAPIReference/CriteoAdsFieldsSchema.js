/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var CriteoAdsFieldsSchema = {
  statistics: {
    overview: "Criteo Statistics",
    description: "Statistics and metrics for Criteo advertising campaigns.",
    documentation: "https://developers.criteo.com/marketing-solutions/v2024.01/docs/campaign-statistics",
    fields: adStatisticsFields,
    uniqueKeys: ["CampaignId", "AdvertiserId", "AdsetId", "AdId", "Day"],
    isTimeSeries: true
  }
};
