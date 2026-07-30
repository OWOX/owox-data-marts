/**
 * Arrow-head markers rendered inline (instead of React Flow's markerEnd prop)
 * so their fill follows the edge's current color — gray at rest, blue when
 * selected — exactly like owox/models.
 */
export function EdgeArrowMarkers({
  markerId,
  color,
  withStart,
}: {
  markerId: string;
  color: string;
  withStart: boolean;
}) {
  return (
    <defs>
      <marker
        id={`${markerId}-end`}
        markerWidth='9'
        markerHeight='9'
        refX='7'
        refY='3'
        orient='auto'
        markerUnits='strokeWidth'
      >
        <path d='M0,0 L7,3 L0,6 z' fill={color} />
      </marker>
      {withStart && (
        <marker
          id={`${markerId}-start`}
          markerWidth='9'
          markerHeight='9'
          refX='0'
          refY='3'
          orient='auto'
          markerUnits='strokeWidth'
        >
          <path d='M7,0 L0,3 L7,6 z' fill={color} />
        </marker>
      )}
    </defs>
  );
}
