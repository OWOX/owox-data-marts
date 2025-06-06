/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adAccountAdsFields = {
'id': {
    'description': 'The ID of this ad',
    'type': 'numeric string'
},
'insights': {
    'description': 'Analytics summary for all objects',
    'type': 'Edge<AdsInsights>'
},
'total_count': {
    'description': 'Total number of Ads returned by the query',
    'type': 'unsigned int32'
}
    
}