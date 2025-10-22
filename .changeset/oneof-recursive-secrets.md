---
owox: minor
---

# Added support for oneOf fields with recursive secret masking

This release adds comprehensive support for oneOf configuration fields with nested secret handling. The connector secret service now recursively masks and merges secret fields within oneOf structures, ensuring sensitive data like API keys and tokens in nested authentication configurations are properly protected.

New UI components include ButtonGroup for value-based selection and AppWizardCollapsible for expandable sections. Fixed an issue where the wrong oneOf variant was pre-selected when editing existing configurations.

Added Advanced Fields section to the connector configuration form, allowing users to configure advanced settings for the connector.
