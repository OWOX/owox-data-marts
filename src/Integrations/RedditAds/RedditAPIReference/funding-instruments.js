/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var fundingInstrumentFields = {
    'id': {
        'description': 'The ID of the funding instrument.',
        'type': 'string'
    },
    'name': {
        'description': 'The name of the funding instrument, if any.',
        'type': 'string'
    },
    'currency': {
        'description': 'An ISO4217 currency code indicating the currency used in this invoice.',
        'type': 'string'
    },
    'credit_limit': {
        'description': 'When the billable_amount exceeds this number, campaigns linked to this funding instrument will not run.',
        'type': 'integer'
    },
    'billable_amount': {
        'description': 'The current amount of outstanding debt on this funding instrument, in local micro-currency.',
        'type': 'integer'
    },
    'start_time': {
        'description': 'When set, campaigns linked to this funding instrument will not deliver unless the current time is beyond this ISO-8601 time.',
        'type': 'string'
    },
    'end_time': {
        'description': 'When set, campaigns linked to this funding instrument will not deliver unless the current time is before this ISO-8601 time.',
        'type': 'string'
    },
    'is_servable': {
        'description': 'When true, campaigns linked to this funding instrument are allowed to run.',
        'type': 'boolean'
    },
    'reasons_not_servable': {
        'description': 'Contains a list of reasons why this funding instrument is not servable. When this list is empty, it is servable.',
        'type': 'string'
    }
};