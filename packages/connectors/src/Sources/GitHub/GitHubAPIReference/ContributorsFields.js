/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var contributorsFields = {
  login: {
    type: DATA_TYPES.STRING,
    description: "Contributor login name"
  },
  id: {
    type: DATA_TYPES.STRING,
    description: "Contributor ID"
  },
  node_id: {
    type: DATA_TYPES.STRING,
    description: "Contributor node ID"
  },
  avatar_url: {
    type: DATA_TYPES.STRING,
    description: "Contributor avatar URL"
  },
  gravatar_id: {
    type: DATA_TYPES.STRING,
    description: "Contributor gravatar ID"
  },
  html_url: {
    type: DATA_TYPES.STRING,
    description: "Contributor HTML URL"
  },
  type: {
    type: DATA_TYPES.STRING,
    description: "Contributor type (User/Bot)"
  },
  site_admin: {
    type: DATA_TYPES.BOOLEAN,
    description: "Whether the contributor is a site admin"
  },
  contributions: {
    type: DATA_TYPES.INTEGER,
    description: "Number of contributions to the repository"
  }
};
