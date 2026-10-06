(() => {
  'use strict';

  // 운동 기록: 부위 → 종목 고르기 → 무게·횟수(세트) 입력 → 목록에 담기 → 마지막에 한 번에 저장.
  // 저장은 기존 운동 저장(입력칸 → 운동 저장 버튼)을 그대로 써서 볼륨·PR·소모 칼로리 계산이 유지된다.
  const core = window.FitLogCore;
  if (!core) return;
  const { readState, writeState, showToast, esc } = core;
  const $ = (selector, root = document) => root.querySelector(selector);
  const key = name => String(name || '').replace(/\s+/g, '').toLowerCase();

  // [이름, 종류] 종류: w=무게×횟수, b=횟수만(맨몸), c=시간(유산소·기타)
  const CATALOG = {
    가슴: [['벤치프레스', 'w'], ['인클라인 벤치프레스', 'w'], ['덤벨 벤치프레스', 'w'], ['인클라인 덤벨 프레스', 'w'], ['체스트 프레스 머신', 'w'], ['펙덱 플라이', 'w'], ['케이블 크로스오버', 'w'], ['딥스', 'b'], ['푸시업', 'b']],
    등: [['랫풀다운', 'w'], ['풀업', 'b'], ['바벨로우', 'w'], ['덤벨로우', 'w'], ['시티드 케이블 로우', 'w'], ['티바로우', 'w'], ['데드리프트', 'w'], ['암 풀다운', 'w'], ['백 익스텐션', 'b']],
    어깨: [['오버헤드 프레스', 'w'], ['덤벨 숄더프레스', 'w'], ['머신 숄더프레스', 'w'], ['사이드 레터럴 레이즈', 'w'], ['프론트 레이즈', 'w'], ['리어 델트 머신', 'w'], ['페이스 풀', 'w']],
    팔: [['바벨 컬', 'w'], ['덤벨 컬', 'w'], ['해머 컬', 'w'], ['프리처 컬', 'w'], ['케이블 푸시다운', 'w'], ['트라이셉스 익스텐션', 'w'], ['라잉 트라이셉스 익스텐션', 'w']],
    하체: [['스쿼트', 'w'], ['레그 프레스', 'w'], ['루마니안 데드리프트', 'w'], ['런지', 'w'], ['불가리안 스플릿 스쿼트', 'w'], ['레그 익스텐션', 'w'], ['레그 컬', 'w'], ['핵 스쿼트', 'w'], ['힙 쓰러스트', 'w'], ['카프 레이즈', 'w']],
    기타: [['러닝', 'c'], ['걷기', 'c'], ['축구', 'c'], ['풋살', 'c'], ['수영', 'c'], ['사이클', 'c'], ['등산', 'c'], ['줄넘기', 'c'], ['계단 오르기', 'c'], ['로잉 머신', 'c'], ['인터벌(HIIT)', 'c'], ['플랭크', 'c'], ['크런치', 'b'], ['행잉 레그 레이즈', 'b']]
  };
  const PARTS = Object.keys(CATALOG);
  const INTENSITY = [['가볍게', 5], ['적당히', 7], ['격하게', 9]];
  const typeOf = name => Object.values(CATALOG).flat().find(([item]) => key(item) === key(name))?.[1] || null;
  const partOf = name => PARTS.find(part => CATALOG[part].some(([item]) => key(item) === key(name))) || '기타';
  const legPart = name => partOf(name) === '하체';

  let cart = [];
  let tab = null;
  let editor = null; // { name, part, type, sets:[{w,r}], minutes, km, intensity, index }

  // ---- 기록에서 종목별 최근 기록·자주 한 운동 찾기 ----
  function lastSession(name) {
    const state = readState();
    for (const date of Object.keys(state.logs || {}).sort().reverse()) {
      for (const workout of [...(state.logs[date].workouts || [])].reverse()) {
        const found = (core.workoutExercises?.(workout) || []).find(exercise => key(exercise.name) === key(name));
        if (found) return { date, exercise: found, rpe: workout.rpe };
      }
    }
    return null;
  }

  function frequent() {
    const state = readState();
    const counts = new Map();
    Object.keys(state.logs || {}).sort().slice(-60).forEach(date => (state.logs[date].workouts || []).forEach(workout => (core.workoutExercises?.(workout) || []).forEach(exercise => {
      counts.set(exercise.name, (counts.get(exercise.name) || 0) + 1);
    })));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name]) => name);
  }

  const favorites = () => readState().profile?.favoriteExercises || [];

  function toggleFavorite(name) {
    const state = readState();
    state.profile ||= {};
    const list = state.profile.favoriteExercises || [];
    state.profile.favoriteExercises = list.some(item => key(item) === key(name)) ? list.filter(item => key(item) !== key(name)) : [...list, name];
    writeState(state);
  }

  // ---- 화면 ----
  function install() {
    const form = $('#workoutForm');
    if (!form || $('#wkPicker')) return;
    const picker = document.createElement('div');
    picker.id = 'wkPicker';
    picker.innerHTML = `
      <div class="wk-tabs" role="tablist"></div>
      <div class="wk-grid"></div>
      <div class="wk-custom"><input class="input" id="wkCustomName" placeholder="목록에 없는 운동 이름" autocomplete="off"><button type="button" class="wk-custom-add" data-wk-custom>＋ 추가</button></div>
      <section class="wk-cart" id="wkCart"></section>`;
    const dateRow = form.querySelector('.workout-date');
    if (dateRow) dateRow.after(picker); else form.prepend(picker);
    // 예전 방식(글로 적기)은 접어서 아래에 둔다.
    const manual = document.createElement('details');
    manual.className = 'wk-manual';
    manual.innerHTML = '<summary>글로 직접 적어서 기록하기</summary>';
    [form.querySelector('.routine-bar'), $('#workoutNote')?.closest('.field'), $('#workoutParsed')].filter(Boolean).forEach(node => manual.append(node));
    $('#wkCart').after(manual);
    const finish = document.createElement('div');
    finish.className = 'wk-finish-head';
    finish.innerHTML = '<h3>마무리</h3><small>운동 시간·강도는 비워도 자동으로 추정해요.</small>';
    manual.after(finish);

    picker.addEventListener('click', onPickerClick);
    document.addEventListener('click', event => { if (event.target.closest('#saveWorkout')) beforeSave(event); }, true);
    tab = favorites().length ? '즐겨찾기' : frequent().length ? '자주 한 운동' : '가슴';
    renderTabs();
    renderGrid();
    renderCart();
  }

  function renderTabs() {
    const tabs = [...(favorites().length ? ['즐겨찾기'] : []), ...(frequent().length ? ['자주 한 운동'] : []), ...PARTS];
    if (!tabs.includes(tab)) tab = tabs[0];
    $('#wkPicker .wk-tabs').innerHTML = tabs.map(name => `<button type="button" role="tab" aria-selected="${name === tab}" class="${name === tab ? 'on' : ''}" data-wk-tab="${name}">${name === '기타' ? '유산소·기타' : name}</button>`).join('');
  }

  function renderGrid() {
    const names = tab === '즐겨찾기' ? favorites() : tab === '자주 한 운동' ? frequent() : CATALOG[tab].map(([name]) => name);
    const inCart = new Set(cart.map(item => key(item.name)));
    $('#wkPicker .wk-grid').innerHTML = names.map(name => {
      const last = lastSession(name);
      const type = typeOf(name) || 'w';
      const lastText = !last ? '' : type === 'c' || last.exercise.cardio ? `${last.exercise.minutes || ''}분` : core.setSummary?.(last.exercise) || '';
      return `<button type="button" class="wk-tile ${inCart.has(key(name)) ? 'in' : ''}" data-wk-open="${esc(name)}"><b>${esc(name)}</b><small>${last ? `지난번 ${esc(lastText)}` : partOf(name) === '기타' && tab !== '기타' ? '' : '처음 기록'}</small>${inCart.has(key(name)) ? '<i>담음</i>' : ''}</button>`;
    }).join('') || '<p class="wk-empty">아직 없어요. 종목 화면의 ☆를 누르면 여기에 모여요.</p>';
  }

  function cartLine(item) {
    if (item.type === 'c') return `${item.name} ${item.minutes}분${item.km ? ` ${item.km}km` : ''}`;
    const groups = [];
    item.sets.forEach(set => {
      const last = groups.at(-1);
      if (last && last.w === set.w) last.r.push(set.r); else groups.push({ w: set.w, r: [set.r] });
    });
    return `${item.name} ${groups.map(group => `${item.type === 'w' && group.w ? `${group.w}kg ` : ''}${group.r.join('/')}`).join(' ')}`;
  }

  function cartSummary(item) {
    if (item.type === 'c') return `${item.minutes}분${item.km ? ` · ${item.km}km` : ''} · ${item.intensity}`;
    const volume = item.sets.reduce((sum, set) => sum + (item.type === 'w' ? set.w * set.r : 0), 0);
    return `${item.sets.length}세트 · ${item.sets.map(set => item.type === 'w' ? `${set.w}×${set.r}` : `${set.r}회`).join(', ')}${volume ? ` · ${volume.toLocaleString()}kg` : ''}`;
  }

  function renderCart() {
    const box = $('#wkCart');
    if (!box) return;
    const save = $('#saveWorkout');
    if (save && !save.textContent.includes('수정')) save.textContent = cart.length ? `운동 저장 · ${cart.length}종목` : '운동 저장';
    if (!cart.length) { box.innerHTML = '<p class="wk-cart-empty">종목을 누르고 무게·횟수를 적어 <b>목록에 담으세요</b>.</p>'; return; }
    box.innerHTML = `<div class="wk-cart-head"><h3>담은 운동 ${cart.length}개</h3><button type="button" class="link" data-wk-clear>모두 비우기</button></div>
      ${cart.map((item, index) => `<article class="wk-cart-item"><button type="button" class="wk-cart-main" data-wk-edit="${index}"><b>${esc(item.name)}</b><small>${esc(cartSummary(item))}</small></button><button type="button" class="wk-cart-del" data-wk-remove="${index}" aria-label="${esc(item.name)} 빼기">×</button></article>`).join('')}`;
  }

  function onPickerClick(event) {
    const tabButton = event.target.closest('[data-wk-tab]');
    if (tabButton) { tab = tabButton.dataset.wkTab; renderTabs(); renderGrid(); return; }
    const open = event.target.closest('[data-wk-open]');
    if (open) { openEditor(open.dataset.wkOpen); return; }
    if (event.target.closest('[data-wk-custom]')) {
      const name = $('#wkCustomName').value.trim();
      if (!name) { $('#wkCustomName').focus(); return; }
      $('#wkCustomName').value = '';
      openEditor(name, tab === '기타' ? 'c' : 'w');
      return;
    }
    const edit = event.target.closest('[data-wk-edit]');
    if (edit) { const item = cart[+edit.dataset.wkEdit]; openEditor(item.name, item.type, { ...item, sets: item.sets.map(set => ({ ...set })), index: +edit.dataset.wkEdit }); return; }
    const remove = event.target.closest('[data-wk-remove]');
    if (remove) { cart.splice(+remove.dataset.wkRemove, 1); renderCart(); renderGrid(); return; }
    if (event.target.closest('[data-wk-clear]') && confirm('담은 운동을 모두 비울까요?')) { cart = []; renderCart(); renderGrid(); }
  }

  // ---- 종목 입력 화면 ----
  function openEditor(name, forcedType = null, existing = null) {
    const type = existing?.type || forcedType || typeOf(name) || 'w';
    const last = lastSession(name);
    let sets = existing?.sets;
    if (!sets && type !== 'c') {
      const previous = last?.exercise?.setList?.length ? last.exercise.setList.map(set => ({ w: set.weight, r: set.reps })) : null;
      sets = previous || (type === 'w' ? [{ w: 20, r: 10 }, { w: 20, r: 10 }, { w: 20, r: 10 }] : [{ w: 0, r: 10 }, { w: 0, r: 10 }, { w: 0, r: 10 }]);
    }
    editor = {
      name, type, part: partOf(name), sets: sets || [],
      minutes: existing?.minutes || last?.exercise?.minutes || 30, km: existing?.km || 0, intensity: existing?.intensity || '적당히',
      index: existing?.index ?? null, last
    };
    let sheet = $('#wkSheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'wkSheet';
      sheet.className = 'wk-sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      document.body.append(sheet);
      sheet.addEventListener('click', onEditorClick);
      sheet.addEventListener('input', onEditorInput);
    }
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    renderEditor();
  }

  const weightStep = () => (legPart(editor.name) ? 5 : 2.5);

  function renderEditor() {
    const sheet = $('#wkSheet');
    const fav = favorites().some(item => key(item) === key(editor.name));
    const last = editor.last;
    const lastText = last ? `지난번 ${last.date.slice(5).replace('-', '/')} · ${editor.type === 'c' ? `${last.exercise.minutes || 0}분` : core.setSummary?.(last.exercise) || ''}` : '처음 기록하는 종목이에요';
    const totalVolume = editor.type === 'w' ? editor.sets.reduce((sum, set) => sum + set.w * set.r, 0) : 0;
    sheet.setAttribute('aria-label', `${editor.name} 기록`);
    sheet.innerHTML = `
      <header class="wk-sheet-head"><button type="button" class="wk-icon" data-wk-close aria-label="닫기">←</button><button type="button" class="wk-icon star ${fav ? 'on' : ''}" data-wk-fav aria-label="즐겨찾기">${fav ? '★' : '☆'}</button>
        <span>${editor.part === '기타' ? '유산소·기타' : editor.part}</span><h2>${esc(editor.name)}</h2><p>${esc(lastText)}</p></header>
      <div class="wk-sheet-body">
        ${editor.type === 'c' ? `
          <div class="wk-row"><span>운동 시간</span><div class="wk-num"><button type="button" data-wk-adj="minutes" data-d="-5">−</button><input inputmode="numeric" data-wk-field="minutes" value="${editor.minutes}"><em>분</em><button type="button" data-wk-adj="minutes" data-d="5">＋</button></div></div>
          <div class="wk-row"><span>거리 <small>선택</small></span><div class="wk-num"><button type="button" data-wk-adj="km" data-d="-0.5">−</button><input inputmode="decimal" data-wk-field="km" value="${editor.km || ''}" placeholder="0"><em>km</em><button type="button" data-wk-adj="km" data-d="0.5">＋</button></div></div>
          <div class="wk-row"><span>운동 강도</span><div class="wk-chips">${INTENSITY.map(([label]) => `<button type="button" class="${editor.intensity === label ? 'on' : ''}" data-wk-intensity="${label}">${label}</button>`).join('')}</div></div>`
        : `
          <div class="wk-sets">${editor.sets.map((set, index) => `
            <div class="wk-set"><b>${index + 1}</b>
              ${editor.type === 'w' ? `<div class="wk-num"><button type="button" data-wk-set="${index}" data-k="w" data-d="${-weightStep()}">−</button><input inputmode="decimal" data-wk-set-input="${index}" data-k="w" value="${set.w}"><em>kg</em><button type="button" data-wk-set="${index}" data-k="w" data-d="${weightStep()}">＋</button></div>` : ''}
              <div class="wk-num"><button type="button" data-wk-set="${index}" data-k="r" data-d="-1">−</button><input inputmode="numeric" data-wk-set-input="${index}" data-k="r" value="${set.r}"><em>회</em><button type="button" data-wk-set="${index}" data-k="r" data-d="1">＋</button></div>
              <button type="button" class="wk-set-del" data-wk-set-del="${index}" aria-label="${index + 1}세트 지우기" ${editor.sets.length < 2 ? 'disabled' : ''}>×</button>
            </div>`).join('')}</div>
          <div class="wk-set-actions"><button type="button" data-wk-add-set>＋ 세트 추가</button>${editor.type === 'w' ? `<button type="button" data-wk-bump>전체 ${weightStep()}kg 올리기</button>` : ''}</div>
          ${totalVolume ? `<p class="wk-volume">총 볼륨 <b>${totalVolume.toLocaleString()}kg</b> · ${editor.sets.length}세트</p>` : ''}`}
      </div>
      <footer class="wk-sheet-foot"><button type="button" class="wk-put" data-wk-put>${editor.index != null ? '수정 완료' : '목록에 담기'}</button></footer>`;
  }

  function onEditorInput(event) {
    const field = event.target.dataset.wkField;
    if (field) { editor[field] = Math.max(0, +String(event.target.value).replace(',', '.') || 0); return; }
    const index = event.target.dataset.wkSetInput;
    if (index != null) editor.sets[+index][event.target.dataset.k] = Math.max(0, +String(event.target.value).replace(',', '.') || 0);
  }

  function onEditorClick(event) {
    if (event.target.closest('[data-wk-close]')) { closeEditor(); return; }
    if (event.target.closest('[data-wk-fav]')) { toggleFavorite(editor.name); renderEditor(); renderTabs(); renderGrid(); return; }
    const adj = event.target.closest('[data-wk-adj]');
    if (adj) { const field = adj.dataset.wkAdj; editor[field] = Math.max(0, Math.round((+editor[field] + +adj.dataset.d) * 10) / 10); renderEditor(); return; }
    const intensity = event.target.closest('[data-wk-intensity]');
    if (intensity) { editor.intensity = intensity.dataset.wkIntensity; renderEditor(); return; }
    const setButton = event.target.closest('[data-wk-set]');
    if (setButton) {
      const set = editor.sets[+setButton.dataset.wkSet];
      const k = setButton.dataset.k;
      set[k] = Math.max(0, Math.round((set[k] + +setButton.dataset.d) * 10) / 10);
      renderEditor();
      return;
    }
    const del = event.target.closest('[data-wk-set-del]');
    if (del) { editor.sets.splice(+del.dataset.wkSetDel, 1); renderEditor(); return; }
    if (event.target.closest('[data-wk-add-set]')) { editor.sets.push({ ...(editor.sets.at(-1) || { w: 20, r: 10 }) }); renderEditor(); return; }
    if (event.target.closest('[data-wk-bump]')) { editor.sets.forEach(set => { set.w = Math.round((set.w + weightStep()) * 10) / 10; }); renderEditor(); return; }
    if (event.target.closest('[data-wk-put]')) {
      if (editor.type === 'c' && !(editor.minutes > 0)) { showToast('운동 시간을 적어주세요.'); return; }
      if (editor.type !== 'c' && !editor.sets.some(set => set.r > 0)) { showToast('횟수를 1회 이상 적어주세요.'); return; }
      const item = { name: editor.name, type: editor.type, sets: editor.sets.filter(set => set.r > 0), minutes: editor.minutes, km: editor.km, intensity: editor.intensity };
      if (editor.index != null) cart[editor.index] = item; else cart.push(item);
      closeEditor();
      renderCart();
      renderGrid();
      showToast(`${item.name} 담았어요.`);
    }
  }

  function closeEditor() {
    const sheet = $('#wkSheet');
    if (sheet) sheet.hidden = true;
    document.body.classList.remove('sheet-open');
    editor = null;
  }

  // ---- 최종 저장: 담은 운동을 기존 입력칸으로 옮겨 기존 저장 로직을 그대로 쓴다 ----
  function beforeSave() {
    if (!cart.length) return;
    const note = $('#workoutNote');
    if (!note) return;
    const typed = note.value.trim();
    note.value = [typed, ...cart.map(cartLine)].filter(Boolean).join('\n');
    note.dispatchEvent(new Event('input', { bubbles: true }));
    // 강도를 따로 고르지 않았으면 유산소 강도로 RPE를 정한다.
    const cardio = cart.filter(item => item.type === 'c');
    if (cardio.length && !document.querySelector('[data-rpe].on')) {
      const rpe = Math.max(...cardio.map(item => INTENSITY.find(([label]) => label === item.intensity)?.[1] || 7));
      document.querySelector(`[data-rpe="${rpe}"]`)?.click();
    }
    // 저장이 끝나 입력칸이 비워지면 담은 목록도 비운다.
    setTimeout(() => {
      if (!$('#workoutNote').value.trim()) { cart = []; renderCart(); renderGrid(); }
    }, 120);
  }

  install();
  window.addEventListener('fitlog:state-updated', () => { if ($('#wkPicker') && !editor) { renderTabs(); renderGrid(); } });
})();
