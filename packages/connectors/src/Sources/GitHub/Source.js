/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { AbstractSource } from '../../Core/AbstractSource.js';

export class GitHubSource extends AbstractSource {
  constructor(context) {
    super(context);

    this.parameters = {
      AccessToken: {
        isRequired: true,
        label: 'Access Token',
        description: 'GitHub API Access Token for authentication',
        attributes: [CONFIG_ATTRIBUTES.SECRET],
      },
      RepositoryName: {
        isRequired: true,
        label: 'Repository Name',
        description: "GitHub repository name in format 'owner/repo'",
      },
      StartDate: {
        requiredType: 'date',
        label: 'Start Date',
        description: 'Start date for data import',
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      EndDate: {
        requiredType: 'date',
        label: 'End Date',
        description: 'End date for data import',
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      ReimportLookbackWindow: {
        requiredType: 'number',
        isRequired: true,
        default: 2,
        label: 'Reimport Lookback Window',
        description: 'Number of days to look back when reimporting data',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      CleanUpToKeepWindow: {
        requiredType: 'number',
        label: 'Clean Up To Keep Window',
        description: 'Number of days to keep data before cleaning up',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      Fields: {
        isRequired: true,
        requiredType: 'string',
        label: 'Fields',
        description: 'Comma-separated list of fields to fetch (e.g., date,stars,contributors)',
      },
      CreateEmptyTables: {
        requiredType: 'boolean',
        default: true,
        label: 'Create Empty Tables',
        description: 'Create tables with all columns even if no data is returned from API',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
    };

    this.context.registerParameters(this.parameters, PARAMETER_OWNER.SOURCE);

    this.fieldsSchema = GitHubFieldsSchema;
  }

  // GitHub nodes here are catalog snapshots (no time params on the API).
  getDateStrategy(nodeName) {
    return DATE_STRATEGY.NONE;
  }

  async fetchData({ nodeName, fields = [] }) {
    const repo = this.context.getParameter('RepositoryName')?.value;

    switch (nodeName) {
      case 'repository': {
        const repoData = await this._makeRequest(`repos/${repo}`);
        return this._filterBySchema({ items: [repoData], nodeName, fields });
      }
      case 'contributors': {
        // @TODO: limitation is 1000 contributors per page, so if there are more, we need to handle pagination
        const contribData = await this._makeRequest(`repos/${repo}/contributors?per_page=1000`);
        return this._filterBySchema({ items: contribData, nodeName, fields });
      }
      case 'repositoryStats':
        return await this._fetchRepositoryStats({ nodeName, fields, repo });
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  async _fetchRepositoryStats({ nodeName, fields, repo }) {
    const repoData = await this._makeRequest(`repos/${repo}`);
    // @TODO: limitation is 1000 contributors per page, so if there are more, we need to handle pagination
    const contribData = await this._makeRequest(`repos/${repo}/contributors?per_page=1000`);

    return this._filterBySchema({
      items: [
        {
          date: new Date(new Date().setHours(0, 0, 0, 0)),
          stars: repoData.stargazers_count,
          contributors: contribData.length,
        },
      ],
      nodeName,
      fields,
    });
  }

  async _makeRequest(endpoint) {
    const url = `https://api.github.com/${endpoint}`;
    const accessToken = this.context.getParameter('AccessToken')?.value;

    try {
      const response = await this.urlFetchWithRetry(url, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'owox',
        },
      });
      const result = await response.json();

      // Check for GitHub API error response
      if (result && result.message === 'Not Found') {
        throw new Error(
          'The repository was not found. The repository name should be in the format: owner/repo'
        );
      }

      return result;
    } catch (error) {
      // urlFetchWithRetry() throws on a non-ok HTTP response (main used
      // muteHttpExceptions and parsed the body itself, always reaching the
      // check above) -- re-detect a 404 here so a bad "owner/repo" still gets
      // main's friendly message instead of the generic "HTTP 404: Not Found".
      const friendlyError =
        error.statusCode === 404
          ? new Error(
              'The repository was not found. The repository name should be in the format: owner/repo'
            )
          : error;
      this.context.log(LOG_LEVEL.ERROR, `Error: ${friendlyError.message}`);
      throw friendlyError;
    }
  }

  _filterBySchema({ items, nodeName, fields = [] }) {
    const schema = this.fieldsSchema[nodeName];
    const requiredFields = new Set(schema.requiredFields || []);
    const keepFields = new Set([...requiredFields, ...fields]);

    return items.map(item => {
      const result = {};
      for (const key of Object.keys(item)) {
        if (keepFields.has(key)) {
          result[key] = item[key];
        }
      }
      return result;
    });
  }
}
