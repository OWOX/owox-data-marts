/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var repositoryFields = {
  id: {
    type: DATA_TYPES.INTEGER,
    description: "Repository ID"
  },
  node_id: {
    type: DATA_TYPES.STRING,
    description: "Repository node ID"
  },
  name: {
    type: DATA_TYPES.STRING,
    description: "Repository name"
  },
  full_name: {
    type: DATA_TYPES.STRING,
    description: "Full repository name (owner/repo)"
  },
  private: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether the repository is private"
  },
  owner_login: {
    type: DATA_TYPES.STRING,
    description: "Repository owner login"
  },
  owner_id: {
    type: DATA_TYPES.INTEGER,
    description: "Repository owner ID"
  },
  owner_type: {
    type: DATA_TYPES.STRING,
    description: "Repository owner type (User/Organization)"
  },
  html_url: {
    type: DATA_TYPES.STRING,
    description: "Repository HTML URL"
  },
  description: {
    type: DATA_TYPES.STRING,
    description: "Repository description"
  },
  fork: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether the repository is a fork"
  },
  created_at: {
    type: DATA_TYPES.DATE,
    description: "Repository creation date"
  },
  updated_at: {
    type: DATA_TYPES.DATE,
    description: "Repository last update date"
  },
  pushed_at: {
    type: DATA_TYPES.DATE,
    description: "Repository last push date"
  },
  homepage: {
    type: DATA_TYPES.STRING,
    description: "Repository homepage URL"
  },
  size: {
    type: DATA_TYPES.INTEGER,
    description: "Repository size in KB"
  },
  stargazers_count: {
    type: DATA_TYPES.INTEGER,
    description: "Number of stars"
  },
  watchers_count: {
    type: DATA_TYPES.INTEGER,
    description: "Number of watchers"
  },
  language: {
    type: DATA_TYPES.STRING,
    description: "Primary programming language"
  },
  has_issues: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether the repository has issues enabled"
  },
  has_projects: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether the repository has projects enabled"
  },
  has_downloads: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether the repository has downloads enabled"
  },
  has_wiki: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether the repository has wiki enabled"
  },
  has_pages: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether the repository has pages enabled"
  },
  has_discussions: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether the repository has discussions enabled"
  },
  forks_count: {
    type: DATA_TYPES.INTEGER,
    description: "Number of forks"
  },
  archived: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether the repository is archived"
  },
  disabled: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether the repository is disabled"
  },
  open_issues_count: {
    type: DATA_TYPES.INTEGER,
    description: "Number of open issues"
  },
  license_key: {
    type: DATA_TYPES.STRING,
    description: "Repository license key"
  },
  license_name: {
    type: DATA_TYPES.STRING,
    description: "Repository license name"
  },
  allow_forking: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether forking is allowed"
  },
  is_template: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether the repository is a template"
  },
  web_commit_signoff_required: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether web commit signoff is required"
  },
  topics: {
    type: DATA_TYPES.STRING,
    description: "Repository topics (comma-separated)"
  },
  visibility: {
    type: DATA_TYPES.STRING,
    description: "Repository visibility (public/private)"
  },
  forks: {
    type: DATA_TYPES.INTEGER,
    description: "Number of forks"
  },
  open_issues: {
    type: DATA_TYPES.INTEGER,
    description: "Number of open issues"
  },
  watchers: {
    type: DATA_TYPES.INTEGER,
    description: "Number of watchers"
  },
  default_branch: {
    type: DATA_TYPES.STRING,
    description: "Default branch name"
  },
  network_count: {
    type: DATA_TYPES.INTEGER,
    description: "Network count"
  },
  subscribers_count: {
    type: DATA_TYPES.INTEGER,
    description: "Number of subscribers"
  }
};
