import type { ConsumptionBranch, ConsumptionProduct, ConsumptionUnit } from './cloud-billing';

export const licenseKeyLabel = 'SELF_MANAGED_LICENSE_KEY_ID';
export const originatingProjectLabel = 'SELF_MANAGED_PROJECT_ID';

const licenseEligibleUnits = new Set([
  'DATA_MARTS_HTTP_DATA_REPORT_RUN',
  'DATA_MARTS_MCP_QUERY_RUN',
  'DATA_MARTS_SHEETS_REPORT_RUN',
  'DATA_MARTS_EXCEL_REPORT_RUN',
  'DATA_MARTS_LOOKER_REPORT_RUN',
  'DATA_MARTS_EMAIL_REPORT_RUN',
  'DATA_MARTS_SLACK_REPORT_RUN',
  'DATA_MARTS_GOOGLE_CHAT_REPORT_RUN',
  'DATA_MARTS_MS_TEAMS_REPORT_RUN',
]);

type GroupKind = 'default' | 'license' | 'invalid';

interface ConsumptionGroup {
  kind: GroupKind;
  title: string;
  origin: string | null;
  operations: Map<
    string,
    { unit: ConsumptionUnit; branches: ConsumptionBranch[]; consumption: number }
  >;
}

const groupOrder: Record<GroupKind, number> = { default: 0, license: 1, invalid: 2 };

function flattenBranches(
  branches: ConsumptionBranch[],
  parentLabels: ConsumptionBranch['labels'] = {}
): ConsumptionBranch[] {
  return branches.flatMap(branch => {
    const labels = { ...parentLabels, ...branch.labels };
    return branch.childBranches?.length
      ? flattenBranches(branch.childBranches, labels)
      : [{ ...branch, labels }];
  });
}

function consumptionGroup(labels: ConsumptionBranch['labels'], eligible: boolean) {
  const licenseId = eligible ? labels[licenseKeyLabel] : undefined;
  const projectId = eligible ? labels[originatingProjectLabel] : undefined;
  if (licenseId && projectId)
    return { kind: 'license', key: `license:${licenseId}`, licenseId } as const;
  if (licenseId || projectId) return { kind: 'invalid', key: 'invalid' } as const;
  return { kind: 'default', key: 'default' } as const;
}

export function groupConsumption(product: ConsumptionProduct) {
  const licenses = new Map(product.entityProjections?.SELF_MANAGED_LICENSE?.map(p => [p.id, p]));
  const groups = new Map<string, ConsumptionGroup>();

  function addOperation(
    unit: ConsumptionUnit,
    branches: ConsumptionBranch[],
    consumption: number,
    attribution: ReturnType<typeof consumptionGroup>
  ) {
    const { kind, key } = attribution;
    let group = groups.get(key);
    if (!group) {
      const license = kind === 'license' ? licenses.get(attribution.licenseId) : undefined;
      const licenseTitle = (license?.title ?? '').trim();
      const title =
        kind === 'default'
          ? 'Default consumption'
          : kind === 'invalid'
            ? 'Invalid license attribution'
            : licenseTitle
              ? licenseTitle
              : 'Unknown license';
      group = { kind, title, origin: license?.origin ?? null, operations: new Map() };
      groups.set(key, group);
    }
    let operation = group.operations.get(unit.unit);
    if (!operation) {
      operation = { unit, branches: [], consumption: 0 };
      group.operations.set(unit.unit, operation);
    }
    operation.branches.push(...branches);
    operation.consumption += consumption;
  }

  for (const unit of product.units) {
    const eligible = licenseEligibleUnits.has(unit.unit);
    const branches = unit.decomposition ?? [];
    if (!eligible || !branches.length) {
      addOperation(unit, branches, unit.consumption, consumptionGroup({}, false));
      continue;
    }
    for (const row of flattenBranches(branches)) {
      addOperation(unit, [row], row.consumption, consumptionGroup(row.labels, true));
    }
  }

  // Keep the existing breakdown for products with no license attribution.
  if (!groups.size || (groups.size === 1 && groups.has('default'))) return [];

  const countsByUnit = new Map<string, number>();
  for (const group of groups.values()) {
    for (const [unit, operation] of group.operations) {
      countsByUnit.set(unit, (countsByUnit.get(unit) ?? 0) + 1);
      if (licenseEligibleUnits.has(unit))
        operation.branches.sort((a, b) => b.consumption - a.consumption);
    }
  }

  return [...groups.entries()]
    .sort(
      ([keyA, a], [keyB, b]) =>
        groupOrder[a.kind] - groupOrder[b.kind] ||
        a.title.localeCompare(b.title) ||
        keyA.localeCompare(keyB)
    )
    .map(([key, group]) => ({
      key,
      title: group.title,
      origin: group.origin,
      operations: [...group.operations.values()].map(({ unit, branches, consumption }) => {
        // Platform displays the IB-billed amount for a single scope and splits by usage otherwise.
        const split = (countsByUnit.get(unit.unit) ?? 0) > 1;
        return {
          unit: unit.unit,
          branches,
          units: split ? consumption : unit.roundedConsumption,
          credits: split ? consumption * unit.consumptionUnitPrice : unit.credits,
        };
      }),
    }));
}

export function parseDeploymentUrl(origin: string | null) {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) {
      return url;
    }
  } catch {
    return null;
  }
  return null;
}

export function consumptionEntityUrl(
  origin: URL,
  labels: ConsumptionBranch['labels'],
  type: string,
  id: string
) {
  const projectId = labels[originatingProjectLabel];
  if (!projectId) return null;

  let path: string[];
  let query: [string, string] | undefined;
  switch (type) {
    case 'DATA_MART':
      path = ['data-marts', id, 'data-setup'];
      break;
    case 'DATA_STORAGE':
      path = ['data-storages'];
      query = ['id', id];
      break;
    case 'DATA_DESTINATION':
      path = ['data-destinations'];
      query = ['id', id];
      break;
    case 'REPORT':
      if (!labels.DATA_MART) return null;
      path = ['data-marts', labels.DATA_MART, 'reports'];
      query = ['reportId', id];
      break;
    case 'CONTEXT':
      if (!labels.DATA_MART || labels.CONTEXT_TYPE !== 'INSIGHT') return null;
      path = ['data-marts', labels.DATA_MART, 'insights', id];
      break;
    default:
      return null;
  }
  const segments = ['ui', projectId, ...path];
  if (segments.some(segment => segment === '.' || segment === '..')) return null;
  const url = new URL('/' + segments.map(encodeURIComponent).join('/'), origin);
  if (query) url.searchParams.set(...query);
  return url.href;
}
