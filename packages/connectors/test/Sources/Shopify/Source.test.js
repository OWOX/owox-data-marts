import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => path.join(__dirname, '../../../src', ...p);

// GAS-style files (`var X = ...`, no imports). Load order matters: DATA_TYPES is read
// at top level by ordersFields.js, and Source.js extends AbstractSource.
loadGasClass(src('Constants/DataTypes.js'));
loadGasClass(src('Sources/Shopify/ShopifyAPIReference/ordersFields.js'));
loadGasClass(src('Core/AbstractSource.js'));
loadGasClass(src('Sources/Shopify/Source.js'));

const proto = globalThis.ShopifySource.prototype;
const schema = { fields: globalThis.ordersFields };

describe('orders checkoutToken', () => {
  it('requests checkoutToken as a bare scalar', () => {
    expect(proto._buildQueryFields.call(proto, schema, ['id', 'checkoutToken'])).toBe(
      'id checkoutToken'
    );
  });

  it('maps checkoutToken from the order node', () => {
    const node = { id: 'gid://shopify/Order/1', checkoutToken: 'a1b2c3d4' };
    expect(
      proto._normalizeFromSchema.call(proto, { node, schema, fields: ['id', 'checkoutToken'] })
    ).toEqual({ id: 'gid://shopify/Order/1', checkoutToken: 'a1b2c3d4' });
  });

  it('yields null when the order has no checkout token', () => {
    const node = { id: 'gid://shopify/Order/2', checkoutToken: null };
    expect(
      proto._normalizeFromSchema.call(proto, { node, schema, fields: ['checkoutToken'] })
    ).toEqual({ checkoutToken: null });
  });
});
