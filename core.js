(function attachRalliLiveCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RalliLiveCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createRalliLiveCore() {
  'use strict';

  function normalizeId(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      return normalizeId(value.entryId ?? value.driverId ?? value.competitorId ?? value.crewId ?? value.id);
    }
    return String(value).trim();
  }

  function toFiniteNumber(value) {
    if (value === null || value === undefined || value === '') return undefined;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  function valueLabel(value) {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (!value || typeof value !== 'object') return '';
    return [value.name, value.shortName, value.code, value.abbreviation, value.description]
      .filter(part => typeof part === 'string' || typeof part === 'number')
      .join(' ');
  }

  function classifyEntryCategory(entry) {
    const classes = Array.isArray(entry?.eventClasses) ? entry.eventClasses : [entry?.eventClasses];
    const championships = Array.isArray(entry?.championships) ? entry.championships : [entry?.championships];
    const candidates = [
      entry?.category,
      entry?.categoryName,
      entry?.vehicleClass,
      entry?.group,
      ...classes,
      ...championships
    ].map(valueLabel).filter(Boolean);
    const combined = candidates.join(' | ').toUpperCase().replace(/[_-]+/g, ' ');

    // Alamklassid kontrollitakse enne WRC-d, et näiteks "WRC2 Challenger"
    // ei klassifitseeruks kogemata WRC-ks.
    if (/\b(?:WRC\s*3|RALLY\s*3|RC\s*3)\b/.test(combined)) return 'WRC3';
    if (/\b(?:WRC\s*2|RALLY\s*2|RC\s*2)\b/.test(combined)) return 'WRC2';
    if (/\b(?:WRC\s*1|RALLY\s*1|RC\s*1|WRC)\b/.test(combined)) return 'WRC';

    return valueLabel(classes.find(Boolean) || entry?.group || entry?.category).trim().toUpperCase() || 'MUU';
  }

  function canonicalEntryId(entry) {
    return normalizeId(entry?.entryId ?? entry?.entry?.entryId ?? entry?.id);
  }

  function entryAliasValues(entry) {
    return [
      entry?.entryId,
      entry?.id,
      entry?.competitorId,
      entry?.crewId,
      entry?.driverId,
      entry?.entry?.entryId,
      entry?.entry?.id,
      entry?.competitor?.competitorId,
      entry?.competitor?.id,
      entry?.crew?.crewId,
      entry?.crew?.id,
      entry?.driver?.driverId,
      entry?.driver?.id
    ].map(normalizeId).filter(Boolean);
  }

  function buildEntryAliasMap(entryList) {
    const aliases = new Map();
    for (const entry of Array.isArray(entryList) ? entryList : []) {
      const canonical = canonicalEntryId(entry);
      if (!canonical) continue;
      aliases.set(canonical, canonical);
      for (const alias of entryAliasValues(entry)) {
        if (!aliases.has(alias)) aliases.set(alias, canonical);
      }
    }
    return aliases;
  }

  function recordEntryId(record, aliases = new Map()) {
    const candidates = [
      record?.entryId,
      record?.entry?.entryId,
      record?.entry?.id,
      record?.competitorId,
      record?.competitor?.competitorId,
      record?.competitor?.id,
      record?.crewId,
      record?.crew?.crewId,
      record?.crew?.id,
      record?.driverId,
      record?.driver?.driverId,
      record?.driver?.id
    ].map(normalizeId).filter(Boolean);

    for (const candidate of candidates) {
      const canonical = aliases.get(candidate);
      if (canonical) return canonical;
    }
    return candidates[0] || '';
  }

  function splitPointId(record) {
    return normalizeId(
      record?.splitPointId ?? record?.splitPoint?.splitPointId ?? record?.splitPoint?.id ?? record?.splitId ?? record?.id
    );
  }

  function buildSplitMaps(rows, aliases = new Map()) {
    const splitMaps = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const entryId = recordEntryId(row, aliases);
      const pointId = splitPointId(row);
      const elapsed = toFiniteNumber(row?.elapsedDurationMs ?? row?.elapsedTimeMs ?? row?.timeMs);
      if (!entryId || !pointId || elapsed === undefined) continue;
      if (!splitMaps.has(entryId)) splitMaps.set(entryId, new Map());
      splitMaps.get(entryId).set(pointId, elapsed);
    }
    return splitMaps;
  }

  function compareDriversByStartOrder(a, b) {
    const aStart = Date.parse(a?.startDateTime || '');
    const bStart = Date.parse(b?.startDateTime || '');
    const aHasStart = Number.isFinite(aStart);
    const bHasStart = Number.isFinite(bStart);

    if (aHasStart !== bHasStart) return aHasStart ? -1 : 1;
    if (aHasStart && aStart !== bStart) return aStart - bStart;

    const aOrder = toFiniteNumber(a?.order) ?? Infinity;
    const bOrder = toFiniteNumber(b?.order) ?? Infinity;
    if (aOrder !== bOrder) return aOrder - bOrder;

    const aNumber = toFiniteNumber(String(a?.number ?? '').replace(/\D+/g, '')) ?? Infinity;
    const bNumber = toFiniteNumber(String(b?.number ?? '').replace(/\D+/g, '')) ?? Infinity;
    if (aNumber !== bNumber) return aNumber - bNumber;

    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), undefined, { numeric: true });
  }

  function sortDriversByStartOrder(drivers) {
    return (Array.isArray(drivers) ? drivers : []).slice().sort(compareDriversByStartOrder);
  }

  function selectDashboardFocusIds(rows, entriesById, category, aliases = new Map(), limit = 10) {
    const ranked = (Array.isArray(rows) ? rows : []).map(row => {
      const id = recordEntryId(row, aliases);
      const entry = entriesById.get(id);
      const totalTimeMs = toFiniteNumber(row?.totalTimeMs);
      return entry && totalTimeMs !== undefined ? { ...entry, totalTimeMs } : null;
    }).filter(Boolean);

    const inCategory = category === 'KÕIK'
      ? ranked
      : ranked.filter(driver => driver.category === category);

    // Kui valitud klassi eelmine üldseis API-st puudub, ei tohi fookusfilter
    // tervet plokki tühjaks teha. null tähendab rakenduses "näita kõiki".
    if (!inCategory.length) return null;

    const top = inCategory.slice().sort((a, b) => a.totalTimeMs - b.totalTimeMs).slice(0, limit);
    const estonians = inCategory.filter(driver => driver.isEstonian);
    return new Set([...top, ...estonians].map(driver => String(driver.id)));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return {
    buildEntryAliasMap,
    buildSplitMaps,
    canonicalEntryId,
    classifyEntryCategory,
    compareDriversByStartOrder,
    escapeHtml,
    normalizeId,
    recordEntryId,
    selectDashboardFocusIds,
    sortDriversByStartOrder,
    splitPointId,
    toFiniteNumber
  };
}));
