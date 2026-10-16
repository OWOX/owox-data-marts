// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isPublicAddress } from './private-address.js';

describe('isPublicAddress', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '100.127.255.254',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.8',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::a00:1',
    'fc00::1',
    'fd00::1',
    'fe80::1',
    'ff02::1',
    '2001::1',
    '2001:2::1',
    '2001:db8::1',
    '2002:a00:1::',
    '3fff::1',
    'odm.example.test',
    '',
  ])('refuses %s', address => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '100.63.255.255', '100.128.0.1', '172.32.0.1', '2606:4700:4700::1111'])(
    'accepts %s',
    address => {
      expect(isPublicAddress(address)).toBe(true);
    }
  );
});
