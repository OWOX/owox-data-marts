---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Open the Google Sheet a scheduled report fills, right from Triggers**

Checking the results of a report-run schedule used to mean opening the row's info card and
finding **Open in Google Sheets** tucked inside it — an action many people never discovered.
On the **Triggers** page under **Data Marts**, and in each Data Mart's **Triggers** tab, hovering
a report-run row now shows the same quick actions as the **Reports** tables: an **Open document**
button that opens the report's Google Sheet in a new tab, next to the info button.

- The info button now opens its card on click instead of on hover, for both reports and
  connectors, and each button names itself in a tooltip.
- Clicking either button, or anything inside the card, no longer opens the trigger's edit panel.
- The **Run Target** column is wider to fit the report name alongside these buttons.
- **Open document** shows only for reports whose destination is Google Sheets.
- See [Report Trigger](../../docs/getting-started/setup-guide/report-triggers.md) for how
  report-run schedules work.
