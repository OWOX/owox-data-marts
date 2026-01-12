/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var repositoryStatsFields = {
  date: {
    type: DATA_TYPES.DATE,
    description: "Date of the data snapshot",
    GoogleBigQueryPartitioned: true
  },
  stars: {
    type: DATA_TYPES.INTEGER,
    description: "Number of stars for the repository"
  },
  contributors: {
    type: DATA_TYPES.INTEGER,
    description: "Number of contributors to the repository"
  }
};
