import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';
import { ShopifySource } from '../../../src/Sources/Shopify/Source.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => path.join(__dirname, '../../../src', ...p);

// GAS-style files (`var X = ...`, no imports). Load order matters: DATA_TYPES is read at
// top level by ordersFields.js. AbstractSource and the Source itself are ES modules on this
// branch, so they are imported above instead of being vm-evaluated here.
loadGasClass(src('Constants/DataTypes.js'));
loadGasClass(src('Sources/Shopify/ShopifyAPIReference/ordersFields.js'));

const proto = ShopifySource.prototype;
const schema = { fields: globalThis.ordersFields };

describe('orders checkoutToken and cartToken', () => {
  it('requests both tokens as bare scalars', () => {
    expect(proto._buildQueryFields.call(proto, schema, ['id', 'checkoutToken', 'cartToken'])).toBe(
      'id checkoutToken cartToken'
    );
  });

  it('maps both tokens from the order node', () => {
    const node = { id: 'gid://shopify/Order/1', checkoutToken: 'a1b2c3d4', cartToken: 'e5f6a7b8' };
    expect(
      proto._normalizeFromSchema.call(proto, {
        node,
        schema,
        fields: ['id', 'checkoutToken', 'cartToken'],
      })
    ).toEqual({ id: 'gid://shopify/Order/1', checkoutToken: 'a1b2c3d4', cartToken: 'e5f6a7b8' });
  });

  it('yields null when the node omits checkoutToken', () => {
    // Key absent (not null): exercises the undefined -> _formatValue -> null path.
    const node = { id: 'gid://shopify/Order/2' };
    expect(
      proto._normalizeFromSchema.call(proto, { node, schema, fields: ['checkoutToken'] })
    ).toEqual({ checkoutToken: null });
  });
});
