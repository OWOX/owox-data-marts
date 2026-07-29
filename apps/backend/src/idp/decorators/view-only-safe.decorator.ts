import { SetMetadata } from '@nestjs/common';

export const VIEW_ONLY_SAFE_METADATA = 'viewOnlySafe';

/**
 * Marks a read-semantics POST endpoint as safe for view-only sessions.
 *
 * The IDP guard intentionally reads this metadata only from route handlers and
 * honors it only for POST requests. Mutating PUT/PATCH/DELETE endpoints remain
 * blocked even if annotated.
 */
export const ViewOnlySafe = () => SetMetadata(VIEW_ONLY_SAFE_METADATA, true);
