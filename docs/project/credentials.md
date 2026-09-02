# Credentials

Credentials are reusable, project-owned secrets for external services. A project member saves a
provider key once, then grants the Credential to plugin installations without copying the secret
into plugin settings or plugin code.

Open **Credentials** from the project sidebar to create and manage them. Choose a provider, enter a
name and secret, set owners and contexts, and decide whether other project members may use or
maintain the Credential. The secret is write-only: it can be replaced, but it is never displayed
after saving.

## Ownership and access

A Credential belongs to the project, not to the member who created it. The creator is recorded for
audit and becomes the first owner, but removing that member from the project does not disable the
Credential or stop consumers that already use it. At least one owner must remain.

Owners and Project Admins can manage the Credential. The **Shared for use** and **Shared for
maintenance** settings add access for other eligible project members, subject to their role scope
and assigned contexts. Consumers re-check access, status, and definition compatibility whenever
they use a Credential.

## Plugin use

A plugin release declares each Credential capability it needs. During installation, the member
explicitly selects a compatible project Credential for every required capability and may choose
not to grant an optional one. The plugin receives a handle that can make approved requests; the
raw secret never enters its frame.

The **Used by** section shows active consumer bindings and when each binding last succeeded. The
Credential list also shows aggregate last use. A Credential with active bindings cannot be deleted;
disable it to stop use immediately, or first remove or replace the consumer bindings. Replacing a
secret keeps the bindings and consumers use the new value on their next request.

## AI mappings

An AI-capable Credential maps logical `fast`, `reasoning`, and `embedding` capabilities to provider
model IDs. A mapping can follow the definition's recommended model or override it with a fixed
provider model ID. Recommended mappings follow compatible definition updates automatically;
overrides stay unchanged. If an override selected from the definition catalog later disappears,
consumers that require it need setup again. An advanced manual model ID remains a deliberate manual
override and does not depend on catalog membership.

## External definitions

Built-in definitions cover common providers. A maintainer may also add a declarative Credential
definition from a public or deployment-accessible private GitHub repository. Private definitions
use the same configured GitHub access as private plugins. OWOX reads immutable release versions
and checks for updates daily. See
[Credential definitions](../plugins/credential-definitions.md) for the authoring contract.

Compatible updates within the accepted version line become current automatically. A new
compatibility line requires explicit maintainer consent before runtime use resumes. If GitHub is
unavailable or a release is invalid, the last accepted version remains active.

Provider validation is optional and informational. A definite authentication rejection prevents a
new or replacement secret from being saved; an unavailable or inconclusive probe does not.

Credentials use the same product database and behavior in OWOX Cloud and self-managed deployments;
there is no separate Credential encryption or vault configuration in this feature.
