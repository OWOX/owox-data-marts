---
"owox": minor
---

# Auto-create Google Sheets documents for reports

Add a "Create document" action to the Google Sheets report form that auto-creates a new spreadsheet for the selected destination and fills in its link — so users no longer have to manually create and share a sheet. It works for both authentication methods: OAuth (the document is created in the connected account's Drive and shared with the requesting user) and Service Account (the document is created in a configured Shared Drive folder).

Destinations can target a Drive folder for auto-created documents: paste a folder URL for Service Account destinations (validated on save — it must be a Shared Drive folder the service account can write to), or pick one with the Google Drive Picker for OAuth destinations. The Picker requires a new `GOOGLE_PICKER_API_KEY` environment variable, and the OAuth destination flow now also requests the non-sensitive `drive.file` scope (existing OAuth destinations must reconnect to grant it before folder placement and sharing work).
