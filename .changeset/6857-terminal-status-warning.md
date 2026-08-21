---
'owox': minor
---

# Connector runs interrupted by a restart are reported as a warning

When a server restart stops a connector run, the run resumes by itself and continues from the last day it finished. Run history now shows this as a warning instead of an error, so a restart no longer looks like a failed import. Runs that stop for any other reason are still reported as errors.
