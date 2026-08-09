# Enterprise Edition (EE) Notice and Licensing Requirements

This directory contains Enterprise Edition (EE) code and assets. Use of the code in this folder is restricted and requires:

- Self-managed deployments use an active LICENSE-bound `CLOUD_BILLED_ENTERPRISE` key created in OWOX Data Marts Cloud (Project Settings → License keys), bound to the deployment origin and configured as `LICENSE_KEY`;
- The shared Cloud deployment uses a separately provisioned INTERNAL-bound `LICENSE_KEY`; the UI never creates it. It must be paired with the complete balance integration and rotated through the deployment secret process;
- Old signing keys must remain published until every license they signed expires. Legacy offline `ENTERPRISE` keys are not supported.

## Enforcement

Without a valid license, features in this directory may be disabled and/or blocked by build-time or runtime checks.

## Legal notice

Unauthorized use of the EE code is strictly prohibited. Any use, reproduction, modification, distribution, or derivation without a valid license may result in legal consequences.
