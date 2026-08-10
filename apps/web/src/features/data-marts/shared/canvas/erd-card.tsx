import type { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartDefinitionTypeModel } from '../types/data-mart-definition-type.model';
import { definitionTypeAccent } from './definition-type-accent';
import { OWOX_GREEN_BASE, OWOX_YELLOW_BASE } from './owox-palette';

interface ErdStatusDotProps {
  isDraft: boolean;
  /**
   * When the surrounding card already announces the draft state through other
   * text (e.g. a floating warning label), pass true to keep the dot visual-only
   * and avoid duplicate announcements for assistive technology.
   */
  decorative?: boolean;
}

/** Published/draft status dot used in ERD card headers. */
export function ErdStatusDot({ isDraft, decorative = false }: ErdStatusDotProps) {
  const label = isDraft ? 'Draft' : 'Published';
  return (
    <span className='inline-flex shrink-0 items-center' title={label}>
      <span
        className='h-2 w-2 rounded-full'
        style={{ background: isDraft ? OWOX_YELLOW_BASE : OWOX_GREEN_BASE }}
        aria-hidden='true'
      />
      {!decorative && <span className='sr-only'>{label}</span>}
    </span>
  );
}

/**
 * Definition-type pill (VIEW / SQL / TABLE / PATTERN / CONNECTOR) used in ERD
 * card meta rows. Renders nothing while the type is unknown (still enriching,
 * fetch failed, or no access) — a gray "—" pill would only add noise.
 */
export function ErdDefinitionBadge({ type }: { type: DataMartDefinitionType | null }) {
  if (!type) return null;
  const info = DataMartDefinitionTypeModel.getInfo(type);
  const color = definitionTypeAccent(type);
  const Icon = info.icon;
  return (
    <span
      className='inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase'
      style={{ background: color }}
    >
      <Icon className='h-2.5 w-2.5' />
      {info.displayName}
    </span>
  );
}
