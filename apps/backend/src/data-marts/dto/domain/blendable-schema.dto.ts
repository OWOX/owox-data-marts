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

  @ApiProperty({
    description:
      'Human display prefix for this source, shown in the reporting column picker. Free-form text, configurable per relationship — must never be used to build a SQL identifier or output column name.',
  })
  defaultAlias: string;

  @ApiProperty({ description: 'Number of join hops between the main Data Mart and this source.' })
  depth: number;

  @ApiProperty({
    description: 'Number of reportable fields this source contributes to blendedFields.',
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
}
