/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var repositoryFields = {
  id: {
    type: "integer",
    description: "Repository ID"
  },
  node_id: {
    type: "string",
    description: "Repository node ID"
  },
  name: {
    type: "string",
    description: "Repository name"
  },
  full_name: {
    type: "string",
    description: "Full repository name (owner/repo)"
  },
  private: {
    type: "boolean",
    description: "Whether the repository is private"
  },
  owner_login: {
    type: "string",
    description: "Repository owner login"
  },
  owner_id: {
    type: "integer",
    description: "Repository owner ID"
  },
  owner_type: {
    type: "string",
    description: "Repository owner type (User/Organization)"
  },
  html_url: {
    type: "string",
    description: "Repository HTML URL"
  },
  description: {
    type: "string",
    description: "Repository description"
  },
  fork: {
    type: "boolean",
    description: "Whether the repository is a fork"
  },
  created_at: {
    type: "date",
    description: "Repository creation date"
  },
  updated_at: {
    type: "date",
    description: "Repository last update date"
  },
  pushed_at: {
    type: "date",
    description: "Repository last push date"
  },
  homepage: {
    type: "string",
    description: "Repository homepage URL"
  },
  size: {
    type: "integer",
    description: "Repository size in KB"
  },
  stargazers_count: {
    type: "integer",
    description: "Number of stars"
  },
  watchers_count: {
    type: "integer",
    description: "Number of watchers"
  },
  language: {
    type: "string",
    description: "Primary programming language"
  },
  has_issues: {
    type: "boolean",
    description: "Whether the repository has issues enabled"
  },
  has_projects: {
    type: "boolean",
    description: "Whether the repository has projects enabled"
  },
  has_downloads: {
    type: "boolean",
    description: "Whether the repository has downloads enabled"
  },
  has_wiki: {
    type: "boolean",
    description: "Whether the repository has wiki enabled"
  },
  has_pages: {
    type: "boolean",
    description: "Whether the repository has pages enabled"
  },
  has_discussions: {
    type: "boolean",
    description: "Whether the repository has discussions enabled"
  },
  forks_count: {
    type: "integer",
    description: "Number of forks"
  },
  archived: {
    type: "boolean",
    description: "Whether the repository is archived"
  },
  disabled: {
    type: "boolean",
    description: "Whether the repository is disabled"
  },
  open_issues_count: {
    type: "integer",
    description: "Number of open issues"
  },
  license_key: {
    type: "string",
    description: "Repository license key"
  },
  license_name: {
    type: "string",
    description: "Repository license name"
  },
  allow_forking: {
    type: "boolean",
    description: "Whether forking is allowed"
  },
  is_template: {
    type: "boolean",
    description: "Whether the repository is a template"
  },
  web_commit_signoff_required: {
    type: "boolean",
    description: "Whether web commit signoff is required"
  },
  topics: {
    type: "string",
    description: "Repository topics (comma-separated)"
  },
  visibility: {
    type: "string",
    description: "Repository visibility (public/private)"
  },
  forks: {
    type: "integer",
    description: "Number of forks"
  },
  open_issues: {
    type: "integer",
    description: "Number of open issues"
  },
  watchers: {
    type: "integer",
    description: "Number of watchers"
  },
  default_branch: {
    type: "string",
    description: "Default branch name"
  },
  network_count: {
    type: "integer",
    description: "Network count"
  },
  subscribers_count: {
    type: "integer",
    description: "Number of subscribers"
  }
};
