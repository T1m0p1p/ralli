'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEntryAliasMap,
  buildSplitMaps,
  classifyEntryCategory,
  recordEntryId,
  selectDashboardFocusIds,
  sortDriversByStartOrder
} = require('../core.js');

test('WRC2 variandid normaliseeruvad üheks kategooriaks', () => {
  assert.equal(classifyEntryCategory({ group: { name: 'Rally2' } }), 'WRC2');
  assert.equal(classifyEntryCategory({ eventClasses: [{ name: 'WRC2 Challenger' }] }), 'WRC2');
  assert.equal(classifyEntryCategory({ eventClasses: [{ code: 'RC2' }] }), 'WRC2');
});

test('WRC ja WRC3 ei lähe WRC2 variandiga segamini', () => {
  assert.equal(classifyEntryCategory({ group: { name: 'Rally1' } }), 'WRC');
  assert.equal(classifyEntryCategory({ eventClasses: [{ name: 'WRC3' }] }), 'WRC3');
});

test('split seotakse sama osalejaga ka driverId või competitorId kaudu', () => {
  const rawEntries = [{
    entryId: 201,
    competitorId: 'cmp-7',
    driver: { driverId: 'driver-42' }
  }];
  const aliases = buildEntryAliasMap(rawEntries);

  assert.equal(recordEntryId({ driverId: 'driver-42' }, aliases), '201');
  assert.equal(recordEntryId({ competitor: { id: 'cmp-7' } }, aliases), '201');

  const splits = buildSplitMaps([
    { driverId: 'driver-42', splitPointId: 1, elapsedDurationMs: '65432' },
    { competitorId: 'cmp-7', splitPoint: { id: 2 }, elapsedTimeMs: 123456 }
  ], aliases);

  assert.equal(splits.get('201').get('1'), 65432);
  assert.equal(splits.get('201').get('2'), 123456);
});

test('WRC2 fookusfilter ei tee plokki tühjaks, kui eelmise üldseisu klass puudub', () => {
  const entries = new Map([
    ['1', { id: '1', category: 'WRC', isEstonian: false }],
    ['2', { id: '2', category: 'WRC2', isEstonian: false }]
  ]);
  const aliases = new Map([['1', '1'], ['2', '2']]);

  assert.equal(selectDashboardFocusIds([{ entryId: 1, totalTimeMs: 1000 }], entries, 'WRC2', aliases), null);
});

test('TOP10 + EE säilitab Eesti sõitja ka väljaspool TOP10', () => {
  const entries = new Map();
  const rows = [];
  const aliases = new Map();
  for (let index = 1; index <= 12; index += 1) {
    const id = String(index);
    entries.set(id, { id, category: 'WRC2', isEstonian: index === 12 });
    aliases.set(id, id);
    rows.push({ entryId: id, totalTimeMs: index * 1000 });
  }

  const ids = selectDashboardFocusIds(rows, entries, 'WRC2', aliases);
  assert.equal(ids.size, 11);
  assert.equal(ids.has('12'), true);
});

test('splititabeli sõitjad järjestatakse katse stardiaja järgi', () => {
  const drivers = [
    { id: '3', number: '3', order: 1, startDateTime: '2026-08-02T09:06:00Z' },
    { id: '1', number: '1', order: 30, startDateTime: '2026-08-02T09:00:00Z' },
    { id: '4', number: '4', order: 2 },
    { id: '2', number: '2', order: 20, startDateTime: '2026-08-02T09:03:00Z' }
  ];

  assert.deepEqual(sortDriversByStartOrder(drivers).map(driver => driver.id), ['1', '2', '3', '4']);
  assert.deepEqual(drivers.map(driver => driver.id), ['3', '1', '4', '2']);
});

test('puuduva stardiaja korral kasutatakse varuna nimekirja järjekorda ja autonumbrit', () => {
  const drivers = [
    { id: '12', number: '12', order: 5 },
    { id: '7', number: '7', order: 5 },
    { id: '2', number: '2', order: 2 }
  ];

  assert.deepEqual(sortDriversByStartOrder(drivers).map(driver => driver.id), ['2', '7', '12']);
});
