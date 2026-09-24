(() => {
  'use strict';

  const STATE_KEY = 'fitlog:dashboard:v3';
  const SYNC_KEY = 'fitlog-sync';
  const AI_KEY = 'fitlog-ai-settings';
  const nativeSetItem = Storage.prototype.setItem;
  let syncing = false;
  let syncTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const safeJson = (value, fallback = null) => {
    try { return JSON.parse(value); } catch { return fallback; }
  };
  const readState = () => safeJson(localStorage.getItem(STATE_KEY), { profile: {}, logs: {}, inbody: [] });
  const normalizeProjectUrl = value => String(value || '')
    .trim()
    .replace('woyrhbvvizsjgxtlaclq.supabase.co', 'woyrhbvvizsjgxtlaclg.supabase.co')
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
  const readSync = () => {
    const config = safeJson(localStorage.getItem(SYNC_KEY), {}) || {};
    const corrected = normalizeProjectUrl(config.url);
    if (corrected && corrected !== config.url) {
      config.url = corrected;
      nativeSetItem.call(localStorage, SYNC_KEY, JSON.stringify(config));
    }
    return config;
  };
  const validSync = (config = readSync()) => Boolean(config.url && config.key);

  function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function stateSignature(raw) {
    const state = normalizeBackup(raw);
    const { lastSaved, syncedAt, ...content } = state;
    return stableJson(content);
  }

  function normalizeBackup(raw) {
    const source = raw?.state || raw || {};
    const oldProfile = source.profile || {};
    return {
      ...source,
      profile: {
        ...oldProfile,
        name: oldProfile.name || '인수',
        workoutGoal: Number(oldProfile.workoutGoal || oldProfile.workoutDays || 5),
        targetFat: Number(oldProfile.targetFat || oldProfile.goalBodyFat || 15),
        targets: {
          kcal: 2200, protein: 153, carbs: 260, fat: 61,
          ...(oldProfile.targets || {})
        }
      },
      logs: source.logs || {},
      inbody: Array.isArray(source.inbody) ? source.inbody : []
    };
  }

  function mergeItems(cloudItems = [], localItems = []) {
    const map = new Map();
    [...cloudItems, ...localItems].forEach(item => {
      const key = item.id ? `id:${item.id}` : `legacy:${stableJson(item)}`;
      map.set(key, item);
    });
    return [...map.values()];
  }

  function mergeStates(localRaw, cloudRaw) {
    const local = normalizeBackup(localRaw);
    const cloud = normalizeBackup(cloudRaw);
    const cloudNewer = Date.parse(cloud.lastSaved || 0) > Date.parse(local.lastSaved || 0);
    const logs = { ...cloud.logs };
    for (const [date, localLog] of Object.entries(local.logs || {})) {
      const cloudLog = logs[date] || {};
      logs[date] = {
        ...cloudLog,
        ...localLog,
        meals: mergeItems(cloudLog.meals, localLog.meals),
        workouts: mergeItems(cloudLog.workouts, localLog.workouts)
      };
    }
    const inbodyMap = new Map();
    [...(cloud.inbody || []), ...(local.inbody || [])].forEach(item => {
      inbodyMap.set(`${item.date || ''}:${item.weight || ''}:${item.pbf || item.bodyFat || ''}`, item);
    });
    const merged = {
      ...(cloudNewer ? local : cloud),
      ...(cloudNewer ? cloud : local),
      profile: cloudNewer ? cloud.profile : local.profile,
      logs,
      inbody: [...inbodyMap.values()]
    };
    const savedAt = [local.lastSaved, cloud.lastSaved]
      .filter(Boolean)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
    if (savedAt) merged.lastSaved = savedAt;
    delete merged.syncedAt;
    return merged;
  }

  async function request(config, method, path, body, extraHeaders = {}) {
    const origin = new URL(config.url).origin;
    const response = await fetch(`${origin}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        ...extraHeaders
      },
      body: body == null ? undefined : JSON.stringify(body)
    });
    if (!response.ok) {
      let message = '';
      try { message = (await response.json()).message || ''; } catch {}
      if (response.status === 401 || response.status === 403) throw new Error('anon public 키가 올바르지 않아요.');
      if (response.status === 404 || /relation .* does not exist/i.test(message)) throw new Error('fitlog_kv 테이블을 찾지 못했어요.');
      throw new Error(message || `동기화 요청 실패 (${response.status})`);
    }
    return response;
  }

  async function readCloud(config) {
    const response = await request(config, 'GET', 'fitlog_kv?select=key,value,updated_at');
    const rows = await response.json();
    const dashboard = rows.find(row => row.key === 'dashboard-v3');
    if (dashboard) return safeJson(dashboard.value, null);
    const legacy = { profile: {}, logs: {}, inbody: [] };
    for (const row of rows) {
      const value = safeJson(row.value, null);
      if (row.key === 'profile' && value) legacy.profile = value;
      if (row.key === 'inbody' && Array.isArray(value)) legacy.inbody = value;
      if (row.key.startsWith('log:') && value) legacy.logs[row.key.slice(4)] = value;
    }
    return Object.keys(legacy.logs).length || Object.keys(legacy.profile).length ? legacy : null;
  }

  async function writeCloud(config, state) {
    await request(
      config,
      'POST',
      'fitlog_kv?on_conflict=key',
      [{ key: 'dashboard-v3', value: JSON.stringify(state), updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' }
    );
  }

  function setStatus(text, tone = '') {
    const el = $('#syncStatus');
    if (!el) return;
    el.textContent = text;
    el.dataset.tone = tone;
  }

  function showSyncNotice(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showSyncNotice.timer);
    showSyncNotice.timer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function applyMergedState(state) {
    const serialized = JSON.stringify(state);
    nativeSetItem.call(localStorage, STATE_KEY, serialized);
    window.dispatchEvent(new StorageEvent('storage', {
      key: STATE_KEY,
      newValue: serialized,
      storageArea: localStorage
    }));
    window.dispatchEvent(new CustomEvent('fitlog:state-updated'));
  }

  function describeState(state) {
    const logs = Object.values(state.logs || {});
    return {
      days: logs.length,
      meals: logs.reduce((sum, log) => sum + (log.meals || []).length, 0),
      workouts: logs.reduce((sum, log) => sum + (log.workouts || []).length, 0)
    };
  }

  function renderArchive() {
    const target = $('#archiveList');
    if (!target) return;
    const state = normalizeBackup(readState());
    const dates = Object.keys(state.logs || {}).sort().reverse();
    $('#archiveSummary').textContent = dates.length ? `${dates.length}일의 기록이 보관되어 있어요.` : '보관된 기록이 아직 없어요.';
    target.innerHTML = dates.length ? dates.map(date => {
      const log = state.logs[date] || {};
      const kcal = (log.meals || []).reduce((sum, item) => sum + (+item.kcal || 0), 0);
      return `<div class="sync-history-row"><div><strong>${date}</strong><span>식사 ${(log.meals || []).length}개 · 운동 ${(log.workouts || []).length}개</span></div><b>${Math.round(kcal).toLocaleString()} kcal</b></div>`;
    }).join('') : '<p class="sync-help">백업을 복원하면 이전 날짜가 여기에 표시돼요.</p>';
  }

  async function syncNow({ reload = false } = {}) {
    const config = readSync();
    if (!validSync(config) || syncing) return false;
    syncing = true;
    setStatus('동기화하는 중…');
    try {
      const local = readState();
      const cloud = await readCloud(config);
      const merged = cloud ? mergeStates(local, cloud) : normalizeBackup(local);
      const localChanged = stateSignature(local) !== stateSignature(merged);
      const cloudChanged = !cloud || stateSignature(cloud) !== stateSignature(merged);
      if (localChanged) applyMergedState(merged);
      if (cloudChanged) await writeCloud(config, merged);
      setStatus(`동기화됨 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`, 'ok');
      renderArchive();
      if (reload && localChanged) showSyncNotice('다른 기기의 기록을 조용히 반영했어요.');
      return true;
    } catch (error) {
      setStatus(error.message || '동기화하지 못했어요.', 'bad');
      return false;
    } finally {
      syncing = false;
    }
  }

  function scheduleSync() {
    if (!validSync() || syncing) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(), 900);
  }

  function renderAiStatus() {
    const settings = safeJson(localStorage.getItem(AI_KEY), {}) || {};
    const configured = Boolean(settings.token && validSync());
    $('#aiStatus').textContent = configured
      ? `OpenAI GPT 연결 준비됨 · ${settings.model || 'gpt-5.6-luna'}`
      : '동기화 연결과 AI 연결 토큰을 설정해 주세요.';
    $('#aiStatus').dataset.tone = configured ? 'ok' : '';
    $('#aiModel').value = settings.model || 'gpt-5.6-luna';
    $('#aiFunction').value = settings.functionName || 'smart-endpoint';
    $('#aiToken').value = settings.token || '';
  }

  function installUi() {
    const more = $('[data-view="more"] .content');
    if (!more || $('#syncPanel')) return;
    const dataHeading = [...more.querySelectorAll('.section-head')].find(el => el.textContent.includes('데이터 관리'));
    const panel = document.createElement('div');
    panel.id = 'syncPanel';
    panel.innerHTML = `
      <div class="section-head"><h2>기록 보관함</h2></div>
      <section class="card sync-card"><p id="archiveSummary" class="sync-help"></p><div id="archiveList"></div></section>
      <div class="section-head"><h2>여러 기기 동기화</h2></div>
      <section class="card sync-card">
        <p class="sync-help">기존 Supabase 연결을 자동으로 감지합니다. 다른 기기에도 같은 프로젝트 URL과 anon public 키를 한 번 입력하면 기록이 합쳐집니다.</p>
        <label class="field"><span>Supabase 프로젝트 URL</span><input class="input" id="syncUrl" inputmode="url" placeholder="https://프로젝트.supabase.co"></label>
        <label class="field"><span>anon public 키</span><input class="input" id="syncKeyInput" type="password" autocomplete="off" placeholder="eyJ…"></label>
        <div class="sync-actions"><button class="primary mint" id="saveSync">연결 확인</button><button class="primary" id="syncNow">지금 동기화</button></div>
        <p id="syncStatus" class="sync-status" role="status"></p>
      </section>
      <div class="section-head"><h2>OpenAI GPT 연결</h2></div>
      <section class="card sync-card">
        <p id="aiStatus" class="sync-status"></p>
        <label class="field"><span>Supabase 함수 이름</span><input class="input" id="aiFunction" value="smart-endpoint" placeholder="예: smart-endpoint"></label>
        <label class="field"><span>모델</span><select class="select" id="aiModel"><option value="gpt-5.6-luna">GPT-5.6 Luna · 추천/절약형</option><option value="gpt-5.6-terra">GPT-5.6 Terra · 균형형</option><option value="gpt-5.6-sol">GPT-5.6 Sol · 고성능</option></select></label>
        <label class="field"><span>AI 연결 토큰</span><input class="input" id="aiToken" type="password" autocomplete="off" placeholder="Supabase 함수에 설정한 토큰"></label>
        <button class="primary mint full" id="saveAi">GPT 연결 설정 저장</button>
        <p class="sync-help">OpenAI API 키는 휴대폰에 저장하지 않고 Supabase 함수에만 보관합니다.</p>
      </section>`;
    more.insertBefore(panel, dataHeading || null);

    const style = document.createElement('style');
    style.textContent = `.sync-card{padding:15px}.sync-help{margin:0 0 12px;color:var(--sub);font-size:12px;line-height:1.55}.sync-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sync-status{min-height:20px;margin:10px 0 0;color:var(--sub);font-size:12px}.sync-status[data-tone="ok"]{color:#2f8467}.sync-status[data-tone="bad"]{color:#b05243}.sync-history-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}.sync-history-row:last-child{border-bottom:0}.sync-history-row strong,.sync-history-row span{display:block}.sync-history-row strong{font-size:13px}.sync-history-row span{margin-top:2px;color:var(--sub);font-size:10px}.sync-history-row b{font-size:11px;white-space:nowrap}`;
    document.head.appendChild(style);

    const config = readSync();
    $('#syncUrl').value = config.url || '';
    $('#syncKeyInput').value = config.key || '';
    setStatus(validSync(config) ? '기존 동기화 설정을 자동으로 찾았어요.' : '동기화 설정이 아직 없어요.', validSync(config) ? 'ok' : '');
    renderArchive();
    renderAiStatus();

    $('#saveSync').onclick = async () => {
      const next = { url: normalizeProjectUrl($('#syncUrl').value), key: $('#syncKeyInput').value.trim() };
      if (!next.url || !next.key) return setStatus('프로젝트 URL과 anon public 키를 모두 입력해 주세요.', 'bad');
      try {
        setStatus('연결을 확인하는 중…');
        await request(next, 'GET', 'fitlog_kv?select=key&limit=1');
        nativeSetItem.call(localStorage, SYNC_KEY, JSON.stringify(next));
        setStatus('연결됐어요. 이 기기의 기록을 합치는 중…', 'ok');
        await syncNow({ reload: true });
      } catch (error) {
        setStatus(error.message || '연결하지 못했어요.', 'bad');
      }
    };
    $('#syncNow').onclick = () => syncNow({ reload: true });
    $('#saveAi').onclick = () => {
      const current = safeJson(localStorage.getItem(AI_KEY), {}) || {};
      const next = {
        ...current,
        provider: 'openai',
        functionName: $('#aiFunction').value.trim() || 'smart-endpoint',
        model: $('#aiModel').value,
        token: $('#aiToken').value.trim()
      };
      nativeSetItem.call(localStorage, AI_KEY, JSON.stringify(next));
      renderAiStatus();
      sessionStorage.setItem('fitlog:notice', next.token ? 'GPT 연결 설정을 이 기기에 저장했어요.' : 'AI 연결 토큰을 비웠어요.');
      location.reload();
    };
  }

  function installRestoreFix() {
    const input = $('#restore');
    if (!input) return;
    input.onchange = async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const incoming = normalizeBackup(JSON.parse(await file.text()));
        if (!incoming.profile || !incoming.logs) throw new Error('형식 오류');
        const merged = mergeStates(readState(), incoming);
        nativeSetItem.call(localStorage, STATE_KEY, JSON.stringify(merged));
        const info = describeState(merged);
        sessionStorage.setItem('fitlog:notice', `복원 완료 · ${info.days}일 · 식사 ${info.meals}개 · 운동 ${info.workouts}개`);
        if (validSync()) await writeCloud(readSync(), merged);
        location.hash = 'more';
        location.reload();
      } catch {
        sessionStorage.setItem('fitlog:notice', '백업 파일 형식을 확인해 주세요.');
        location.reload();
      } finally {
        event.target.value = '';
      }
    };
  }

  Storage.prototype.setItem = function(key, value) {
    nativeSetItem.call(this, key, value);
    if (this === localStorage && key === STATE_KEY) scheduleSync();
  };

  installUi();
  installRestoreFix();
  const notice = sessionStorage.getItem('fitlog:notice');
  if (notice) {
    sessionStorage.removeItem('fitlog:notice');
    setTimeout(() => {
      const toast = $('#toast');
      if (!toast) return;
      toast.textContent = notice;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 4200);
    }, 100);
  }
  if (validSync()) syncNow({ reload: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && validSync()) syncNow({ reload: true }); });
  setInterval(() => { if (!document.hidden && validSync()) syncNow({ reload: true }); }, 60000);
})();
