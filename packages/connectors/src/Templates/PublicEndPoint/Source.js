/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var YOUR_DATE_SOURCE_Source = class YOUR_DATE_SOURCE_Source extends AbstractSource {

  constructor( configRange ) {
  
    super( configRange.mergeParameters({
      StartDate: {
        isRequired: true,
        requiredType: "date",
        label: 'Start Date',
        description: 'Start date for data import',
        attributes: ['manualBackfill']
      },
      EndDate: {
        isRequired: true,
        requiredType: "date",
        label: 'End Date',
        description: 'End date for data import',
        attributes: ['manualBackfill']
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2
      },
      CleanUpToKeepWindow: {
        requiredType: "number"
      },
      DestinationSheetName: {
        isRequired: true,
        default: "Data"
      },
      MaxFetchingDays: {
        requiredType: "number",
        isRequired: true,
        default: 30,
        label: 'Max Fetching Days',
        description: 'Maximum number of days to fetch in one run'
      }
    }));
  
    //this.dateColumn = ["date"];
    //this.uniqueKeyColumns = ["date", "label"];
  
  }
  
  /*
  @param startDate start date
  @param endDate end date
  
  @return data array
  
  */
  fetchData(startDate, endDate)  {
  
    let data = [];
   
    //console.log(data);
    return data;
  
  }
    
  }