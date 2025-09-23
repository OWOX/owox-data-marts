/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var repositoryStatsFields = {
  date: {
    type: "date",
    description: "Date of the data snapshot",
    GoogleBigQueryPartitioned: true
  },
  stars: {
    type: "integer",
    description: "Number of stars for the repository"
  },
  contributors: {
    type: "integer",
    description: "Number of contributors to the repository"
  }
};
