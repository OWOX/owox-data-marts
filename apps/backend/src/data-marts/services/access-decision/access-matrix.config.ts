import {
  EntityType,
  Action,
  Role,
  OwnerStatus,
  SharingState,
  AccessRule,
} from './access-decision.types';

/**
 * Helper to expand rules across multiple sharing states.
 * `any` = all sharing states get the same result.
 */
function expandSharingStates(
  entityType: EntityType,
  action: Action,
  role: Role,
  ownershipStatus: OwnerStatus,
  sharingStates: SharingState[] | 'any',
  result: boolean
): AccessRule[] {
  const states: SharingState[] =
    sharingStates === 'any' ? Object.values(SharingState) : sharingStates;
  return states.map(sharingState => ({
    entityType,
    action,
    role,
    ownershipStatus,
    sharingState,
    result,
  }));
}

function allActions(entityType: EntityType): Action[] {
  switch (entityType) {
    case EntityType.STORAGE:
      return [
        Action.SEE,
        Action.USE,
        Action.COPY_CREDENTIALS,
        Action.EDIT,
        Action.DELETE,
        Action.CONFIGURE_SHARING,
        Action.MANAGE_OWNERS,
      ];
    case EntityType.DATA_MART:
      return [
        Action.SEE,
        Action.USE,
        Action.EDIT,
        Action.DELETE,
        Action.CONFIGURE_SHARING,
        Action.MANAGE_OWNERS,
        Action.MANAGE_TRIGGERS,
      ];
    case EntityType.DESTINATION:
      return [
        Action.SEE,
        Action.USE,
        Action.COPY_CREDENTIALS,
        Action.EDIT,
        Action.DELETE,
        Action.CONFIGURE_SHARING,
        Action.MANAGE_OWNERS,
      ];
    default:
      return [];
  }
}

/**
 * Expand admin rules: admin + any ownership + any sharing = allow all actions
 */
function adminRules(entityType: EntityType): AccessRule[] {
  return allActions(entityType).flatMap(action =>
    Object.values(OwnerStatus).flatMap(ownerStatus =>
      expandSharingStates(entityType, action, Role.ADMIN, ownerStatus, 'any', true)
    )
  );
}

// ============================================================
// STORAGE RULES
// ============================================================

const storageActions = allActions(EntityType.STORAGE);

const storageOwnerTuRules: AccessRule[] = storageActions.flatMap(action =>
  expandSharingStates(EntityType.STORAGE, action, Role.EDITOR, OwnerStatus.OWNER, 'any', true)
);

// BU owner of Storage = stored but no effect (role mismatch)
const storageOwnerBuRules: AccessRule[] = storageActions.flatMap(action =>
  expandSharingStates(EntityType.STORAGE, action, Role.VIEWER, OwnerStatus.OWNER, 'any', false)
);

// Non-owner TU + Not shared = invisible
const storageNonOwnerTuNotShared: AccessRule[] = storageActions.flatMap(action =>
  expandSharingStates(
    EntityType.STORAGE,
    action,
    Role.EDITOR,
    OwnerStatus.NON_OWNER,
    [SharingState.NOT_SHARED],
    false
  )
);

// Non-owner TU + Shared for use = SEE + USE only
const storageNonOwnerTuSharedUse: AccessRule[] = storageActions.flatMap(action => {
  const allowed = action === Action.SEE || action === Action.USE;
  return expandSharingStates(
    EntityType.STORAGE,
    action,
    Role.EDITOR,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_USE],
    allowed
  );
});

// Non-owner TU + Shared for maintenance = SEE + USE + COPY_CREDENTIALS + EDIT + DELETE
const storageNonOwnerTuSharedMaint: AccessRule[] = storageActions.flatMap(action => {
  const allowed = [
    Action.SEE,
    Action.USE,
    Action.COPY_CREDENTIALS,
    Action.EDIT,
    Action.DELETE,
  ].includes(action);
  return expandSharingStates(
    EntityType.STORAGE,
    action,
    Role.EDITOR,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_MAINTENANCE],
    allowed
  );
});

// Non-owner TU + Shared for both = same as maintenance
const storageNonOwnerTuSharedBoth: AccessRule[] = storageActions.flatMap(action => {
  const allowed = [
    Action.SEE,
    Action.USE,
    Action.COPY_CREDENTIALS,
    Action.EDIT,
    Action.DELETE,
  ].includes(action);
  return expandSharingStates(
    EntityType.STORAGE,
    action,
    Role.EDITOR,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_BOTH],
    allowed
  );
});

// Non-owner BU + any sharing = no access
const storageNonOwnerBuRules: AccessRule[] = storageActions.flatMap(action =>
  expandSharingStates(EntityType.STORAGE, action, Role.VIEWER, OwnerStatus.NON_OWNER, 'any', false)
);

// ============================================================
// DATA MART RULES
// ============================================================

const dmActions = allActions(EntityType.DATA_MART);

// Tech Owner (TU+) = full access regardless of sharing
const dmTechOwnerTuRules: AccessRule[] = dmActions.flatMap(action =>
  expandSharingStates(
    EntityType.DATA_MART,
    action,
    Role.EDITOR,
    OwnerStatus.TECH_OWNER,
    'any',
    true
  )
);

// Tech Owner (BU) = SEE + USE only
const dmTechOwnerBuRules: AccessRule[] = dmActions.flatMap(action => {
  const allowed = action === Action.SEE || action === Action.USE;
  return expandSharingStates(
    EntityType.DATA_MART,
    action,
    Role.VIEWER,
    OwnerStatus.TECH_OWNER,
    'any',
    allowed
  );
});

// Biz Owner (any role, using editor) = SEE + USE only
const dmBizOwnerEditorRules: AccessRule[] = dmActions.flatMap(action => {
  const allowed = action === Action.SEE || action === Action.USE;
  return expandSharingStates(
    EntityType.DATA_MART,
    action,
    Role.EDITOR,
    OwnerStatus.BIZ_OWNER,
    'any',
    allowed
  );
});

// Biz Owner (viewer) = SEE + USE only
const dmBizOwnerViewerRules: AccessRule[] = dmActions.flatMap(action => {
  const allowed = action === Action.SEE || action === Action.USE;
  return expandSharingStates(
    EntityType.DATA_MART,
    action,
    Role.VIEWER,
    OwnerStatus.BIZ_OWNER,
    'any',
    allowed
  );
});

// Non-owner TU + Not shared = invisible
const dmNonOwnerTuNotShared: AccessRule[] = dmActions.flatMap(action =>
  expandSharingStates(
    EntityType.DATA_MART,
    action,
    Role.EDITOR,
    OwnerStatus.NON_OWNER,
    [SharingState.NOT_SHARED],
    false
  )
);

// Non-owner TU + Shared for reporting = SEE + USE
const dmNonOwnerTuSharedReporting: AccessRule[] = dmActions.flatMap(action => {
  const allowed = action === Action.SEE || action === Action.USE;
  return expandSharingStates(
    EntityType.DATA_MART,
    action,
    Role.EDITOR,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_REPORTING],
    allowed
  );
});

// Non-owner TU + Shared for maintenance = SEE + USE + EDIT + DELETE + MANAGE_TRIGGERS
const dmNonOwnerTuSharedMaint: AccessRule[] = dmActions.flatMap(action => {
  const allowed = [
    Action.SEE,
    Action.USE,
    Action.EDIT,
    Action.DELETE,
    Action.MANAGE_TRIGGERS,
  ].includes(action);
  return expandSharingStates(
    EntityType.DATA_MART,
    action,
    Role.EDITOR,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_MAINTENANCE],
    allowed
  );
});

// Non-owner TU + Shared for both = same as maintenance
const dmNonOwnerTuSharedBoth: AccessRule[] = dmActions.flatMap(action => {
  const allowed = [
    Action.SEE,
    Action.USE,
    Action.EDIT,
    Action.DELETE,
    Action.MANAGE_TRIGGERS,
  ].includes(action);
  return expandSharingStates(
    EntityType.DATA_MART,
    action,
    Role.EDITOR,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_BOTH],
    allowed
  );
});

// Non-owner BU + Not shared = invisible
const dmNonOwnerBuNotShared: AccessRule[] = dmActions.flatMap(action =>
  expandSharingStates(
    EntityType.DATA_MART,
    action,
    Role.VIEWER,
    OwnerStatus.NON_OWNER,
    [SharingState.NOT_SHARED],
    false
  )
);

// Non-owner BU + Shared for reporting = SEE + USE
const dmNonOwnerBuSharedReporting: AccessRule[] = dmActions.flatMap(action => {
  const allowed = action === Action.SEE || action === Action.USE;
  return expandSharingStates(
    EntityType.DATA_MART,
    action,
    Role.VIEWER,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_REPORTING],
    allowed
  );
});

// Non-owner BU + Shared for maintenance = no access (BU cannot do maintenance)
const dmNonOwnerBuSharedMaint: AccessRule[] = dmActions.flatMap(action =>
  expandSharingStates(
    EntityType.DATA_MART,
    action,
    Role.VIEWER,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_MAINTENANCE],
    false
  )
);

// Non-owner BU + Shared for both = SEE + USE (reporting part only)
const dmNonOwnerBuSharedBoth: AccessRule[] = dmActions.flatMap(action => {
  const allowed = action === Action.SEE || action === Action.USE;
  return expandSharingStates(
    EntityType.DATA_MART,
    action,
    Role.VIEWER,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_BOTH],
    allowed
  );
});

// ============================================================
// DESTINATION RULES
// ============================================================

const destActions = allActions(EntityType.DESTINATION);

// Owner (any role, editor) = full access
const destOwnerEditorRules: AccessRule[] = destActions.flatMap(action =>
  expandSharingStates(EntityType.DESTINATION, action, Role.EDITOR, OwnerStatus.OWNER, 'any', true)
);

// Owner (viewer) = full access
const destOwnerViewerRules: AccessRule[] = destActions.flatMap(action =>
  expandSharingStates(EntityType.DESTINATION, action, Role.VIEWER, OwnerStatus.OWNER, 'any', true)
);

// Non-owner TU + Not shared = invisible
const destNonOwnerTuNotShared: AccessRule[] = destActions.flatMap(action =>
  expandSharingStates(
    EntityType.DESTINATION,
    action,
    Role.EDITOR,
    OwnerStatus.NON_OWNER,
    [SharingState.NOT_SHARED],
    false
  )
);

// Non-owner TU + Shared for use = SEE + USE only
const destNonOwnerTuSharedUse: AccessRule[] = destActions.flatMap(action => {
  const allowed = action === Action.SEE || action === Action.USE;
  return expandSharingStates(
    EntityType.DESTINATION,
    action,
    Role.EDITOR,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_USE],
    allowed
  );
});

// Non-owner TU + Shared for maintenance = SEE + USE + COPY_CREDENTIALS + EDIT + DELETE
const destNonOwnerTuSharedMaint: AccessRule[] = destActions.flatMap(action => {
  const allowed = [
    Action.SEE,
    Action.USE,
    Action.COPY_CREDENTIALS,
    Action.EDIT,
    Action.DELETE,
  ].includes(action);
  return expandSharingStates(
    EntityType.DESTINATION,
    action,
    Role.EDITOR,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_MAINTENANCE],
    allowed
  );
});

// Non-owner TU + Shared for both = same as maintenance
const destNonOwnerTuSharedBoth: AccessRule[] = destActions.flatMap(action => {
  const allowed = [
    Action.SEE,
    Action.USE,
    Action.COPY_CREDENTIALS,
    Action.EDIT,
    Action.DELETE,
  ].includes(action);
  return expandSharingStates(
    EntityType.DESTINATION,
    action,
    Role.EDITOR,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_BOTH],
    allowed
  );
});

// Non-owner BU + Not shared = invisible
const destNonOwnerBuNotShared: AccessRule[] = destActions.flatMap(action =>
  expandSharingStates(
    EntityType.DESTINATION,
    action,
    Role.VIEWER,
    OwnerStatus.NON_OWNER,
    [SharingState.NOT_SHARED],
    false
  )
);

// Non-owner BU + Shared for use = SEE + USE
const destNonOwnerBuSharedUse: AccessRule[] = destActions.flatMap(action => {
  const allowed = action === Action.SEE || action === Action.USE;
  return expandSharingStates(
    EntityType.DESTINATION,
    action,
    Role.VIEWER,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_USE],
    allowed
  );
});

// Non-owner BU + Shared for maintenance = SEE + USE + COPY_CREDENTIALS + EDIT + DELETE
const destNonOwnerBuSharedMaint: AccessRule[] = destActions.flatMap(action => {
  const allowed = [
    Action.SEE,
    Action.USE,
    Action.COPY_CREDENTIALS,
    Action.EDIT,
    Action.DELETE,
  ].includes(action);
  return expandSharingStates(
    EntityType.DESTINATION,
    action,
    Role.VIEWER,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_MAINTENANCE],
    allowed
  );
});

// Non-owner BU + Shared for both = same as maintenance
const destNonOwnerBuSharedBoth: AccessRule[] = destActions.flatMap(action => {
  const allowed = [
    Action.SEE,
    Action.USE,
    Action.COPY_CREDENTIALS,
    Action.EDIT,
    Action.DELETE,
  ].includes(action);
  return expandSharingStates(
    EntityType.DESTINATION,
    action,
    Role.VIEWER,
    OwnerStatus.NON_OWNER,
    [SharingState.SHARED_FOR_BOTH],
    allowed
  );
});

// ============================================================
// COMBINED ACCESS MATRIX
// ============================================================

export const ACCESS_MATRIX: AccessRule[] = [
  // --- Storage ---
  ...adminRules(EntityType.STORAGE),
  ...storageOwnerTuRules,
  ...storageOwnerBuRules,
  ...storageNonOwnerTuNotShared,
  ...storageNonOwnerTuSharedUse,
  ...storageNonOwnerTuSharedMaint,
  ...storageNonOwnerTuSharedBoth,
  ...storageNonOwnerBuRules,

  // --- DataMart ---
  ...adminRules(EntityType.DATA_MART),
  ...dmTechOwnerTuRules,
  ...dmTechOwnerBuRules,
  ...dmBizOwnerEditorRules,
  ...dmBizOwnerViewerRules,
  ...dmNonOwnerTuNotShared,
  ...dmNonOwnerTuSharedReporting,
  ...dmNonOwnerTuSharedMaint,
  ...dmNonOwnerTuSharedBoth,
  ...dmNonOwnerBuNotShared,
  ...dmNonOwnerBuSharedReporting,
  ...dmNonOwnerBuSharedMaint,
  ...dmNonOwnerBuSharedBoth,

  // --- Destination ---
  ...adminRules(EntityType.DESTINATION),
  ...destOwnerEditorRules,
  ...destOwnerViewerRules,
  ...destNonOwnerTuNotShared,
  ...destNonOwnerTuSharedUse,
  ...destNonOwnerTuSharedMaint,
  ...destNonOwnerTuSharedBoth,
  ...destNonOwnerBuNotShared,
  ...destNonOwnerBuSharedUse,
  ...destNonOwnerBuSharedMaint,
  ...destNonOwnerBuSharedBoth,
];
