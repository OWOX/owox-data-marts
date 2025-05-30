/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adAccountFields = {
  'currency': {
    'description': 'The 3 character standard currency code such as USD for United States Dollar. Refer to the list of supported currencies for the full list.',
    'type': 'string'
  },
  'id': {
    'description': 'Unique internal ID representing the account',
    'type': 'long'
  },
  'name': {
    'description': 'A label for the account',
    'type': 'string'
  },
  'notifiedOnCampaignOptimization': {
    'description': 'Indicates if the campaign contact is notified about campaign optimization opportunities',
    'type': 'boolean'
  },
  'notifiedOnCreativeApproval': {
    'description': 'Indicates if the creative contact is notified when a creative has been reviewed and approved',
    'type': 'boolean'
  },
  'notifiedOnCreativeRejection': {
    'description': 'Indicates if the creative contact is notified when a creative has been rejected due to content',
    'type': 'boolean'
  },
  'notifiedOnEndOfCampaign': {
    'description': 'Indicates if the campaign contact is notified when an associated campaign has been completed',
    'type': 'boolean'
  },
  'notifiedOnNewFeaturesEnabled': {
    'description': 'Indicates if the account owner is notified about new Campaign Manager features',
    'type': 'boolean'
  },
  'reference': {
    'description': 'The entity on whose behalf the account is advertised. Must either be in the format urn:li:person:{id} or urn:li:organization:{id}',
    'type': 'string'
  },
  'referenceInfo': {
    'description': 'Information about the entity associated with the reference. If the entity is an organization, an Organizationinfo object is returned. If the entity is a person, a Personinfo object is returned. For all other entity types an empty record will be returned. This is a read only field. Please refer to Additional Info Fields to learn how to access this field.',
    'type': 'object'
  },
  'servingStatuses': {
    'description': 'An array of enums with information about the account\'s system serving statuses. If an account is eligible for serving, then the array has a single element:RUNNABLE Otherwise, the array contains one or more reasons why the account is not servable:',
    'type': 'string[]'
  },
  'status': {
    'description': 'ACTIVE - Account is active; this is the default state',
    'type': 'string'
  },
  'type': {
    'description': 'BUSINESS – This is the only value allowed when creating accounts through the API.',
    'type': 'string'
  },
  'test': {
    'description': 'Flag showing whether this account is marked as a test account. An account can be marked as test only during creation. This is an immutable field.',
    'type': 'boolean'
  }
} 