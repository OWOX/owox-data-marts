---
'owox': minor
---

# Values starting with "+" no longer break in Google Sheets reports

Google Sheets treats a cell value that starts with `+` as the beginning of a formula, so exported values like session identifiers of the form `+Dri7…` used to show up as `#ERROR! Formula parse error` instead of the data.

Now the Google Sheets destination prefixes such values with an apostrophe (`'`) — the standard Sheets escape symbol. The cell displays the original value exactly as stored; the apostrophe is not part of the cell content. Only values starting with `+` are escaped: everything else, including formulas inserted as data (values starting with `=`), is exported unchanged.
