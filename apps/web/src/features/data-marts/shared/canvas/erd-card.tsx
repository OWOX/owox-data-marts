import { CircleCheckBig } from 'lucide-react';
import type { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartDefinitionTypeModel } from '../types/data-mart-definition-type.model';
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
 * Draft/Published status pill used in ERD card meta rows. Text-only and
 * styled like the definition-type pill (no color) so it can't be mistaken
 * for a data-quality indicator — those own the yellow/green/red palette.
 * @param joined - When the definition-type pill sits right next to it (no
 * gap), pass true to flatten the shared edge so the two read as one pill.
 */
export function ErdStatusBadge({
  isDraft,
  joined = false,
}: {
  isDraft: boolean;
  joined?: boolean;
}) {
  return (
    <span
      className={`border-border inline-flex items-center gap-1 border px-1.5 py-0.25 text-[8px] font-semibold tracking-wide uppercase ${joined ? 'rounded-l-full border-r-0 pl-1' : 'rounded-full'}`}
    >
      {!isDraft && <CircleCheckBig className='h-2.5 w-2.5' />}
      {isDraft ? 'Draft' : 'Published'}
    </span>
  );
}

/**
 * Definition-type pill (VIEW / SQL / TABLE / PATTERN / CONNECTOR) used in ERD
 * card meta rows. Renders nothing while the type is unknown (still enriching,
 * fetch failed, or no access) — a gray "—" pill would only add noise.
 * @param joined - When the status pill sits right before it (no gap), pass
 * true to flatten the shared edge so the two read as one pill.
 */
export function ErdDefinitionBadge({
  type,
  joined = false,
}: {
  type: DataMartDefinitionType | null;
  joined?: boolean;
}) {
  if (!type) return null;
  const info = DataMartDefinitionTypeModel.getInfo(type);
  const Icon = info.icon;
  return (
    <span
      className={`border-border inline-flex items-center gap-1 border px-1.5 py-0.25 text-[8px] font-semibold tracking-wide uppercase ${joined ? 'rounded-r-full' : '-ml-0.5 rounded-full'}`}
    >
      <Icon className='h-2.5 w-2.5' />
      {info.displayName}
    </span>
  );
}
