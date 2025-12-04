/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/OrderRiskAssessment
// Note: OrderRisk is deprecated, using OrderRiskAssessment instead

var orderRisksFields = {
  'orderId': {
    'description': 'The ID of the order.',
    'type': 'string',
    'graphqlPath': 'order { id }'
  },
  'riskLevel': {
    'description': 'The risk level (NONE, LOW, MEDIUM, HIGH).',
    'type': 'string',
    'graphqlPath': 'riskLevel'
  },
  'providerTitle': {
    'description': 'The title of the risk assessment provider.',
    'type': 'string',
    'graphqlPath': 'provider { title }'
  }
};
