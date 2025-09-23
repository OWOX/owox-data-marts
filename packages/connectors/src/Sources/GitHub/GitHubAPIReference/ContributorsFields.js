/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var contributorsFields = {
  login: {
    type: "string",
    description: "Contributor login name"
  },
  id: {
    type: "integer",
    description: "Contributor ID"
  },
  node_id: {
    type: "string",
    description: "Contributor node ID"
  },
  avatar_url: {
    type: "string",
    description: "Contributor avatar URL"
  },
  gravatar_id: {
    type: "string",
    description: "Contributor gravatar ID"
  },
  html_url: {
    type: "string",
    description: "Contributor HTML URL"
  },
  type: {
    type: "string",
    description: "Contributor type (User/Bot)"
  },
  site_admin: {
    type: "boolean",
    description: "Whether the contributor is a site admin"
  },
  contributions: {
    type: "integer",
    description: "Number of contributions to the repository"
  }
};
