---
'owox': minor
---

# Fix incremental state management for multiple connector configurations

Fixed an issue where incremental updates only saved state for the last configuration when a Data Mart had 2+ connector configurations. Now each configuration's state is tracked separately using its `_id`. Also enhanced logging with structured metadata (dataMartId, projectId, runId, configId).

**Changes:**

- Updated state structure to support array of states per configuration: `{at, states: [{_id, state, at}]}`
- Modified `ConnectorStateService` to handle `configId` parameter for getting and updating state
- Updated `ConnectorExecutionService` to extract and pass `configId` from configuration
- Added database migration to transform existing state data from old to new format
- Enhanced logging with structured metadata (dataMartId, projectId, runId, configId)
