/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var OpenHolidaysFieldsSchema = {
  'publicHolidays': {
    overview: "Public Holidays",
    description: "Contains public holidays data for different countries and languages",
    documentation: "https://www.openholidaysapi.org/en/",
    fields: publicHolidaysFields,
    uniqueKeys: ["id"],
    destinationName: "open_holidays_public_holidays",
    isTimeSeries: true
  }
};
