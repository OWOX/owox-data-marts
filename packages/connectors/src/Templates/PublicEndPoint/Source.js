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
        default: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        label: "Start Date",
        description: "Start date for data import"
      },
      EndDate: {
        isRequired: true,
        requiredType: "date",
        default: new Date(),
        label: "End Date",
        description: "End date for data import"
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2,
        label: "Reimport Lookback Window",
        description: "Number of days to look back when reimporting data"
      },
      CleanUpToKeepWindow: {
        requiredType: "number",
        label: "Clean Up To Keep Window",
        description: "Number of days to keep data before cleaning up"
      },
      DestinationSheetName: {
        isRequired: true,
        default: "Data",
        label: "Destination Sheet Name",
        description: "Name of the sheet where data will be stored"
      },
      MaxFetchingDays: {
        requiredType: "number",
        isRequired: true,
        default: 30,
        label: "Max Fetching Days",
        description: "Maximum number of days to fetch data for"
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