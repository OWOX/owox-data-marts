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

describe('orders lineItems discount fields', () => {
  it('requests the exact lineItems sub-selection including discount sets and allocations', () => {
    // Full-string match pins nesting; toContain would pass on wrong structure.
    expect(proto._buildQueryFields.call(proto, schema, ['lineItems'])).toBe(
      'lineItems(first: 250) { nodes { id name title sku vendor quantity ' +
        'originalUnitPriceSet { shopMoney { amount } } ' +
        'discountedUnitPriceSet { shopMoney { amount } } ' +
        'discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount } } ' +
        'totalDiscountSet { shopMoney { amount } } ' +
        'discountAllocations { allocatedAmountSet { shopMoney { amount } } discountApplication { index } } } }'
    );
  });

  it('requests the discount application index in the discountApplications sub-selection', () => {
    expect(proto._buildQueryFields.call(proto, schema, ['discountApplications'])).toContain(
      'nodes { index allocationMethod'
    );
  });

  it('serializes line items with discount fields and nested allocations to JSON', () => {
    const lineItem = {
      id: 'gid://shopify/LineItem/111',
      quantity: 2,
      originalUnitPriceSet: { shopMoney: { amount: '25.0' } },
      discountedUnitPriceSet: { shopMoney: { amount: '22.5' } },
      discountedUnitPriceAfterAllDiscountsSet: { shopMoney: { amount: '20.25' } },
      totalDiscountSet: { shopMoney: { amount: '5.0' } },
      discountAllocations: [
        { allocatedAmountSet: { shopMoney: { amount: '5.0' } }, discountApplication: { index: 0 } },
        { allocatedAmountSet: { shopMoney: { amount: '4.5' } }, discountApplication: { index: 1 } },
      ],
    };
    const node = { lineItems: { nodes: [lineItem] } };

    const result = proto._normalizeFromSchema.call(proto, { node, schema, fields: ['lineItems'] });
    const parsed = JSON.parse(result.lineItems);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].discountedUnitPriceAfterAllDiscountsSet.shopMoney.amount).toBe('20.25');
    expect(parsed[0].totalDiscountSet.shopMoney.amount).toBe('5.0');
    expect(parsed[0].discountAllocations).toHaveLength(2);
    expect(parsed[0].discountAllocations[1].allocatedAmountSet.shopMoney.amount).toBe('4.5');
    expect(parsed[0].discountAllocations[1].discountApplication.index).toBe(1);
  });

  it('keeps discountAllocations as an empty array when the line has no discounts', () => {
    const node = {
      lineItems: { nodes: [{ id: 'gid://shopify/LineItem/222', discountAllocations: [] }] },
    };
    const result = proto._normalizeFromSchema.call(proto, { node, schema, fields: ['lineItems'] });
    expect(JSON.parse(result.lineItems)[0].discountAllocations).toEqual([]);
  });
});

describe('orders order-level scalar and MoneyBag additions', () => {
  it('requests bare scalars and shopMoney sub-selections', () => {
    const queryFields = proto._buildQueryFields.call(proto, schema, [
      'number',
      'currentTotalPrice',
      'paymentGatewayNames',
    ]);
    expect(queryFields).toBe(
      'number currentTotalPriceSet { shopMoney { amount } } paymentGatewayNames'
    );
  });

  it('normalizes the new fields from an order node', () => {
    const node = {
      number: 1042,
      test: false,
      unpaid: true,
      paymentGatewayNames: ['shopify_payments', 'manual'],
      currentTotalPriceSet: { shopMoney: { amount: '99.00' } },
    };
    expect(
      proto._normalizeFromSchema.call(proto, {
        node,
        schema,
        fields: ['number', 'test', 'unpaid', 'paymentGatewayNames', 'currentTotalPrice'],
      })
    ).toEqual({
      number: 1042,
      test: false,
      unpaid: true,
      paymentGatewayNames: 'shopify_payments, manual',
      currentTotalPrice: '99.00',
    });
  });
});
