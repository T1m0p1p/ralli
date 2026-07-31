const API_ROOT = 'https://p-p.redbull.com/rb-wrccom-lintegration-yv-prod/api';

const DEFAULT_CONFIG = {
  eventId: '644',
  rallyId: '712',
  itineraryId: '1461',
  eventName: 'Secto Rally Finland 2026'
};

const params = new URLSearchParams(location.search);
const config = {
  eventId: params.get('event') || DEFAULT_CONFIG.eventId,
  rallyId: params.get('rally') || DEFAULT_CONFIG.rallyId,
  itineraryId: params.get('itinerary') || DEFAULT_CONFIG.itineraryId,
  eventName: params.get('name') || DEFAULT_CONFIG.eventName
};

const APP_VERSION = 'v17';
const tabs = ['KATSE', 'SPLIT', 'ÜLDSEIS', 'SUPER SUNDAY', 'INFO'];
const categoryOrder = ['KÕIK', 'WRC', 'WRC2', 'WRC3'];
let tab = 'SPLIT';
let stages = [];
let sundayStageIds = [];
let sundayResults = [];
let stageIndex = 0;
let entries = new Map();
let referenceId = null;
let category = localStorage.getItem('ralli-category') || 'KÕIK';
let loading = false;
let telemetry = new Map();
let telemetryLoading = false;
const TELEMETRY_URL = 'https://webappsdata.wrc.com/srv/wrc/json/api/liveservice/getData?timeout=5000';

const $ = selector => document.querySelector(selector);

function formatTimeMs(ms) {
  if (!Number.isFinite(ms)) return '—';
  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

function formatDeltaMs(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (Math.abs(ms) < 50) return '0.0';
  return `${ms > 0 ? '+' : '−'}${Math.abs(ms / 1000).toFixed(1)}`;
}

function deltaClass(ms) {
  if (!Number.isFinite(ms) || Math.abs(ms) < 50) return 'neutral';
  return ms < 0 ? 'gain' : 'loss';
}

async function getJSON(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

function api(path) {
  return `${API_ROOT}/events/${config.eventId}${path}`;
}

function driverName(entry) {
  const driver = entry?.driver || {};
  if (driver.lastName) {
    return driver.lastName.charAt(0).toUpperCase() + driver.lastName.slice(1).toLowerCase();
  }
  return driver.abbvName || driver.fullName || `#${entry?.identifier || entry?.entryId}`;
}

function categoryName(entry) {
  const group = entry?.group?.name || '';
  const eventClass = entry?.eventClasses?.[0]?.name || '';
  if (/rally\s*1/i.test(group) || /^RC1$/i.test(eventClass)) return 'WRC';
  if (/rally\s*2/i.test(group) || /^RC2$/i.test(eventClass)) return 'WRC2';
  if (/rally\s*3/i.test(group) || /^RC3$/i.test(eventClass)) return 'WRC3';
  if (eventClass) return eventClass.toUpperCase();
  return group.toUpperCase() || 'MUU';
}


function normalizeApiDateTime(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  // WRC API UTC timestamps often omit the trailing Z. Values that already
  // contain an explicit timezone offset are left unchanged.
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
}

function parseApiDateTime(value) {
  const normalized = normalizeApiDateTime(value);
  if (!normalized) return NaN;
  return new Date(normalized).getTime();
}

function stageStartTime(stage) {
  const start = (stage.controls || []).find(control => control.type === 'StageStart');
  return start?.firstCarDueDateTimeLocal || (start?.firstCarDueDateTime ? `${start.firstCarDueDateTime}Z` : null) || null;
}


function formatStageStart(stage) {
  const raw = stageStartTime(stage);
  if (!raw) return 'Algusaeg puudub';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Algusaeg puudub';

  const parts = new Intl.DateTimeFormat('et-EE', {
    timeZone: 'Europe/Tallinn',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  }).formatToParts(date);
  const value = type => parts.find(part => part.type === type)?.value || '';
  const zone = value('timeZoneName').replace('GMT+2', 'EET').replace('GMT+3', 'EEST') || 'Eesti aeg';
  return `${value('hour')}:${value('minute')} ${zone}`;
}

function formatCountdown(milliseconds) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000));
  if (totalMinutes < 1) return 'Algab kohe';
  if (totalMinutes < 60) return `Algab ${totalMinutes} min pärast`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!minutes) return `Algab ${hours} h pärast`;
  return `Algab ${hours} h ${minutes} min pärast`;
}

function stageTimingText(stage) {
  const raw = stageStartTime(stage);
  const start = raw ? new Date(raw) : null;
  const now = Date.now();
  const status = String(stage.status || '');
  const running = /running|inprogress/i.test(status);
  const completed = /completed|finished/i.test(status);
  const time = formatStageStart(stage);

  if (running) return `${time} · <strong class="status-live">LIVE</strong>`;
  if (completed) return `${time} · LÕPPENUD`;
  if (start && !Number.isNaN(start.getTime()) && start.getTime() > now) {
    return `${time} · ${formatCountdown(start.getTime() - now)}`;
  }
  return time;
}

function pickInitialStageIndex() {
  const running = stages.findIndex(stage => /running|inprogress/i.test(stage.status));
  if (running >= 0) return running;

  const now = Date.now();
  const next = stages.findIndex(stage => {
    const start = stageStartTime(stage);
    return start && new Date(start).getTime() >= now - 15 * 60 * 1000;
  });
  if (next >= 0) return Math.max(0, next - 1);

  const completed = stages
    .map((stage, index) => ({ stage, index }))
    .filter(item => /completed/i.test(item.stage.status))
    .at(-1);
  return completed?.index ?? 0;
}

function availableCategories() {
  const found = new Set([...entries.values()].map(entry => entry.category).filter(Boolean));
  const fixed = [...categoryOrder];
  const extras = [...found].filter(item => !fixed.includes(item) && item !== 'MUU').sort();
  return fixed.concat(extras);
}

function filteredDrivers(drivers) {
  return category === 'KÕIK' ? drivers : drivers.filter(driver => driver.category === category);
}

function normalizeCarNumber(value) {
  // WRC entries may use values such as '#33', while telemetry uses '033'.
  // Keep digits only and remove leading zeroes so both resolve to '33'.
  const digits = String(value ?? '').replace(/\D+/g, '');
  const normalized = digits.replace(/^0+/, '');
  return normalized || '0';
}

function telemetryFor(driver) {
  return telemetry.get(normalizeCarNumber(driver.number)) || null;
}

function driverHasStarted(driver) {
  if (Number.isFinite(driver.stageTimeMs)) return true;
  if (driver.splits?.some(Number.isFinite)) return true;
  if (!driver.startDateTime) return false;
  const startMs = parseApiDateTime(driver.startDateTime);
  return Number.isFinite(startMs) && Date.now() >= startMs;
}

function driverTrackState(driver) {
  if (Number.isFinite(driver.stageTimeMs)) return 'finished';
  if (!driverHasStarted(driver)) return 'not-started';

  const live = telemetryFor(driver);
  if (/^(competing|ok)$/i.test(String(live?.status || '').trim())) {
    return Number(live?.speed) > 0 ? 'moving' : 'stopped';
  }
  return 'not-started';
}

function displayTelemetryStatus(driver, live) {
  if (Number.isFinite(driver.stageTimeMs)) return 'Finished';
  if (!driverHasStarted(driver)) return 'Not started';
  return live?.status || 'Started';
}

async function loadTelemetry() {
  if (telemetryLoading) return;
  telemetryLoading = true;
  try {
    const data = await getJSON(TELEMETRY_URL);
    const rows = Array.isArray(data?._entries) ? data._entries : [];
    telemetry = new Map(rows.map(row => [normalizeCarNumber(row.name), row]));
  } catch (error) {
    console.warn('Telemeetria laadimine ebaõnnestus:', error);
  } finally {
    telemetryLoading = false;
  }
}

async function loadBaseData() {
  const [stageList, entryList, itinerary] = await Promise.all([
    getJSON(api('/stages.json')),
    getJSON(api(`/rallies/${config.rallyId}/entries.json`)),
    getJSON(api(`/itineraries/${config.itineraryId}.json`))
  ]);

  entries = new Map((Array.isArray(entryList) ? entryList : []).map(entry => [
    String(entry.entryId),
    {
      id: String(entry.entryId),
      name: driverName(entry),
      order: entry.entryListOrder ?? 999,
      number: entry.identifier || '',
      priority: entry.priority || '',
      category: categoryName(entry)
    }
  ]));

  stages = (Array.isArray(stageList) ? stageList : [])
    .filter(stage => stage.stageId && stage.code)
    .sort((a, b) => (a.number || 0) - (b.number || 0))
    .map(stage => ({
      ...stage,
      id: String(stage.stageId),
      title: `${stage.code} ${stage.name}`,
      splitPoints: [...(stage.splitPoints || [])].sort((a, b) => (a.number || 0) - (b.number || 0)),
      drivers: []
    }));

  const legs = itinerary?.itineraryLegs || [];
  const finalLeg = [...legs].sort((a, b) => (a.order || 0) - (b.order || 0)).at(-1);
  sundayStageIds = (finalLeg?.itinerarySections || [])
    .flatMap(section => section.stages || [])
    .map(stage => String(stage.stageId));

  if (!stages.length) throw new Error('Katseid ei leitud.');
  stageIndex = pickInitialStageIndex();
  referenceId = null;
  renderCategorySelect();
}

async function loadCurrentStage() {
  const stage = stages[stageIndex];
  if (!stage) return;

  const base = api(`/stages/${stage.id}`);
  const query = `?rallyId=${encodeURIComponent(config.rallyId)}`;
  const startControl = (stage.controls || []).find(control => control.type === 'StageStart');
  const controlTimesUrl = startControl?.controlId
    ? api(`/controls/${startControl.controlId}/controlTimes.json`)
    : null;

  const [stageTimesResult, splitTimesResult, resultsResult, controlTimesResult] = await Promise.allSettled([
    getJSON(`${base}/stagetimes.json${query}`),
    getJSON(`${base}/splittimes.json${query}`),
    getJSON(`${base}/results.json${query}`),
    controlTimesUrl ? getJSON(controlTimesUrl) : Promise.resolve([])
  ]);

  const stageTimes = stageTimesResult.status === 'fulfilled' && Array.isArray(stageTimesResult.value)
    ? stageTimesResult.value : [];
  const splitTimes = splitTimesResult.status === 'fulfilled' && Array.isArray(splitTimesResult.value)
    ? splitTimesResult.value : [];
  const results = resultsResult.status === 'fulfilled' && Array.isArray(resultsResult.value)
    ? resultsResult.value : [];
  const controlTimes = controlTimesResult.status === 'fulfilled' && Array.isArray(controlTimesResult.value)
    ? controlTimesResult.value : [];

  const startByEntry = new Map(controlTimes.map(row => {
    const localValue = row.actualDateTimeLocal || row.dueDateTimeLocal || null;
    const utcValue = row.actualDateTime || row.dueDateTime || null;
    return [String(row.entryId), localValue || normalizeApiDateTime(utcValue)];
  }));
  const stageByEntry = new Map(stageTimes.map(row => [String(row.entryId), row.elapsedDurationMs]));
  const overallByEntry = new Map(results.map(row => [String(row.entryId), row.totalTimeMs]));
  const resultPosition = new Map(results.map(row => [String(row.entryId), row.position]));

  const splitMaps = new Map();
  for (const row of splitTimes) {
    const entryId = String(row.entryId);
    if (!splitMaps.has(entryId)) splitMaps.set(entryId, new Map());
    splitMaps.get(entryId).set(String(row.splitPointId), row.elapsedDurationMs);
  }

  const ids = new Set([...entries.keys(), ...stageByEntry.keys(), ...overallByEntry.keys(), ...splitMaps.keys(), ...startByEntry.keys()]);
  stage.drivers = [...ids].map(id => {
    const entry = entries.get(id) || { id, name: `#${id}`, order: 999, category: 'MUU' };
    return {
      ...entry,
      stageTimeMs: stageByEntry.get(id),
      overallTimeMs: overallByEntry.get(id),
      overallPosition: resultPosition.get(id),
      startDateTime: startByEntry.get(id),
      splits: stage.splitPoints.map(point => splitMaps.get(id)?.get(String(point.splitPointId)))
    };
  }).sort((a, b) => {
    const aTime = Number.isFinite(a.stageTimeMs) ? a.stageTimeMs : Infinity;
    const bTime = Number.isFinite(b.stageTimeMs) ? b.stageTimeMs : Infinity;
    return aTime - bTime || a.order - b.order;
  });

  const visible = filteredDrivers(stage.drivers);
  if (!referenceId || !visible.some(driver => driver.id === referenceId)) {
    referenceId = visible[0]?.id || null;
  }
}

async function loadSundayResults() {
  if (!sundayStageIds.length) {
    sundayResults = [];
    return;
  }

  const query = `?rallyId=${encodeURIComponent(config.rallyId)}`;
  const responses = await Promise.allSettled(sundayStageIds.map(stageId =>
    getJSON(api(`/stages/${stageId}/stagetimes.json${query}`))
  ));

  const totals = new Map();
  for (const response of responses) {
    if (response.status !== 'fulfilled' || !Array.isArray(response.value)) continue;
    for (const row of response.value) {
      if (!Number.isFinite(row.elapsedDurationMs)) continue;
      const id = String(row.entryId);
      const current = totals.get(id) || { totalTimeMs: 0, completedStages: 0 };
      current.totalTimeMs += row.elapsedDurationMs;
      current.completedStages += 1;
      totals.set(id, current);
    }
  }

  sundayResults = [...totals.entries()].map(([id, result]) => ({
    ...(entries.get(id) || { id, name: `#${id}`, order: 999, category: 'MUU' }),
    ...result
  })).sort((a, b) => b.completedStages - a.completedStages || a.totalTimeMs - b.totalTimeMs || a.order - b.order);
}

function setStatus(text, className = '') {
  $('#updated').textContent = text;
  $('#updated').className = className;
}

async function refresh(reloadBase = false) {
  if (loading) return;
  loading = true;
  setStatus('Laen…', 'loading');
  try {
    if (reloadBase || !stages.length) await loadBaseData();
    await Promise.all([loadCurrentStage(), loadSundayResults(), loadTelemetry()]);
    setStatus(`LIVE · ${new Date().toLocaleTimeString('et-EE', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })}`, 'live');
  } catch (error) {
    console.error(error);
    setStatus(`VIGA · ${error.message}`, 'error');
  } finally {
    loading = false;
    render();
  }
}

function renderCategorySelect() {
  const select = $('#category');
  const categories = availableCategories();
  if (!categories.includes(category)) category = 'KÕIK';
  select.innerHTML = categories.map(item => `<option value="${item}" ${item === category ? 'selected' : ''}>${item}</option>`).join('');
}

function renderTabs() {
  $('#tabs').innerHTML = tabs.map(name =>
    `<button class="${name === tab ? 'active' : ''}" data-tab="${name}">${name}</button>`
  ).join('');
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.onclick = () => {
      tab = button.dataset.tab;
      render();
    };
  });
}

function renderStageView(stage) {
  const drivers = filteredDrivers(stage.drivers)
    .filter(driver => Number.isFinite(driver.stageTimeMs))
    .sort((a, b) => a.stageTimeMs - b.stageTimeMs);
  const leader = drivers[0]?.stageTimeMs;
  $('#content').innerHTML = `
    <section class="list-view">
      ${/running|inprogress/i.test(stage.status) ? '<div class="live-label">LIVE</div>' : ''}
      ${drivers.length ? drivers.map((driver, index) => `
        <button class="result-row" data-driver="${driver.id}">
          <span class="pos">${index + 1}</span>
          <span class="driver">${driver.name}</span>
          <span class="time">${index === 0 ? formatTimeMs(driver.stageTimeMs) : formatDeltaMs(driver.stageTimeMs - leader)}</span>
        </button>`).join('') : '<p class="empty">Selles kategoorias katseaegu veel ei ole.</p>'}
    </section>`;
}

function renderSplitView(stage) {
  const drivers = filteredDrivers(stage.drivers)
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.number ?? 999) - (b.number ?? 999));
  const reference = drivers.find(driver => driver.id === referenceId) || drivers[0];
  if (!reference) {
    $('#content').innerHTML = '<p class="empty">Selles kategoorias splitiaegu veel ei ole.</p>';
    return;
  }

  const columns = stage.splitPoints.length + 2;
  let html = `<section class="split-wrap"><div class="split-table" style="grid-template-columns:132px repeat(${columns - 1},74px)"><div></div>`;
  html += stage.splitPoints.map((point, index) => `
    <div class="split-header"><span>S${index + 1}</span><small>${Number(point.distance || 0).toFixed(2)} km</small></div>`).join('');
  html += '<div class="split-header"><span>FIN</span></div>';

  drivers.forEach((driver, index) => {
    const selected = driver.id === reference.id;
    const trackState = driverTrackState(driver);
    html += `<button class="driver-cell ${selected ? 'selected' : ''}" data-driver="${driver.id}"><span class="track-indicator track-${trackState}">${index + 1}</span><strong>${driver.name}</strong></button>`;

    driver.splits.forEach((splitMs, splitIndex) => {
      const referenceMs = reference.splits[splitIndex];
      const difference = Number.isFinite(splitMs) && Number.isFinite(referenceMs) ? splitMs - referenceMs : null;
      html += `<div class="split-cell ${selected ? 'reference' : deltaClass(difference)}">${selected ? formatTimeMs(splitMs) : formatDeltaMs(difference)}</div>`;
    });

    const finishDifference = Number.isFinite(driver.stageTimeMs) && Number.isFinite(reference.stageTimeMs)
      ? driver.stageTimeMs - reference.stageTimeMs : null;
    html += `<div class="split-cell ${selected ? 'reference' : deltaClass(finishDifference)}">${selected ? formatTimeMs(driver.stageTimeMs) : formatDeltaMs(finishDifference)}</div>`;
  });

  html += '</div><p class="hint">Puuduta sõitjat, et võrrelda temaga</p></section>';
  $('#content').innerHTML = html;
}

function renderOverallView(stage) {
  const drivers = filteredDrivers(stage.drivers)
    .filter(driver => Number.isFinite(driver.overallTimeMs))
    .sort((a, b) => a.overallTimeMs - b.overallTimeMs);
  const leader = drivers[0]?.overallTimeMs;
  $('#content').innerHTML = `
    <section class="overall-view">
      <div class="overall-head"><span></span><span>AEG</span><span>VAHE</span></div>
      ${drivers.length ? drivers.map((driver, index) => `
        <button class="overall-row" data-driver="${driver.id}">
          <span class="pos">${index + 1}</span>
          <span class="driver">${driver.name}</span>
          <span class="time">${formatTimeMs(driver.overallTimeMs)}</span>
          <span class="gap">${index ? formatDeltaMs(driver.overallTimeMs - leader) : ''}</span>
        </button>`).join('') : '<p class="empty">Selles kategoorias üldseisu veel ei ole.</p>'}
    </section>`;
}

function renderSundayView() {
  const drivers = filteredDrivers(sundayResults);
  const maxCompleted = Math.max(0, ...drivers.map(driver => driver.completedStages));
  const classified = drivers.filter(driver => driver.completedStages === maxCompleted && maxCompleted > 0)
    .sort((a, b) => a.totalTimeMs - b.totalTimeMs);
  const leader = classified[0]?.totalTimeMs;
  $('#content').innerHTML = `
    <section class="sunday-view">
      <p class="sunday-note">Viimase võistluspäeva katsete summa · ${maxCompleted}/${sundayStageIds.length} katset</p>
      <div class="sunday-head"><span></span><span>AEG</span><span>VAHE</span></div>
      ${classified.length ? classified.map((driver, index) => `
        <button class="sunday-row" data-driver="${driver.id}">
          <span class="pos">${index + 1}</span>
          <span class="driver">${driver.name}</span>
          <span class="time">${formatTimeMs(driver.totalTimeMs)}</span>
          <span class="gap">${index ? formatDeltaMs(driver.totalTimeMs - leader) : ''}</span>
        </button>`).join('') : '<p class="empty">Super Sunday arvestuse aegu veel ei ole.</p>'}
    </section>`;
}

function formatTelemetryNumber(value, options = {}) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';

  const {
    decimals = 0,
    suffix = '',
    min = null,
    max = null
  } = options;

  let output = numeric;
  if (min !== null) output = Math.max(min, output);
  if (max !== null) output = Math.min(max, output);

  return `${output.toFixed(decimals)}${suffix}`;
}

function renderInfoView(stage) {
  const drivers = filteredDrivers([...entries.values()])
    .sort((a, b) => a.order - b.order);

  $('#content').innerHTML = `
    <section class="info-wrap">
      <div class="info-table">
        <div class="info-head sticky-info">SÕITJA</div>
        <div class="info-head">KIIRUS</div>
        <div class="info-head">KM</div>
        <div class="info-head">STAATUS</div>
        <div class="info-head">KÄIK</div>
        <div class="info-head">GAAS</div>
        ${drivers.map(driver => {
          const live = telemetryFor(driver);
          const stageDriver = stage.drivers.find(item => item.id === driver.id) || driver;
          const trackState = driverTrackState(stageDriver);
          return `
            <button class="info-driver sticky-info" data-driver="${driver.id}">
              <span class="track-indicator track-${trackState}">#${driver.number}</span><strong>${driver.name}</strong>
            </button>
            <div class="info-cell">${formatTelemetryNumber(live?.speed, { decimals: 0, suffix: ' km/h', min: 0 })}</div>
            <div class="info-cell">${formatTelemetryNumber(live?.kms, { decimals: 1, suffix: ' km', min: 0 })}</div>
            <div class="info-cell status-cell">${displayTelemetryStatus(stageDriver, live)}</div>
            <div class="info-cell">${formatTelemetryNumber(live?.gear, { decimals: 0, min: 0 })}</div>
            <div class="info-cell">${formatTelemetryNumber(live?.throttle, { decimals: 0, suffix: '%', min: 0, max: 100 })}</div>`;
        }).join('')}
      </div>
    </section>`;
}

function render() {
  renderTabs();
  renderCategorySelect();
  const stage = stages[stageIndex];
  const sunday = tab === 'SUPER SUNDAY';
  $('#prev').style.visibility = sunday ? 'hidden' : 'visible';
  $('#next').style.visibility = sunday ? 'hidden' : 'visible';

  if (!stage) {
    $('#stageTitle').textContent = 'Ralli Live';
    $('#stageSub').textContent = config.eventName;
    $('#content').innerHTML = '<p class="empty">Andmeid laaditakse…</p>';
    return;
  }

  $('#stageTitle').textContent = sunday ? 'Super Sunday' : (tab === 'INFO' ? 'Live info' : stage.title);
  $('#stageSub').innerHTML = sunday ? config.eventName : (tab === 'INFO' ? stage.title : stageTimingText(stage));

  if (tab === 'KATSE') renderStageView(stage);
  else if (tab === 'SPLIT') renderSplitView(stage);
  else if (tab === 'ÜLDSEIS') renderOverallView(stage);
  else if (tab === 'SUPER SUNDAY') renderSundayView();
  else renderInfoView(stage);

  document.querySelectorAll('[data-driver]').forEach(button => {
    button.onclick = () => {
      referenceId = button.dataset.driver;
      tab = 'SPLIT';
      render();
    };
  });
}

async function changeStage(direction) {
  if (!stages.length || tab === 'SUPER SUNDAY') return;
  stageIndex = (stageIndex + direction + stages.length) % stages.length;
  referenceId = null;
  render();
  await refresh(false);
}

$('#prev').onclick = () => changeStage(-1);
$('#next').onclick = () => changeStage(1);
$('#refresh').onclick = () => refresh(false);
$('#category').onchange = event => {
  category = event.target.value;
  localStorage.setItem('ralli-category', category);
  referenceId = filteredDrivers(stages[stageIndex]?.drivers || [])[0]?.id || null;
  render();
};

render();
refresh(true);
setInterval(() => refresh(false), 10000);
setInterval(async () => {
  await loadTelemetry();
  if (tab === 'SPLIT' || tab === 'INFO') render();
}, 5000);
setInterval(() => {
  if (tab !== 'SUPER SUNDAY' && stages[stageIndex]) {
    $('#stageSub').innerHTML = stageTimingText(stages[stageIndex]);
  }
}, 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh(false);
});
