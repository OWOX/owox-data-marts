import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';
import {
  JOINED_UNIQUE_COUNT_AVAILABILITY_VALUES,
  JoinedUniqueCountAvailability,
} from '../../data-storage-types/data-mart-schema.utils';
import {
  AGGREGATE_FUNCTIONS,
  AggregateFunction,
  REPORT_AGGREGATE_FUNCTIONS,
  ReportAggregateFunction,
} from '../schemas/aggregate-function.schema';

export const MAIN_GRAIN_MULTIPLICATION_VALUES = ['none', 'multiplies', 'unknown'] as const;
export type MainGrainMultiplication = (typeof MAIN_GRAIN_MULTIPLICATION_VALUES)[number];

export const MAIN_GRAIN_COLLAPSE_VALUES = ['none', 'collapses'] as const;
export type MainGrainCollapse = (typeof MAIN_GRAIN_COLLAPSE_VALUES)[number];

export class BlendedFieldDto {
  @ApiProperty({
    description:
      'SQL-safe unified name for this blended field, used in report configs (columns, filters, sort, aggregations). Derived from (aliasPath, originalFieldName).',
  })
  name: string;

  @ApiProperty({ description: 'ID of the Data Mart relationship this field was pulled through.' })
  sourceRelationshipId: string;

  @ApiProperty({ description: 'ID of the joined Data Mart this field originates from.' })
  sourceDataMartId: string;

  @ApiProperty({ description: 'Title of the joined Data Mart this field originates from.' })
  sourceDataMartTitle: string;

  @ApiProperty({
    description:
      'SQL-safe alias segment for the relationship (matches ^[a-z0-9_]+$), used to build aliasPath.',
  })
  targetAlias: string;

  @ApiProperty({
    description:
      "The field's name as declared in the source Data Mart's schema, before qualification.",
  })
  originalFieldName: string;

  @ApiProperty({
    description:
      'Effective output type of this field in the blended result — the type AFTER the dedup aggregate function (aggregateFunction) is applied, not necessarily the raw source type.',
  })
  type: string;

  @ApiProperty({
    description:
      'The raw source-field type, before the dedup effective-type resolution overwrites `type`. Needed to recompute effective types for type-preserving dedups.',
  })
  sourceFieldType: string;

  @ApiProperty({
    description: 'Analyst-configured display alias for this field; empty string when unset.',
  })
  alias: string;

  @ApiProperty({
    description:
      "Field description inherited from the source Data Mart's schema; empty string when none is set.",
  })
  description: string;

  @ApiProperty({
    description:
      'Whether this field is hidden from the reporting column picker by analyst configuration.',
  })
  isHidden: boolean;

  @ApiProperty({
    description:
      'Whether this field is a CALCULATED field of the joined Data Mart — a formula, with no ' +
      'column behind it in the warehouse. It is still listed, because a client that only saw it ' +
      'disappear could not explain why: both consumers of this payload need to tell "not there" ' +
      'apart from "there, but not usable from here". A formula on the main Data Mart cannot ' +
      'reference one: a formula may read another formula of its OWN Data Mart, but not one of a ' +
      'joined Data Mart, because this payload carries no formula to substitute and the joined ' +
      'source would not be access-checked. It cannot be selected as an ordinary report column ' +
      'either — the blended path projects a real source column for each.',
  })
  isCalculated: boolean;

  @ApiProperty({
    enum: AGGREGATE_FUNCTIONS,
    description:
      "Dedup (pre-join) aggregate function that collapses this source's rows to one value per join key before the join runs.",
  })
  aggregateFunction: AggregateFunction;

  @ApiPropertyOptional({
    enum: REPORT_AGGREGATE_FUNCTIONS,
    isArray: true,
    description:
      "Aggregations the report level may apply to this field after the join. An explicit empty array means none are allowed; absent falls back to the effective type's default aggregations.",
  })
  postJoinAggregations?: ReportAggregateFunction[];

  @ApiProperty({
    description: "Number of join hops between the main Data Mart and this field's source.",
  })
  transitiveDepth: number;

  @ApiProperty({
    description:
      "SQL-safe dotted path of relationship aliases identifying this field's source in the join tree (e.g. `orders.items`). Each segment matches ^[a-z0-9_]+$.",
  })
  aliasPath: string;

  @ApiProperty({
    description:
      "Human display prefix for this field's source, shown in the reporting column picker. Free-form text — must never be used to build a SQL identifier.",
  })
  outputPrefix: string;
}

export class AvailableSourceDto {
  @ApiProperty({
    description:
      'SQL-safe dotted path of relationship aliases identifying this source in the join tree. Uniquely identifies the source among availableSources.',
  })
  aliasPath: string;

  @ApiProperty({ description: 'Title of the joined Data Mart.' })
  title: string;

  @ApiPropertyOptional({ description: 'Description of the joined Data Mart, if set.' })
  description?: string;

  @ApiPropertyOptional({
    description:
      "Effective analyst-written business description of THIS join node: the per-join override when set, otherwise the relationship-level description. Distinct from `description`, which is the joined Data Mart's own description.",
  })
  joinDescription?: string;

  @ApiProperty({
    description:
      'Human display prefix for this source, shown in the reporting column picker. Free-form text, configurable per relationship — must never be used to build a SQL identifier or output column name.',
  })
  defaultAlias: string;

  @ApiProperty({ description: 'Number of join hops between the main Data Mart and this source.' })
  depth: number;

  @ApiProperty({
    description:
      'Number of fields this source contributes to blendedFields. Depending on the request options, this may include disconnected fields.',
  })
  fieldCount: number;

  @ApiProperty({
    description:
      'Whether this source is included in reporting. An excluded source still appears here so a client can render and clear an existing selection.',
  })
  isIncluded: boolean;

  @ApiProperty({ description: 'ID of the Data Mart relationship that exposes this source.' })
  relationshipId: string;

  @ApiProperty({ description: 'ID of the joined Data Mart.' })
  dataMartId: string;

  @ApiProperty({
    description:
      'Whether the current user may read this Data Mart for reporting. Distinct from isIncluded: a source can be included but inaccessible to this user, or accessible but excluded.',
  })
  isAccessibleForReporting: boolean;

  @ApiProperty({
    enum: JOINED_UNIQUE_COUNT_AVAILABILITY_VALUES,
    description:
      "Whether this joined Data Mart can offer a Unique Count metric. `available` means its primary key is usable to count distinct rows; the other values diagnose why it cannot, so a client can show the right explanation instead of hiding the option: `no-primary-key` — no Primary Key is set on the Data Mart; `disconnected-primary-key` — a Primary Key is declared but disconnected, so it cannot key the join; `nested-primary-key` — the Primary Key is a nested field, which Unique Count doesn't support; `nested-and-disconnected-primary-key` — both at once, so fixing only one of them still leaves the metric unavailable.",
  })
  uniqueCountAvailability: JoinedUniqueCountAvailability;

  @ApiProperty({
    type: [String],
    description:
      "The primary-key columns this source's Unique Count counts by — every component of the key, in schema order, so a client can name them in an explanation of the metric. Exactly the columns the query counts by, including one hidden from reporting (hidden means off the reporting menu, not absent from the source). Empty whenever `uniqueCountAvailability` is not `available`: there is then no key the metric could use.",
  })
  uniqueCountKeyFields: string[];

  @ApiProperty({
    enum: MAIN_GRAIN_MULTIPLICATION_VALUES,
    description:
      "Whether this source's rows are multiplied when attached to the main Data Mart — the join " +
      'key is not proven unique on its parent, so one joined value can land on several main rows. ' +
      'A fact about ROWS: what each aggregate makes of it differs per aggregate. `none` — every hop ' +
      "from the main Data Mart down to this source is keyed by its parent's primary key, so nothing " +
      'is multiplied. `multiplies` — at least one hop is keyed by something that does not cover its ' +
      "parent's primary key. `unknown` — some parent on the chain declares no primary key, so " +
      'uniqueness is undecidable in either direction. A client that does not know this property ' +
      'must read its absence as `unknown`, never as `none`: the fallback has to be the one that ' +
      'still warns.',
  })
  mainGrainMultiplication: MainGrainMultiplication;

  @ApiProperty({
    type: [String],
    description:
      "The join-key columns of the hop that multiplies, named on that hop's parent, so a message " +
      'can tell an analyst which key is at fault. Empty whenever mainGrainMultiplication is not ' +
      '`multiplies`.',
  })
  mainGrainKeyFields: string[];

  @ApiPropertyOptional({
    description:
      'The aliasPath of the Data Mart that declares no primary key, so a message can name the one ' +
      'that needs it. An empty string means the main Data Mart itself. Present only when ' +
      'mainGrainMultiplication is `unknown`.',
  })
  mainGrainUnprovenAt?: string;

  @ApiPropertyOptional({
    description:
      'The aliasPath of the hop that multiplies, which is NOT always this source: a verdict is ' +
      "inherited down the chain together with the failing hop's key, so mainGrainKeyFields can " +
      'belong to an ancestor. A message that names this source as the one joined on that key ' +
      'sends an analyst to edit the wrong relationship. Present only when ' +
      'mainGrainMultiplication is `multiplies`.',
  })
  mainGrainMultipliedAt?: string;

  @ApiProperty({
    enum: MAIN_GRAIN_COLLAPSE_VALUES,
    description:
      'The other side of the same joins: whether several rows of a joined Data Mart can share one ' +
      'join-key value and so collapse into a single match. A joined Data Mart is attached to the ' +
      'main one collapsed to one row per key, so an aggregate read off that collapsed row — a ' +
      'non-DISTINCT `COUNT` — counts main rows, and comes out lower than the joined rows. `none` — ' +
      "every hop from the main Data Mart down to this source is keyed by its target's primary key. " +
      '`collapses` — at least one is not, or its target declares no primary key. A client that does ' +
      'not know this property must read its absence as `collapses`.',
  })
  mainGrainCollapse: MainGrainCollapse;

  @ApiPropertyOptional({
    description:
      'The aliasPath of the hop whose target rows collapse — the one closest to the main Data ' +
      'Mart, which is not always this source. Present only when mainGrainCollapse is `collapses`.',
  })
  mainGrainCollapsedAt?: string;
}

export class CalculatedFieldIssueDto {
  @ApiProperty({ description: 'Name of the calculated field with a broken formula reference.' })
  field: string;

  @ApiProperty({
    type: [String],
    description:
      "Names this field's formula references that no longer resolve against the Data Mart's " +
      'schema — the same names `CALCULATED_FIELD_BROKEN_REFERENCES` reports at query ' +
      'composition time. Never empty when this entry is present.',
  })
  missing: string[];
}

export class BlendableSchemaDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description:
      "The main Data Mart's own fields (native, unblended), filtered to reporting-visible ones. Shape follows the storage-specific Data Mart schema field contract (see `DataMartSchema` in data-storage-types/data-mart-schema.type.ts) — a recursive per-storage-type field tree, not modeled field-by-field here.",
  })
  nativeFields: DataMartSchema['fields'];

  @ApiPropertyOptional({ description: 'Description of the main Data Mart, if set.' })
  nativeDescription?: string;

  @ApiProperty({
    type: [BlendedFieldDto],
    description: 'Fields pulled in from joined Data Marts reachable via relationships.',
  })
  blendedFields: BlendedFieldDto[];

  @ApiProperty({
    type: [AvailableSourceDto],
    description:
      'Joined Data Marts reachable via relationships, each describing its inclusion, access, and Unique-Count status.',
  })
  availableSources: AvailableSourceDto[];

  @ApiProperty({
    type: [String],
    description:
      "The main Data Mart's primary-key columns its Unique Count counts by, in schema order; empty when the metric is unavailable. Cannot be derived from `nativeFields`: a key column hidden for reporting is absent from that list but still counted, since counting does not project it.",
  })
  mainUniqueCountKeyFields: string[];

  @ApiProperty({
    type: [CalculatedFieldIssueDto],
    description:
      'Every calculated field of the main Data Mart whose formula references a field the schema ' +
      'no longer has — resolved against the RAW schema (like `mainUniqueCountKeyFields` ' +
      'above), never `nativeFields`: a formula may legally reference a field hidden for reporting, ' +
      'and that list has already had those stripped. A field with no issue is simply absent here.',
  })
  calculatedFieldIssues: CalculatedFieldIssueDto[];

  @ApiProperty({
    type: [String],
    description:
      'Column names someone hid from reporting, in the form a report stores them: own columns as ' +
      'dotted paths (`metrics.cost`, a hidden RECORD bringing its subtree), joined columns by ' +
      'their unified blended name — the same form as `blendedFields[].name`, hash suffix and all. ' +
      'Covers both joined switches: a field hidden on the joined Data Mart (absent from ' +
      '`blendedFields` entirely) and one hidden per join (present there with `isHidden: true`). ' +
      'The list exists so a report that still selects such a column can be told it was HIDDEN ' +
      'rather than lost, which is a different fact with a different fix. A column that is also ' +
      'disconnected is left out: it really is gone.',
  })
  hiddenFieldNames: string[];
}
