/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var GitHubFieldsSchema = {
  'repository': {
    overview: "Repository Information",
    description: "Contains detailed repository information and statistics",
    documentation: "https://docs.github.com/en/rest/repos/repos",
    fields: repositoryFields,
    uniqueKeys: ["id"],
    destinationName: "github_repository",
    isTimeSeries: false
  },
  'contributors': {
    overview: "Repository Contributors",
    description: "Contains list of contributors to the repository with their contribution counts",
    documentation: "https://docs.github.com/en/rest/repos/repos#list-repository-contributors",
    fields: contributorsFields,
    uniqueKeys: ["id"],
    destinationName: "github_contributors",
    isTimeSeries: false
  },
  'repositoryStats': {
    overview: "Repository Statistics",
    description: "Contains daily repository statistics including stars and contributors count",
    documentation: "https://docs.github.com/en/rest/repos/repos",
    fields: repositoryStatsFields,
    uniqueKeys: ["date"],
    destinationName: "github_repository_stats",
    isTimeSeries: false
  }
};
