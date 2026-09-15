// packages/connectors/tests/Events.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  BaseEvent,
  LogEvent,
  DataEvent,
  TraceEvent,
  AnalyticsEvent,
  StateEvent,
  ControlEvent,
} from '../src/Core/Events/index.js';

describe('BaseEvent', () => {
  test('creates with type and ISO timestamp', () => {
    const e = new BaseEvent('CUSTOM');
    assert.equal(e.type, 'CUSTOM');
    assert.ok(typeof e.timestamp === 'string');
    // ISO 8601 format
    assert.match(e.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(!Number.isNaN(Date.parse(e.timestamp)));
  });

  test('throws when type is missing', () => {
    assert.throws(() => new BaseEvent(), /Event type is required/);
    assert.throws(() => new BaseEvent(''), /Event type is required/);
    assert.throws(() => new BaseEvent(null), /Event type is required/);
    assert.throws(() => new BaseEvent(undefined), /Event type is required/);
  });

  test('serializes to JSON', () => {
    const e = new BaseEvent('FOO');
    const json = e.toJSON();
    assert.deepEqual(json, { type: 'FOO', timestamp: e.timestamp });
  });

  test('toString returns JSON string', () => {
    const e = new BaseEvent('FOO');
    const str = e.toString();
    assert.equal(typeof str, 'string');
    const parsed = JSON.parse(str);
    assert.equal(parsed.type, 'FOO');
    assert.equal(parsed.timestamp, e.timestamp);
  });

  test('roundtrips through fromJSON (object input)', () => {
    const e = new BaseEvent('FOO');
    const restored = BaseEvent.fromJSON(e.toJSON());
    assert.equal(restored.type, e.type);
    assert.equal(restored.timestamp, e.timestamp);
  });

  test('roundtrips through fromJSON (string input)', () => {
    const e = new BaseEvent('FOO');
    const restored = BaseEvent.fromJSON(e.toString());
    assert.equal(restored.type, e.type);
    assert.equal(restored.timestamp, e.timestamp);
  });

  test('fromJSON(null) throws expected error', () => {
    assert.throws(() => BaseEvent.fromJSON(null), /Invalid event JSON: expected object, got null/);
  });

  test('fromJSON(42) throws on non-object input', () => {
    assert.throws(() => BaseEvent.fromJSON(42), /Invalid event JSON: expected object, got number/);
  });

  test("fromJSON('') throws (JSON.parse fails on empty string)", () => {
    assert.throws(() => BaseEvent.fromJSON(''));
  });
});

describe('LogEvent', () => {
  test('creates with level and message', () => {
    const e = new LogEvent('info', 'hello world');
    assert.equal(e.type, 'LOG');
    assert.equal(e.level, 'info');
    assert.equal(e.message, 'hello world');
    assert.ok(e.timestamp);
  });

  test('accepts info, warn, and error levels', () => {
    for (const level of ['info', 'warn', 'error']) {
      const e = new LogEvent(level, 'msg');
      assert.equal(e.level, level);
    }
  });

  test('rejects invalid level', () => {
    assert.throws(() => new LogEvent('debug', 'msg'), /Invalid log level: debug/);
    assert.throws(() => new LogEvent('fatal', 'msg'), /Invalid log level/);
    assert.throws(() => new LogEvent('', 'msg'), /Invalid log level/);
  });

  test('serializes to JSON with level and message', () => {
    const e = new LogEvent('warn', 'something happened');
    const json = e.toJSON();
    assert.equal(json.type, 'LOG');
    assert.equal(json.level, 'warn');
    assert.equal(json.message, 'something happened');
    assert.equal(json.timestamp, e.timestamp);
  });

  test('roundtrips through JSON', () => {
    const e = new LogEvent('error', 'boom');
    const restored = LogEvent.fromJSON(JSON.stringify(e.toJSON()));
    assert.equal(restored.type, 'LOG');
    assert.equal(restored.level, 'error');
    assert.equal(restored.message, 'boom');
    assert.equal(restored.timestamp, e.timestamp);
  });

  test('rejects non-string message', () => {
    assert.throws(() => new LogEvent('info', 123), /LogEvent message must be a string, got number/);
    assert.throws(
      () => new LogEvent('info', null),
      /LogEvent message must be a string, got object/
    );
    assert.throws(() => new LogEvent('info', { foo: 'bar' }), /LogEvent message must be a string/);
    assert.throws(
      () => new LogEvent('info', undefined),
      /LogEvent message must be a string, got undefined/
    );
  });

  test('fromJSON throws on type mismatch', () => {
    assert.throws(
      () => LogEvent.fromJSON({ type: 'CONTROL', level: 'info', message: 'x' }),
      /Invalid event type for LogEvent: expected "LOG", got "CONTROL"/
    );
  });

  test('fromJSON throws on null input', () => {
    assert.throws(() => LogEvent.fromJSON(null), /Invalid event JSON: expected object, got null/);
  });
});

describe('DataEvent', () => {
  test('creates with node and records', () => {
    const records = [{ id: 1 }, { id: 2 }];
    const e = new DataEvent('users', records);
    assert.equal(e.type, 'DATA');
    assert.equal(e.node, 'users');
    assert.deepEqual(e.records, records);
    assert.equal(e.schema, null);
  });

  test('includes optional schema', () => {
    const schema = { id: 'integer', name: 'string' };
    const e = new DataEvent('users', [], schema);
    assert.deepEqual(e.schema, schema);
    const json = e.toJSON();
    assert.deepEqual(json.schema, schema);
  });

  test('omits schema from JSON when null', () => {
    const e = new DataEvent('users', [{ id: 1 }]);
    const json = e.toJSON();
    assert.equal('schema' in json, false);
    assert.equal(json.node, 'users');
    assert.deepEqual(json.records, [{ id: 1 }]);
  });

  test('roundtrips through JSON with schema', () => {
    const schema = { id: 'integer' };
    const e = new DataEvent('orders', [{ id: 7 }], schema);
    const restored = DataEvent.fromJSON(JSON.stringify(e.toJSON()));
    assert.equal(restored.node, 'orders');
    assert.deepEqual(restored.records, [{ id: 7 }]);
    assert.deepEqual(restored.schema, schema);
    assert.equal(restored.timestamp, e.timestamp);
  });

  test('roundtrips through JSON without schema', () => {
    const e = new DataEvent('orders', [{ id: 7 }]);
    const restored = DataEvent.fromJSON(JSON.stringify(e.toJSON()));
    assert.equal(restored.node, 'orders');
    assert.deepEqual(restored.records, [{ id: 7 }]);
    // schema absent from JSON => fromJSON sees undefined => stored as null via default
    assert.equal(restored.schema, null);
  });

  test('rejects non-array records (null)', () => {
    assert.throws(
      () => new DataEvent('users', null),
      /DataEvent records must be an array, got null/
    );
  });

  test('rejects non-array records (object)', () => {
    assert.throws(
      () => new DataEvent('users', { id: 1 }),
      /DataEvent records must be an array, got object/
    );
  });

  test('fromJSON throws on type mismatch', () => {
    assert.throws(
      () => DataEvent.fromJSON({ type: 'LOG', node: 'users', records: [] }),
      /Invalid event type for DataEvent: expected "DATA", got "LOG"/
    );
  });
});

describe('TraceEvent', () => {
  test('creates with action and default details', () => {
    const e = new TraceEvent('fetch_started');
    assert.equal(e.type, 'TRACE');
    assert.equal(e.action, 'fetch_started');
    assert.deepEqual(e.details, {});
  });

  test('creates with action and details', () => {
    const details = { node: 'users', count: 100 };
    const e = new TraceEvent('fetch_completed', details);
    assert.equal(e.action, 'fetch_completed');
    assert.deepEqual(e.details, details);
  });

  test('roundtrips through JSON', () => {
    const e = new TraceEvent('step', { foo: 'bar' });
    const restored = TraceEvent.fromJSON(JSON.stringify(e.toJSON()));
    assert.equal(restored.type, 'TRACE');
    assert.equal(restored.action, 'step');
    assert.deepEqual(restored.details, { foo: 'bar' });
    assert.equal(restored.timestamp, e.timestamp);
  });

  test('fromJSON throws on type mismatch', () => {
    assert.throws(
      () => TraceEvent.fromJSON({ type: 'LOG', action: 'step' }),
      /Invalid event type for TraceEvent: expected "TRACE", got "LOG"/
    );
  });
});

describe('AnalyticsEvent', () => {
  test('creates with metric, value, and default tags', () => {
    const e = new AnalyticsEvent('records_processed', 1000);
    assert.equal(e.type, 'ANALYTICS');
    assert.equal(e.metric, 'records_processed');
    assert.equal(e.value, 1000);
    assert.deepEqual(e.tags, {});
  });

  test('creates with tags', () => {
    const tags = { source: 'facebook', node: 'ads' };
    const e = new AnalyticsEvent('api_calls', 42, tags);
    assert.deepEqual(e.tags, tags);
  });

  test('roundtrips through JSON', () => {
    const e = new AnalyticsEvent('latency_ms', 250, { region: 'us' });
    const restored = AnalyticsEvent.fromJSON(JSON.stringify(e.toJSON()));
    assert.equal(restored.type, 'ANALYTICS');
    assert.equal(restored.metric, 'latency_ms');
    assert.equal(restored.value, 250);
    assert.deepEqual(restored.tags, { region: 'us' });
    assert.equal(restored.timestamp, e.timestamp);
  });

  test('fromJSON throws on type mismatch', () => {
    assert.throws(
      () => AnalyticsEvent.fromJSON({ type: 'LOG', metric: 'm', value: 1 }),
      /Invalid event type for AnalyticsEvent: expected "ANALYTICS", got "LOG"/
    );
  });
});

describe('StateEvent', () => {
  test('creates with state object', () => {
    const state = { cursor: 'abc123', page: 5 };
    const e = new StateEvent(state);
    assert.equal(e.type, 'STATE');
    assert.deepEqual(e.state, state);
  });

  test('serializes state to JSON', () => {
    const state = { cursor: 'abc' };
    const e = new StateEvent(state);
    const json = e.toJSON();
    assert.equal(json.type, 'STATE');
    assert.deepEqual(json.state, state);
  });

  test('roundtrips through JSON', () => {
    const state = { cursor: 'xyz', meta: { page: 2 } };
    const e = new StateEvent(state);
    const restored = StateEvent.fromJSON(JSON.stringify(e.toJSON()));
    assert.equal(restored.type, 'STATE');
    assert.deepEqual(restored.state, state);
    assert.equal(restored.timestamp, e.timestamp);
  });

  test('fromJSON throws on type mismatch', () => {
    assert.throws(
      () => StateEvent.fromJSON({ type: 'LOG', state: {} }),
      /Invalid event type for StateEvent: expected "STATE", got "LOG"/
    );
  });
});

describe('ControlEvent', () => {
  test('creates with valid action', () => {
    const e = new ControlEvent('started');
    assert.equal(e.type, 'CONTROL');
    assert.equal(e.action, 'started');
    assert.equal(e.error, null);
  });

  test('supports all 5 valid actions', () => {
    for (const action of ['started', 'completed', 'failed', 'paused', 'cancelled']) {
      const e = new ControlEvent(action);
      assert.equal(e.action, action);
    }
  });

  test('rejects invalid action', () => {
    assert.throws(() => new ControlEvent('finished'), /Invalid control action: finished/);
    assert.throws(() => new ControlEvent('start'), /Invalid control action/);
    assert.throws(() => new ControlEvent(''), /Invalid control action/);
  });

  test('includes error for failed action', () => {
    const e = new ControlEvent('failed', { error: 'API timeout' });
    assert.equal(e.action, 'failed');
    assert.equal(e.error, 'API timeout');
    const json = e.toJSON();
    assert.equal(json.error, 'API timeout');
  });

  test('omits error from JSON when null', () => {
    const e = new ControlEvent('completed');
    const json = e.toJSON();
    assert.equal('error' in json, false);
    assert.equal(json.action, 'completed');
  });

  test('roundtrips through JSON for completed action (no error)', () => {
    const e = new ControlEvent('completed');
    const restored = ControlEvent.fromJSON(JSON.stringify(e.toJSON()));
    assert.equal(restored.type, 'CONTROL');
    assert.equal(restored.action, 'completed');
    assert.equal(restored.error, null);
    assert.equal(restored.timestamp, e.timestamp);
  });

  test('roundtrips through JSON for failed action (with error)', () => {
    const e = new ControlEvent('failed', { error: 'boom' });
    const restored = ControlEvent.fromJSON(JSON.stringify(e.toJSON()));
    assert.equal(restored.action, 'failed');
    assert.equal(restored.error, 'boom');
    assert.equal(restored.timestamp, e.timestamp);
  });

  test('constructor with options=null does not throw', () => {
    let event;
    assert.doesNotThrow(() => {
      event = new ControlEvent('started', null);
    });
    assert.equal(event.action, 'started');
    assert.equal(event.error, null);
  });

  test('preserves empty-string error (uses ?? not ||)', () => {
    const e = new ControlEvent('failed', { error: '' });
    assert.equal(e.error, '');
    const json = e.toJSON();
    assert.equal('error' in json, true);
    assert.equal(json.error, '');
  });

  test('preserves zero error code (uses ?? not ||)', () => {
    const e = new ControlEvent('failed', { error: 0 });
    assert.equal(e.error, 0);
    const json = e.toJSON();
    assert.equal('error' in json, true);
    assert.equal(json.error, 0);
  });

  test('fromJSON throws on type mismatch', () => {
    assert.throws(
      () => ControlEvent.fromJSON({ type: 'LOG', action: 'started' }),
      /Invalid event type for ControlEvent: expected "CONTROL", got "LOG"/
    );
  });
});
