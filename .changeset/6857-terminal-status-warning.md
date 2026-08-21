---
'owox': minor
---

# Interrupted connector runs are reported as a warning

A run that stops without reporting a final status is resumed automatically, and it continues from the last day it finished rather than starting over. Run history now shows this as a warning instead of an error, so a single interrupted attempt no longer looks like a failed import.
