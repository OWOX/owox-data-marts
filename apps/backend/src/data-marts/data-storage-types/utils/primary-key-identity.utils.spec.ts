import {
  PK_TUPLE_SEPARATOR,
  renderPrimaryKeyCountRef,
  renderPrimaryKeyCountedSlotRef,
  renderPrimaryKeyIdentitySlots,
  renderPrimaryKeyTuple,
} from './primary-key-identity.utils';

describe('primary-key-identity.utils', () => {
  describe('renderPrimaryKeyCountRef', () => {
    it('leaves a single-column key as a bare ref (byte-identical to the pre-#6792 form)', () => {
      expect(renderPrimaryKeyCountRef(['`o`.`id`'], 'STRING')).toBe('`o`.`id`');
    });

    it('guards a composite key so any NULL component yields NULL', () => {
      expect(renderPrimaryKeyCountRef(['`o`.`a`', '`o`.`b`'], 'STRING')).toBe(
        'CASE WHEN `o`.`a` IS NULL OR `o`.`b` IS NULL THEN NULL ELSE ' +
          'CONCAT(' +
          "CAST(LENGTH(CAST(`o`.`a` AS STRING)) AS STRING), '␟', CAST(`o`.`a` AS STRING), " +
          "CAST(LENGTH(CAST(`o`.`b` AS STRING)) AS STRING), '␟', CAST(`o`.`b` AS STRING)) END"
      );
    });

    it('uses the dialect cast type', () => {
      expect(renderPrimaryKeyCountRef(['"a"', '"b"'], 'VARCHAR')).toContain('CAST("a" AS VARCHAR)');
    });

    it('throws on an empty key rather than emitting COUNT(DISTINCT )', () => {
      expect(() => renderPrimaryKeyCountRef([], 'STRING')).toThrow(/at least one column/);
    });
  });

  describe('renderPrimaryKeyCountedSlotRef', () => {
    it('counts a single slot directly — the engine already skips NULL there', () => {
      expect(renderPrimaryKeyCountedSlotRef(['`_uc_pk_0`'])).toBe('`_uc_pk_0`');
    });

    it('yields NULL when ANY component is NULL, so a key that identifies nothing is not counted', () => {
      expect(renderPrimaryKeyCountedSlotRef(['`_uc_pk_0`', '`_uc_pk_1`'])).toBe(
        'CASE WHEN `_uc_pk_0` IS NULL OR `_uc_pk_1` IS NULL THEN NULL ELSE 1 END'
      );
    });

    it('emits no CAST and no CONCAT — the slots keep every digit the key holds', () => {
      const sql = renderPrimaryKeyCountedSlotRef(['`_uc_pk_0`', '`_uc_pk_1`']);
      expect(sql).not.toContain('CAST');
      expect(sql).not.toContain('CONCAT');
      expect(sql).not.toContain(PK_TUPLE_SEPARATOR);
    });

    it('throws on an empty key rather than emitting COUNT()', () => {
      expect(() => renderPrimaryKeyCountedSlotRef([])).toThrow(/at least one column/);
    });
  });

  describe('renderPrimaryKeyIdentitySlots', () => {
    it('projects a single-column key as the BARE column — no CAST to lose precision (F13)', () => {
      // The old single-slot form cast the key to text so both CASE legs shared a type. On
      // Trino/Athena a TIMESTAMP or DECIMAL renders with fewer digits than it holds, so two
      // distinct rows collapsed into one DISTINCT row and the SUM under-reported.
      expect(renderPrimaryKeyIdentitySlots(['`o`.`a`'], '`o`.`__owox_rid`')).toEqual({
        surrogate: 'CASE WHEN `o`.`a` IS NULL THEN `o`.`__owox_rid` ELSE NULL END',
        keyParts: ['`o`.`a`'],
      });
    });

    it('gives a composite key one slot per column — no separator to forge (F12)', () => {
      // `('x␟y', 'z')` and `('x', 'y␟z')` concatenated to the same string, so two distinct key
      // tuples deduped as one row. Separate slots make the separator irrelevant.
      expect(renderPrimaryKeyIdentitySlots(['`a`', '`b`'], '`rid`')).toEqual({
        surrogate: 'CASE WHEN `a` IS NULL OR `b` IS NULL THEN `rid` ELSE NULL END',
        keyParts: ['`a`', '`b`'],
      });
    });

    it('emits no CAST, no CONCAT and no separator at all', () => {
      const slots = renderPrimaryKeyIdentitySlots(['`a`', '`b`'], '`rid`');
      const sql = [slots.surrogate, ...slots.keyParts].join(' ');
      expect(sql).not.toContain('CAST');
      expect(sql).not.toContain('CONCAT');
      expect(sql).not.toContain(PK_TUPLE_SEPARATOR);
      expect(sql).not.toContain('COALESCE');
    });

    it('throws on an empty key rather than emitting a tuple that identifies nothing', () => {
      expect(() => renderPrimaryKeyIdentitySlots([], '`rid`')).toThrow(/at least one column/);
    });
  });

  describe('renderPrimaryKeyTuple', () => {
    it('casts a single column without CONCAT', () => {
      expect(renderPrimaryKeyTuple(['`a`'], 'STRING')).toBe('CAST(`a` AS STRING)');
    });

    it('length-prefixes every component so no value can forge a component boundary (F12)', () => {
      expect(renderPrimaryKeyTuple(['`a`', '`b`'], 'STRING')).toBe(
        'CONCAT(' +
          "CAST(LENGTH(CAST(`a` AS STRING)) AS STRING), '␟', CAST(`a` AS STRING), " +
          "CAST(LENGTH(CAST(`b` AS STRING)) AS STRING), '␟', CAST(`b` AS STRING))"
      );
    });

    it('encodes the two tuples that used to collide differently', () => {
      // The forgeable pair: 'x␟y' + 'z' vs 'x' + 'y␟z'. Rendering is symbolic, so assert on the
      // encoding the SQL performs — `<len>␟<value>` per component — evaluated in TypeScript.
      const encode = (parts: string[]): string =>
        parts.map(p => `${p.length}${PK_TUPLE_SEPARATOR}${p}`).join('');
      expect(encode([`x${PK_TUPLE_SEPARATOR}y`, 'z'])).not.toBe(
        encode(['x', `y${PK_TUPLE_SEPARATOR}z`])
      );
    });
  });
});
