/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var GitHubSource = class GitHubSource extends AbstractSource {

  constructor( configRange ) {
  
    super( configRange.mergeParameters({
      AccessToken: {
        isRequired: true,
        label: "Access Token",
        description: "GitHub API Access Token for authentication"
      },
      RepositoryName: {
        isRequired: true,
        label: "Repository Name",
        description: "GitHub repository name in format 'owner/repo'"
      },
      DestinationSheetName: {
        isRequired: true,
        value: "Data",
        label: "Destination Sheet Name",
        description: "Name of the sheet where data will be stored"
      }
    }));
  
   // @TODO: add schema for google bigquery storage support
   // this.fieldsSchema = GitHubFieldsSchema;
  
  }
  
  /*
  
  @return data array
  
  */
  fetchData()  {
  
    const headers = {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${this.config.AccessToken.value}`
    };

    // Get repository info (includes stargazers_count)
    const repoUrl = `https://api.github.com/repos/${this.config.RepositoryName.value}`;
    const repoResponse = EnvironmentAdapter.fetch(repoUrl, {
      method: 'get',
      headers: headers
    });
    const repoData = JSON.parse(repoResponse.getContentText());
    const stars = repoData.stargazers_count;

    // Get contributors list
    // @TODO: limitation is 1000 contributors per page, so if there are more, we need to handle pagination
    const contribUrl = `https://api.github.com/repos/${this.config.RepositoryName.value}/contributors?per_page=1000`;
    const contribResponse = EnvironmentAdapter.fetch(contribUrl, {
      method: 'get',
      headers: headers
    });
    const contribData = JSON.parse(contribResponse.getContentText());
    const contributors = contribData.length;

    console.log(`Stars: ${stars}`);
    console.log(`Contributors: ${contributors}`);
    
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let data = [
      {"date": midnight, "start": stars, "contributors": contributors}
    ];
   
    return data;
  
  }
    
  }