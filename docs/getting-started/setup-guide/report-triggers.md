# Report Update Trigger

Use this trigger when you want to automatically refresh the results of a **SQL-based**, **table-based**, **view-based**, or **pattern-based** Data Mart — and ensure reports in Google Sheets or Looker Studio stay up to date.

## When to use

Set up a **Report Run** trigger if:

- Your Data Mart is based on a SQL query, table, view, or pattern
- You want to refresh the data periodically in tools like Sheets or Looker Studio
- You want to automate updates for your shared reports and dashboards

## How to configure

1. Go to the **Triggers** tab of your Data Mart  
2. Click **+ Add Trigger**  
3. Select **Trigger Type** → `Report Run`  
4. Choose the schedule type:
   - **Daily** → Choose time and time zone
   - **Weekly** → Choose days, time, and time zone
   - **Monthly** → Pick dates, time, and time zone
   - **Interval** → e.g. every 30 minutes  
5. Click **Save**

![Report Trigger Setup](../../res/screens/SQL-Based-DataMart-Trigger.png)

After saving, the Data Mart will automatically refresh based on your schedule.

## Tips

- If business users manage their own refresh schedules (e.g. in Sheets), you don’t need to set one here
- Keep time zone alignment consistent across all triggers
- Review **Run History** to check for errors or API limits

## Related Links

- [Add More Destinations →](create-a-destination.md)  
- [Create SQL-Based Data Mart →](create-sql-data-mart.md)  
- [Create Table-Based Data Mart →](create-table-data-mart.md)  
- [Create View-Based Data Mart →](create-view-data-mart.md)  
- [Create Pattern-Based Data Mart →](create-pattern-data-mart.md)  
- [Create Connector-Based Data Mart →](create-connector-data-mart.md)  
- [Connector Triggers →](connector-triggers.md)
