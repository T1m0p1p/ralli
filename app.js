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

const tabs = ['KATSE', 'SPLIT', 'ÜLDSEIS', 'SUPER SUNDAY'];
const categoryOrder = ['KÕIK', 'WRC', 'WRC2', 'WRC3', 'RC4'];
let tab = 'SPLIT';
let stages = [];
let sundayStageIds = [];
let sundayResults = [];
let stageIndex = 0;
let entries = new Map();
let referenceId = null;
let category = localStorage.getItem('ralli-category') || 'KÕIK';
let loading = false;

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
  if (/rally1/i.test(group) || eventClass === 'RC1') return 'WRC';
  if (/rally2/i.test(group) || eventClass === 'RC2') return 'WRC2';
  if (/rally3/i.test(group) || eventClass === 'RC3') return 'WRC3';
  if (eventClass) return eventClass.toUpperCase();
  return group.toUpperCase() || 'MUU';
}

function stageStartTime(stage) {
  const start = (stage.controls || []).find(control => control.type === 'StageStart');
  return start?.firstCarDueDateTimeLocal || start?.firstCarDueDateTime || null;
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
  const found = new Set([...entries.values()].map(entry => entry.category));
  return categoryOrder.filter(item => item === 'KÕIK' || found.has(item))
    .concat([...found].filter(item => !categoryOrder.includes(item)).sort());
}

function filteredDrivers(drivers) {
  return category === 'KÕIK' ? drivers : drivers.filter(driver => driver.category === category);
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
  const [stageTimesResult, splitTimesResult, resultsResult] = await Promise.allSettled([
    getJSON(`${base}/stagetimes.json${query}`),
    getJSON(`${base}/splittimes.json${query}`),
    getJSON(`${base}/results.json${query}`)
  ]);

  const stageTimes = stageTimesResult.status === 'fulfilled' && Array.isArray(stageTimesResult.value)
    ? stageTimesResult.value : [];
  const splitTimes = splitTimesResult.status === 'fulfilled' && Array.isArray(splitTimesResult.value)
    ? splitTimesResult.value : [];
  const results = resultsResult.status === 'fulfilled' && Array.isArray(resultsResult.value)
    ? resultsResult.value : [];

  const stageByEntry = new Map(stageTimes.map(row => [String(row.entryId), row.elapsedDurationMs]));
  const overallByEntry = new Map(results.map(row => [String(row.entryId), row.totalTimeMs]));
  const resultPosition = new Map(results.map(row => [String(row.entryId), row.position]));

  const splitMaps = new Map();
  for (const row of splitTimes) {
    const entryId = String(row.entryId);
    if (!splitMaps.has(entryId)) splitMaps.set(entryId, new Map());
    splitMaps.get(entryId).set(String(row.splitPointId), row.elapsedDurationMs);
  }

  const ids = new Set([...stageByEntry.keys(), ...overallByEntry.keys(), ...splitMaps.keys()]);
  stage.drivers = [...ids].map(id => {
    const entry = entries.get(id) || { id, name: `#${id}`, order: 999, category: 'MUU' };
    return {
      ...entry,
      stageTimeMs: stageByEntry.get(id),
      overallTimeMs: overallByEntry.get(id),
      overallPosition: resultPosition.get(id),
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
    await Promise.all([loadCurrentStage(), loadSundayResults()]);
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
  const drivers = filteredDrivers(stage.drivers);
  const reference = drivers.find(driver => driver.id === referenceId) || drivers[0];
  if (!reference) {
    $('#content').innerHTML = '<p class="empty">Selles kategoorias splitiaegu veel ei ole.</p>';
    return;
  }

  const columns = stage.splitPoints.length + 2;
  let html = `<section class="split-wrap"><div class="split-table" style="grid-template-columns:minmax(100px,1.25fr) repeat(${columns - 1},minmax(56px,.8fr))"><div></div>`;
  html += stage.splitPoints.map((point, index) => `
    <div class="split-header"><span>S${index + 1}</span><small>${Number(point.distance || 0).toFixed(2)} km</small></div>`).join('');
  html += '<div class="split-header"><span>FIN</span></div>';

  drivers.forEach((driver, index) => {
    const selected = driver.id === reference.id;
    html += `<button class="driver-cell ${selected ? 'selected' : ''}" data-driver="${driver.id}"><span>${index + 1}</span><strong>${driver.name}</strong></button>`;

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

  const drivers = filteredDrivers(stage.drivers);
  const reference = drivers.find(driver => driver.id === referenceId) || drivers[0];
  $('#stageTitle').textContent = sunday ? 'Super Sunday' : stage.title;
  $('#stageSub').innerHTML = sunday
    ? config.eventName
    : tab === 'KATSE'
      ? `${Number(stage.distance || 0).toFixed(2)} km · ${stage.status || ''}`
      : tab === 'SPLIT' && reference
        ? `Võrdlus: <strong>${reference.name.toUpperCase()}</strong>`
        : config.eventName;

  if (tab === 'KATSE') renderStageView(stage);
  else if (tab === 'SPLIT') renderSplitView(stage);
  else if (tab === 'ÜLDSEIS') renderOverallView(stage);
  else renderSundayView();

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
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh(false);
});
