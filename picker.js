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
    가슴: [['벤치프레스', 'w'], ['인클라인 벤치프레스', 'w'], ['디클라인 벤치프레스', 'w'], ['덤벨 벤치프레스', 'w'], ['인클라인 덤벨 프레스', 'w'], ['스미스 벤치프레스', 'w'], ['클로즈그립 벤치프레스', 'w'], ['체스트 프레스 머신', 'w'], ['인클라인 체스트 프레스 머신', 'w'], ['덤벨 플라이', 'w'], ['인클라인 덤벨 플라이', 'w'], ['펙덱 플라이', 'w'], ['케이블 크로스오버', 'w'], ['딥스', 'b'], ['푸시업', 'b'], ['머신 플라이', 'w'], ['케이블 플라이', 'w'], ['로우 투 하이 케이블 플라이', 'w'], ['하이 투 로우 케이블 플라이', 'w'], ['해머 스트렝스 체스트 프레스', 'w'], ['디클라인 체스트 프레스 머신', 'w'], ['스미스 인클라인 벤치프레스', 'w'], ['덤벨 풀오버', 'w'], ['인클라인 푸시업', 'b'], ['디클라인 푸시업', 'b']],
    등: [['랫풀다운', 'w'], ['클로즈그립 랫풀다운', 'w'], ['언더그립 랫풀다운', 'w'], ['풀업', 'b'], ['친업', 'b'], ['어시스트 풀업 머신', 'w'], ['바벨로우', 'w'], ['펜들레이 로우', 'w'], ['덤벨로우', 'w'], ['원암 덤벨로우', 'w'], ['시티드 케이블 로우', 'w'], ['티바로우', 'w'], ['머신 로우', 'w'], ['하이 로우 머신', 'w'], ['암 풀다운', 'w'], ['데드리프트', 'w'], ['랙풀', 'w'], ['바벨 슈러그', 'w'], ['백 익스텐션', 'b'], ['원암 케이블 로우', 'w'], ['케이블 풀오버', 'w'], ['와이드그립 시티드 로우', 'w'], ['인클라인 덤벨로우', 'w'], ['스미스 로우', 'w'], ['T바 로우 머신', 'w'], ['원암 랫풀다운', 'w'], ['인버티드 로우', 'b'], ['덤벨 슈러그', 'w'], ['하이퍼 익스텐션', 'b']],
    어깨: [['오버헤드 프레스', 'w'], ['덤벨 숄더프레스', 'w'], ['머신 숄더프레스', 'w'], ['스미스 숄더프레스', 'w'], ['아놀드 프레스', 'w'], ['사이드 레터럴 레이즈', 'w'], ['케이블 레터럴 레이즈', 'w'], ['머신 레터럴 레이즈', 'w'], ['프론트 레이즈', 'w'], ['벤트오버 리어 레이즈', 'w'], ['리어 델트 머신', 'w'], ['페이스 풀', 'w'], ['랜드마인 프레스', 'w'], ['비하인드넥 프레스', 'w'], ['덤벨 프론트 레이즈', 'w'], ['케이블 프론트 레이즈', 'w'], ['업라이트 로우', 'w'], ['케이블 리어 델트 플라이', 'w'], ['Y 레이즈', 'w'], ['해머 숄더프레스 머신', 'w']],
    팔: [['바벨 컬', 'w'], ['이지바 컬', 'w'], ['덤벨 컬', 'w'], ['해머 컬', 'w'], ['프리처 컬', 'w'], ['케이블 컬', 'w'], ['컨센트레이션 컬', 'w'], ['리버스 컬', 'w'], ['케이블 푸시다운', 'w'], ['로프 푸시다운', 'w'], ['트라이셉스 익스텐션', 'w'], ['라잉 트라이셉스 익스텐션', 'w'], ['스컬 크러셔', 'w'], ['덤벨 킥백', 'w'], ['인클라인 덤벨 컬', 'w'], ['스파이더 컬', 'w'], ['케이블 해머 컬', 'w'], ['베이즈 컬', 'w'], ['오버헤드 케이블 익스텐션', 'w'], ['덤벨 오버헤드 익스텐션', 'w'], ['원암 케이블 푸시다운', 'w'], ['벤치 딥스', 'b'], ['클로즈그립 푸시업', 'b'], ['리스트 컬', 'w']],
    하체: [['스쿼트', 'w'], ['프론트 스쿼트', 'w'], ['스미스 스쿼트', 'w'], ['고블릿 스쿼트', 'w'], ['핵 스쿼트', 'w'], ['레그 프레스', 'w'], ['루마니안 데드리프트', 'w'], ['런지', 'w'], ['워킹 런지', 'w'], ['불가리안 스플릿 스쿼트', 'w'], ['스텝업', 'w'], ['레그 익스텐션', 'w'], ['레그 컬', 'w'], ['시티드 레그 컬', 'w'], ['힙 쓰러스트', 'w'], ['글루트 킥백 머신', 'w'], ['힙 어브덕션 머신', 'w'], ['어덕션 머신', 'w'], ['카프 레이즈', 'w'], ['시티드 카프 레이즈', 'w'], ['스모 데드리프트', 'w'], ['굿모닝', 'w'], ['펜듈럼 스쿼트', 'w'], ['브이 스쿼트', 'w'], ['벨트 스쿼트', 'w'], ['싱글 레그 프레스', 'w'], ['리버스 런지', 'w'], ['사이드 런지', 'w'], ['스티프 레그 데드리프트', 'w'], ['노르딕 햄스트링 컬', 'b'], ['케틀벨 스윙', 'w'], ['박스 점프', 'b'], ['맨몸 스쿼트', 'b'], ['레그 프레스 카프 레이즈', 'w']],
    복근: [['플랭크', 'c'], ['사이드 플랭크', 'c'], ['크런치', 'b'], ['케이블 크런치', 'w'], ['레그 레이즈', 'b'], ['행잉 레그 레이즈', 'b'], ['러시안 트위스트', 'b'], ['AB 롤아웃', 'b'], ['싯업', 'b'], ['데드버그', 'b'], ['버드독', 'b'], ['바이시클 크런치', 'b'], ['마운틴 클라이머', 'b'], ['행잉 니 레이즈', 'b'], ['할로우 홀드', 'c'], ['팔로프 프레스', 'w'], ['디클라인 싯업', 'b'], ['우드찹', 'w']],
    기타: [['러닝', 'c'], ['트레드밀 걷기', 'c'], ['인클라인 걷기', 'c'], ['걷기', 'c'], ['축구', 'c'], ['풋살', 'c'], ['수영', 'c'], ['사이클', 'c'], ['실내 사이클', 'c'], ['스텝밀(천국의 계단)', 'c'], ['일립티컬', 'c'], ['로잉 머신', 'c'], ['인터벌(HIIT)', 'c'], ['줄넘기', 'c'], ['등산', 'c'], ['배드민턴', 'c'], ['테니스', 'c'], ['농구', 'c'], ['클라이밍', 'c'], ['복싱', 'c'], ['요가', 'c'], ['필라테스', 'c'], ['조깅', 'c'], ['버피', 'b'], ['배틀로프', 'c'], ['계단 오르기', 'c'], ['스피닝', 'c'], ['에어로빅', 'c'], ['탁구', 'c'], ['골프', 'c'], ['스트레칭', 'c'], ['폼롤러', 'c'], ['스키·보드', 'c'], ['자전거(야외)', 'c']]
  };

  const PARTS = Object.keys(CATALOG);
  const INTENSITY = [['가볍게', 5], ['적당히', 7], ['격하게', 9]];
  const RPE = [[6, '여유 있음', '4회 이상 더 가능'], [7, '조금 힘듦', '2~3회 더 가능'], [8, '힘듦', '1~2회 더 가능'], [9, '매우 힘듦', '1회 더 가능'], [10, '한계', '더는 못 함']];
  const autoMinutes = sets => Math.max(5, Math.round(sets.length * 2.5));
  const typeOf = name => Object.values(CATALOG).flat().find(([item]) => key(item) === key(name))?.[1] || null;
  const partOf = name => PARTS.find(part => CATALOG[part].some(([item]) => key(item) === key(name))) || '기타';
  const legPart = name => partOf(name) === '하체';

  let cart = [];
  let tab = null;
  let editor = null; // { name, part, type, sets:[{w,r}], minutes, km, intensity, index }
  let editInfo = null; // 보관함에서 "수정"으로 불러온 기록 { date, id }

  // ---- 하던 기록 보관: 앱이 새로고침되거나 폰이 앱을 정리해도 담은 운동·입력 중인 종목을 되살린다 ----
  const DRAFT_KEY = 'fitlog:wkDraft';
  let draftReady = false; // 되살리기 전에는 덮어쓰지 않는다
  function saveDraft() {
    if (!draftReady) return;
    try {
      const open = editor ? { name: editor.name, type: editor.type, sets: editor.sets, minutes: editor.minutes, km: editor.km, intensity: editor.intensity, minutesAuto: editor.minutesAuto, rpe: editor.rpe, index: editor.index } : null;
      if (!cart.length && !open && !editInfo) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify({ cart, editor: open, edit: editInfo, date: $('#workoutDate')?.value || null, savedAt: Date.now() }));
    } catch { /* 저장 공간을 못 쓰면 메모리로만 */ }
  }
  function restoreDraft() {
    draftReady = true;
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch {}
    // 12시간이 지난 기록은 버린다(다음 날 운동에 섞이지 않게).
    if (!draft || !(Date.now() - draft.savedAt < 12 * 3600 * 1000)) { try { localStorage.removeItem(DRAFT_KEY); } catch {} return; }
    cart = Array.isArray(draft.cart) ? draft.cart : [];
    if (draft.edit) { editInfo = draft.edit; core.setWorkoutEditMode?.(draft.edit); }
    else if (draft.date && $('#workoutDate') && [...($('#workoutDate').options || [])].some(option => option.value === draft.date)) {
      $('#workoutDate').value = draft.date;
      $('#workoutDate').dispatchEvent(new Event('change', { bubbles: true }));
    }
    renderCart();
    renderGrid();
    if (draft.editor?.name) openEditor(draft.editor.name, draft.editor.type, { ...draft.editor, sets: (draft.editor.sets || []).map(set => ({ ...set })) });
    if (cart.length || draft.editor) showToast('하던 운동 기록을 불러왔어요.');
  }

  // 저장된 운동 하나를 "담은 운동" 목록 형태로 바꾼다.
  function cartFromExercise(exercise) {
    const name = exercise.name;
    const setList = exercise.setList || [];
    if (exercise.cardio || !setList.length) {
      const rpe = +exercise.rpe || null;
      return { name, type: 'c', sets: [], minutes: +exercise.minutes || 30, minutesAuto: false, rpe: rpe || 7, km: 0, intensity: INTENSITY.reduce((best, item) => Math.abs(item[1] - (rpe || 7)) < Math.abs(best[1] - (rpe || 7)) ? item : best)[0] };
    }
    const type = typeOf(name) || (setList.some(set => +set.weight > 0) ? 'w' : 'b');
    const sets = setList.map(set => ({ w: +set.weight || 0, r: +set.reps || 0 }));
    return { name, type, sets, minutes: +exercise.minutes || autoMinutes(sets), minutesAuto: !exercise.minutes, rpe: +exercise.rpe || null, km: 0, intensity: '적당히' };
  }

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
    restoreDraft();
    restoreTimer();
  }

  function renderTabs() {
    const tabs = [...(favorites().length ? ['즐겨찾기'] : []), ...(frequent().length ? ['자주 한 운동'] : []), ...PARTS];
    if (!tabs.includes(tab)) tab = tabs[0];
    $('#wkPicker .wk-tabs').innerHTML = tabs.map(name => `<button type="button" role="tab" aria-selected="${name === tab}" class="${name === tab ? 'on' : ''}" data-wk-tab="${name}">${name === '기타' ? '유산소·기타' : name === '복근' ? '복근·코어' : name}</button>`).join('');
  }

  function renderGrid() {
    const names = tab === '즐겨찾기' ? favorites() : tab === '자주 한 운동' ? frequent() : CATALOG[tab].map(([name]) => name);
    const inCart = new Set(cart.map(item => key(item.name)));
    $('#wkPicker .wk-grid').innerHTML = names.map(name => {
      const last = lastSession(name);
      const type = typeOf(name) || 'w';
      const lastText = !last ? '' : type === 'c' || last.exercise.cardio ? `${last.exercise.minutes || ''}분` : core.setSummary?.(last.exercise) || '';
      return `<button type="button" class="wk-tile ${inCart.has(key(name)) ? 'in' : ''}" data-part="${partOf(name)}" data-wk-open="${esc(name)}"><b>${esc(name)}</b><small>${last ? `지난번 ${esc(lastText)}` : partOf(name) === '기타' && tab !== '기타' ? '' : '처음 기록'}</small>${inCart.has(key(name)) ? '<i>담음</i>' : ''}</button>`;
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
    return `${item.sets.length}세트 · ${item.sets.map(set => item.type === 'w' ? `${set.w}×${set.r}` : `${set.r}회`).join(', ')}${volume ? ` · ${volume.toLocaleString()}kg` : ''} · ${item.minutes}분${item.rpe ? ` · RPE ${item.rpe}` : ''}`;
  }

  function renderCart() {
    const box = $('#wkCart');
    if (!box) return;
    saveDraft();
    const save = $('#saveWorkout');
    if (save && !save.textContent.includes('수정')) save.textContent = cart.length ? `운동 저장 · ${cart.length}종목` : '운동 저장';
    if (!cart.length) { box.innerHTML = '<p class="wk-cart-empty">종목을 누르고 무게·횟수를 적어 <b>목록에 담으세요</b>.</p>'; return; }
    // 담은 운동은 세트를 칩으로 크게 보여준다(누르면 그 종목을 다시 고칠 수 있다).
    const setChips = item => item.type === 'c'
      ? `<span class="wk-chip">${item.minutes}분</span>${item.km ? `<span class="wk-chip">${item.km}km</span>` : ''}<span class="wk-chip soft">${esc(item.intensity || '')}</span>`
      : item.sets.reduce((groups, set) => {
        // 같은 무게·횟수가 이어지면 "50kg × 10회 · 4세트"처럼 한 칩으로 묶는다.
        const last = groups.at(-1);
        if (last && last.w === set.w && last.r === set.r) last.n++; else groups.push({ ...set, n: 1 });
        return groups;
      }, []).map(set => `<span class="wk-chip">${item.type === 'w' ? `${set.w}<small>kg</small> × ` : ''}${set.r}<small>회</small>${set.n > 1 ? `<i>${set.n}세트</i>` : ''}</span>`).join('');
    const meta = item => {
      if (item.type === 'c') return item.plan ? '계획에서 담음' : '';
      const volume = item.type === 'w' ? item.sets.reduce((sum, set) => sum + set.w * set.r, 0) : 0;
      return [`${item.sets.length}세트`, volume ? `${volume.toLocaleString()}kg` : '', `${item.minutes}분`, item.rpe ? `RPE ${item.rpe}` : '', item.plan ? '계획에서 담음 · 눌러서 실제 기록으로 고치기' : ''].filter(Boolean).join(' · ');
    };
    box.innerHTML = `<div class="wk-cart-head"><h3>담은 운동 ${cart.length}개</h3><button type="button" class="link" data-wk-clear>모두 비우기</button></div>
      ${cart.map((item, index) => `<article class="wk-cart-item ${item.plan ? 'from-plan' : ''}"><button type="button" class="wk-cart-main" data-wk-edit="${index}"><span class="wk-cart-name"><b>${esc(item.name)}</b><em>수정</em></span><span class="wk-chips-row">${setChips(item)}</span>${meta(item) ? `<small>${esc(meta(item))}</small>` : ''}</button><button type="button" class="wk-cart-del" data-wk-remove="${index}" aria-label="${esc(item.name)} 빼기">×</button></article>`).join('')}`;
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
      sets = previous || (type === 'w' ? Array.from({ length: 3 }, () => ({ w: COMPOUND.test(name) ? 20 : 5, r: 10 })) : [{ w: 0, r: 10 }, { w: 0, r: 10 }, { w: 0, r: 10 }]);
    }
    editor = {
      name, type, part: partOf(name), sets: sets || [],
      minutes: existing?.minutes || (type === 'c' ? last?.exercise?.minutes || 30 : autoMinutes(sets || [])), km: existing?.km || 0, intensity: existing?.intensity || '적당히',
      // 근력 종목 시간은 따로 바꾸기 전까지 세트 수로 자동 계산한다. 강도는 지난번 값을 먼저 보여준다.
      minutesAuto: existing ? Boolean(existing.minutesAuto) : type !== 'c',
      rpe: existing?.rpe ?? last?.exercise?.rpe ?? last?.rpe ?? null,
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

  // ---- 쉬는 시간: 큰 복합 운동·저반복은 길게, 고립·맨몸은 짧게. 직접 바꾸면 종목별로 기억한다 ----
  const COMPOUND = /스쿼트|데드|벤치|프레스|로우|풀업|친업|딥스|런지|쓰러스트|랙풀/;
  function autoRest(name, sets = []) {
    const reps = sets.length ? Math.min(...sets.map(set => +set.r || 10)) : 10;
    if (partOf(name) === '복근') return 45;
    if (COMPOUND.test(name)) return reps <= 6 ? 180 : 120;
    return reps >= 15 ? 60 : 75;
  }
  const restFor = (name, sets) => +readState().profile?.restTimes?.[key(name)] || autoRest(name, sets);
  const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;
  function saveRest(name, seconds) {
    const state = readState();
    state.profile ||= {};
    state.profile.restTimes = { ...(state.profile.restTimes || {}), [key(name)]: seconds };
    writeState(state);
  }

  let timer = null;
  let audio = null;
  function beep() {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach(offset => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.25, audio.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + offset + 0.18);
        osc.connect(gain).connect(audio.destination);
        osc.start(audio.currentTime + offset);
        osc.stop(audio.currentTime + offset + 0.2);
      });
    } catch { /* 소리를 못 내는 환경이면 진동·알림만 */ }
  }
  // 타이머는 "끝나는 시각"을 저장하므로 앱을 잠시 나갔다 오거나 새로고침돼도 그대로 이어진다.
  const TIMER_KEY = 'fitlog:restTimer';
  function saveTimer() {
    try { if (timer) localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); else localStorage.removeItem(TIMER_KEY); } catch {}
  }
  function restoreTimer() {
    try {
      const saved = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null');
      if (saved?.end > Date.now()) { timer = saved; tick(); } else localStorage.removeItem(TIMER_KEY);
    } catch {}
  }
  // 앱 밖에 있을 때 휴식이 끝나면 알림으로 알려준다(처음 타이머를 켤 때 한 번만 허락을 묻는다).
  function askNotify() {
    try {
      if (!('Notification' in window) || Notification.permission !== 'default' || localStorage.getItem('fitlog:notifyAsked')) return;
      localStorage.setItem('fitlog:notifyAsked', '1');
      Notification.requestPermission();
    } catch {}
  }
  async function notifyDone(name) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const options = { body: `${name} · 다음 세트를 시작해요.`, tag: 'fitlog-rest', renotify: true, vibrate: [250, 120, 250, 120, 400], icon: 'icon-192.png?v=2' };
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) registration.showNotification('휴식 끝!', options); else new Notification('휴식 끝!', options);
    } catch {}
  }
  function startRest(name, seconds) {
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch {}
    askNotify();
    timer = { name, total: seconds, end: Date.now() + seconds * 1000 };
    saveTimer();
    tick();
  }
  function tick() {
    clearTimeout(tick.handle);
    if (!timer) { renderTimer(); return; }
    const left = Math.ceil((timer.end - Date.now()) / 1000);
    if (left <= 0) {
      navigator.vibrate?.([250, 120, 250, 120, 400]);
      beep();
      if (document.hidden) notifyDone(timer.name);
      showToast('휴식 끝! 다음 세트를 시작해요.');
      timer = null;
      saveTimer();
      renderTimer();
      drawPip();
      return;
    }
    renderTimer(left);
    tick.handle = setTimeout(tick, 250);
  }

  // ---- 작은 창(PiP) 타이머: 타이머를 그린 영상을 화면 속 화면으로 띄워 다른 앱 위에서도 보이게 한다 ----
  let pip = null;
  const pipSupported = () => {
    const video = document.createElement('video');
    return Boolean(document.pictureInPictureEnabled && video.requestPictureInPicture) || typeof video.webkitSetPresentationMode === 'function';
  };
  function drawPip() {
    if (!pip) return;
    const { ctx, canvas } = pip;
    const width = canvas.width, height = canvas.height;
    const left = timer ? Math.max(0, Math.ceil((timer.end - Date.now()) / 1000)) : 0;
    ctx.fillStyle = timer ? '#16212e' : '#1e5c4a';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffffb3';
    ctx.font = '700 26px sans-serif';
    ctx.fillText(timer ? `휴식 · ${timer.name}`.slice(0, 22) : '휴식 끝!', width / 2, 52);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 112px sans-serif';
    ctx.fillText(timer ? clock(left) : '다음 세트', width / 2, timer ? 172 : 160);
    if (timer) {
      ctx.fillStyle = '#ffffff26';
      ctx.fillRect(40, 208, width - 80, 14);
      ctx.fillStyle = '#2fbf8f';
      ctx.fillRect(40, 208, (width - 80) * Math.min(1, 1 - left / timer.total), 14);
    }
  }
  async function openPip() {
    try {
      if (!pip) {
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 270;
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.className = 'pip-video';
        document.body.append(video);
        pip = { canvas, ctx: canvas.getContext('2d'), video };
        drawPip();
        video.srcObject = canvas.captureStream(4);
        video.addEventListener('leavepictureinpicture', closePip);
        video.addEventListener('webkitpresentationmodechanged', () => { if (video.webkitPresentationMode !== 'picture-in-picture') closePip(); });
        pip.interval = setInterval(drawPip, 250);
      }
      await pip.video.play();
      if (document.pictureInPictureEnabled && pip.video.requestPictureInPicture) await pip.video.requestPictureInPicture();
      else pip.video.webkitSetPresentationMode('picture-in-picture');
    } catch {
      closePip();
      showToast('이 폰 브라우저에서는 작은 창 타이머를 열 수 없어요.');
    }
  }
  function closePip() {
    if (!pip) return;
    const { video, interval } = pip;
    pip = null;
    clearInterval(interval);
    try { if (document.pictureInPictureElement === video) document.exitPictureInPicture(); } catch {}
    video.srcObject?.getTracks?.().forEach(track => track.stop());
    video.remove();
  }
  function renderTimer(left = 0) {
    let bar = $('#restTimer');
    if (!timer) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'restTimer';
      bar.className = 'rest-timer';
      bar.setAttribute('role', 'timer');
      document.body.append(bar);
      makeDraggable(bar);
      bar.addEventListener('click', event => {
        const adj = event.target.closest('[data-rest-adj]');
        if (adj && timer) { timer.end += +adj.dataset.restAdj * 1000; timer.total = Math.max(5, timer.total + +adj.dataset.restAdj); saveTimer(); tick(); return; }
        if (event.target.closest('[data-rest-pip]')) { openPip(); return; }
        if (event.target.closest('[data-rest-skip]')) { timer = null; saveTimer(); renderTimer(); drawPip(); }
      });
    }
    bar.innerHTML = `<i class="rest-grip" aria-hidden="true"></i><div class="rest-progress"><i style="width:${Math.min(100, (1 - left / timer.total) * 100)}%"></i></div>
      <div class="rest-row"><div><small>휴식 · ${esc(timer.name)}</small><b>${clock(left)}</b></div>
      <span>${pipSupported() ? `<button type="button" class="pip ${pip ? 'on' : ''}" data-rest-pip aria-label="작은 창으로 띄우기"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none"/></svg></button>` : ''}<button type="button" data-rest-adj="-15">−15</button><button type="button" data-rest-adj="15">＋15</button><button type="button" class="skip" data-rest-skip>건너뛰기</button></span></div>`;
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && timer) tick(); });

  // 타이머 창을 잡고 끌어서 옮긴다(버튼 말고 빈 곳을 잡기). 옮긴 위치는 기억한다.
  const POS_KEY = 'fitlog:restTimerPos';
  function placeBar(bar, x, y) {
    const width = bar.offsetWidth, height = bar.offsetHeight;
    const left = Math.min(Math.max(8, x), window.innerWidth - width - 8);
    const top = Math.min(Math.max(8, y), window.innerHeight - height - 8);
    Object.assign(bar.style, { left: `${left}px`, top: `${top}px`, bottom: 'auto', transform: 'none' });
    return { x: left, y: top };
  }
  function makeDraggable(bar) {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved) requestAnimationFrame(() => placeBar(bar, saved.x, saved.y));
    } catch {}
    let drag = null;
    bar.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      const rect = bar.getBoundingClientRect();
      drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, moved: false };
      bar.setPointerCapture?.(event.pointerId);
      bar.classList.add('dragging');
    });
    bar.addEventListener('pointermove', event => {
      if (!drag) return;
      drag.moved = true;
      drag.pos = placeBar(bar, event.clientX - drag.dx, event.clientY - drag.dy);
      event.preventDefault();
    });
    const end = () => {
      if (!drag) return;
      bar.classList.remove('dragging');
      if (drag.pos) try { localStorage.setItem(POS_KEY, JSON.stringify(drag.pos)); } catch {}
      drag = null;
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
    // 두 번 탭하면 원래 자리(아래 가운데)로 돌아간다.
    bar.addEventListener('dblclick', event => {
      if (event.target.closest('button')) return;
      Object.assign(bar.style, { left: '', top: '', bottom: '', transform: '' });
      try { localStorage.removeItem(POS_KEY); } catch {}
    });
  }
  window.addEventListener('resize', () => { const bar = $('#restTimer'); if (bar?.style.top) placeBar(bar, parseFloat(bar.style.left), parseFloat(bar.style.top)); });

  function renderEditor() {
    const sheet = $('#wkSheet');
    const fav = favorites().some(item => key(item) === key(editor.name));
    const last = editor.last;
    const lastText = last ? `지난번 ${last.date.slice(5).replace('-', '/')} · ${editor.type === 'c' ? `${last.exercise.minutes || 0}분` : core.setSummary?.(last.exercise) || ''}` : '처음 기록하는 종목이에요';
    const totalVolume = editor.type === 'w' ? editor.sets.reduce((sum, set) => sum + set.w * set.r, 0) : 0;
    sheet.setAttribute('aria-label', `${editor.name} 기록`);
    saveDraft();
    sheet.innerHTML = `
      <header class="wk-sheet-head"><button type="button" class="wk-icon" data-wk-close aria-label="닫기">←</button><button type="button" class="wk-icon star ${fav ? 'on' : ''}" data-wk-fav aria-label="즐겨찾기">${fav ? '★' : '☆'}</button>
        <span>${editor.part === '기타' ? '유산소·기타' : editor.part === '복근' ? '복근·코어' : editor.part}</span><h2>${esc(editor.name)}</h2><p>${esc(lastText)}</p></header>
      <div class="wk-sheet-body">
        ${editor.type === 'c' ? `
          <div class="wk-row"><span>운동 시간</span><div class="wk-num"><button type="button" data-wk-adj="minutes" data-d="-5">−</button><input inputmode="numeric" data-wk-field="minutes" value="${editor.minutes}"><em>분</em><button type="button" data-wk-adj="minutes" data-d="5">＋</button></div></div>
          <div class="wk-row"><span>거리 <small>선택</small></span><div class="wk-num"><button type="button" data-wk-adj="km" data-d="-0.5">−</button><input inputmode="decimal" data-wk-field="km" value="${editor.km || ''}" placeholder="0"><em>km</em><button type="button" data-wk-adj="km" data-d="0.5">＋</button></div></div>
          <div class="wk-row"><span>운동 강도</span><div class="wk-chips">${INTENSITY.map(([label]) => `<button type="button" class="${editor.intensity === label ? 'on' : ''}" data-wk-intensity="${label}">${label}</button>`).join('')}</div></div>`
        : `
          <div class="wk-sets">${editor.sets.map((set, index) => `
            <div class="wk-set ${set.done ? 'done' : ''}"><button type="button" class="wk-set-no" data-wk-done="${index}" aria-label="${index + 1}세트 완료">${set.done ? '✓' : index + 1}</button>
              ${editor.type === 'w' ? `<div class="wk-num"><button type="button" data-wk-set="${index}" data-k="w" data-d="${-weightStep()}">−</button><input inputmode="decimal" data-wk-set-input="${index}" data-k="w" value="${set.w}"><em>kg</em><button type="button" data-wk-set="${index}" data-k="w" data-d="${weightStep()}">＋</button></div>` : ''}
              <div class="wk-num"><button type="button" data-wk-set="${index}" data-k="r" data-d="-1">−</button><input inputmode="numeric" data-wk-set-input="${index}" data-k="r" value="${set.r}"><em>회</em><button type="button" data-wk-set="${index}" data-k="r" data-d="1">＋</button></div>
              <button type="button" class="wk-set-del" data-wk-set-del="${index}" aria-label="${index + 1}세트 지우기" ${editor.sets.length < 2 ? 'disabled' : ''}>×</button>
            </div>`).join('')}</div>
          <div class="wk-row wk-rest"><span>쉬는 시간 <small>${readState().profile?.restTimes?.[key(editor.name)] ? '내가 정한 시간' : '자동'} · 세트 번호를 누르면 시작</small></span><div class="wk-num"><button type="button" data-wk-rest="-15">−</button><b class="wk-rest-val">${clock(restFor(editor.name, editor.sets))}</b><button type="button" data-wk-rest="15">＋</button></div></div>
          <div class="wk-set-actions"><button type="button" data-wk-add-set>＋ 세트 추가</button>${editor.type === 'w' ? `<button type="button" data-wk-bump>전체 ${weightStep()}kg 올리기</button>` : ''}</div>
          ${totalVolume ? `<p class="wk-volume">총 볼륨 <b>${totalVolume.toLocaleString()}kg</b> · ${editor.sets.length}세트</p>` : ''}
          <div class="wk-row"><span>운동 시간 ${editor.minutesAuto ? '<small>세트 수로 자동</small>' : ''}</span><div class="wk-num"><button type="button" data-wk-adj="minutes" data-d="-5">−</button><input inputmode="numeric" data-wk-field="minutes" value="${editor.minutesAuto ? autoMinutes(editor.sets) : editor.minutes}"><em>분</em><button type="button" data-wk-adj="minutes" data-d="5">＋</button></div></div>
          <div class="wk-rpe"><div class="wk-rpe-head"><span>강도 RPE</span><small>${editor.rpe ? `${RPE.find(([value]) => value === editor.rpe)?.[1]} · ${RPE.find(([value]) => value === editor.rpe)?.[2]}` : '마지막 세트가 얼마나 힘들었나요?'}</small></div><div class="wk-rpe-chips">${RPE.map(([value, label]) => `<button type="button" class="${editor.rpe === value ? 'on' : ''}" data-wk-rpe="${value}"><b>${value}</b><small>${label}</small></button>`).join('')}</div></div>`}
      </div>
      <footer class="wk-sheet-foot"><button type="button" class="wk-put" data-wk-put>${editor.index != null ? '수정 완료' : '목록에 담기'}</button></footer>`;
  }

  function onEditorInput(event) {
    const field = event.target.dataset.wkField;
    if (field) { editor[field] = Math.max(0, +String(event.target.value).replace(',', '.') || 0); if (field === 'minutes') editor.minutesAuto = false; saveDraft(); return; }
    const index = event.target.dataset.wkSetInput;
    if (index != null) editor.sets[+index][event.target.dataset.k] = Math.max(0, +String(event.target.value).replace(',', '.') || 0);
    saveDraft();
  }

  function onEditorClick(event) {
    if (event.target.closest('[data-wk-close]')) { closeEditor(); return; }
    const doneButton = event.target.closest('[data-wk-done]');
    if (doneButton) {
      const set = editor.sets[+doneButton.dataset.wkDone];
      set.done = !set.done;
      renderEditor();
      if (set.done) startRest(editor.name, restFor(editor.name, editor.sets));
      return;
    }
    const restButton = event.target.closest('[data-wk-rest]');
    if (restButton) {
      saveRest(editor.name, Math.min(600, Math.max(15, restFor(editor.name, editor.sets) + +restButton.dataset.wkRest)));
      renderEditor();
      return;
    }
    if (event.target.closest('[data-wk-fav]')) { toggleFavorite(editor.name); renderEditor(); renderTabs(); renderGrid(); return; }
    const adj = event.target.closest('[data-wk-adj]');
    if (adj) {
      const field = adj.dataset.wkAdj;
      if (field === 'minutes' && editor.minutesAuto) { editor.minutes = autoMinutes(editor.sets); editor.minutesAuto = false; }
      editor[field] = Math.max(0, Math.round((+editor[field] + +adj.dataset.d) * 10) / 10);
      renderEditor();
      return;
    }
    const rpe = event.target.closest('[data-wk-rpe]');
    if (rpe) { editor.rpe = editor.rpe === +rpe.dataset.wkRpe ? null : +rpe.dataset.wkRpe; renderEditor(); return; }
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
      const sets = editor.sets.filter(set => set.r > 0);
      const minutes = editor.type !== 'c' && editor.minutesAuto ? autoMinutes(sets) : editor.minutes;
      // 계획에서 담은 종목도 한 번 열어 고치면 실제 기록으로 본다.
      const item = { name: editor.name, type: editor.type, sets, minutes, minutesAuto: editor.minutesAuto, rpe: editor.type === 'c' ? INTENSITY.find(([label]) => label === editor.intensity)?.[1] : editor.rpe, km: editor.km, intensity: editor.intensity };
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
    saveDraft();
  }

  // ---- 최종 저장: 담은 운동을 기존 입력칸으로 옮겨 기존 저장 로직을 그대로 쓴다 ----
  function beforeSave() {
    if (!cart.length) return;
    const note = $('#workoutNote');
    if (!note) return;
    const typed = note.value.trim();
    note.value = [typed, ...cart.map(cartLine)].filter(Boolean).join('\n');
    note.dispatchEvent(new Event('input', { bubbles: true }));
    // 마무리의 운동 시간·강도를 비워 두었으면 종목별 값으로 채운다(시간은 합계, 강도는 평균).
    const minutesInput = $('#workoutMinutes');
    if (minutesInput && !minutesInput.value.trim()) minutesInput.value = cart.reduce((sum, item) => sum + (+item.minutes || 0), 0) || '';
    const rpes = cart.map(item => +item.rpe).filter(Boolean);
    if (rpes.length && !document.querySelector('[data-rpe].on')) {
      const rpe = Math.min(10, Math.max(5, Math.round(rpes.reduce((sum, value) => sum + value, 0) / rpes.length)));
      document.querySelector(`[data-rpe="${rpe}"]`)?.click();
    }
    const saved = cart.map(item => ({ ...item }));
    const edit = editInfo;
    const date = edit?.date || $('#workoutDate')?.value || core.dateKey(new Date());
    // 저장이 끝나 입력칸이 비워지면, 방금 저장(또는 수정)한 기록에 종목별 시간·강도를 붙이고 담은 목록을 비운다.
    setTimeout(() => {
      if ($('#workoutNote').value.trim()) return;
      const state = readState();
      const list = state.logs?.[date]?.workouts || [];
      const workout = edit ? list.find(item => item.id === edit.id) : list.at(-1);
      if (workout?.exercises?.length) {
        const used = new Set();
        saved.forEach(item => {
          const index = workout.exercises.findIndex((exercise, i) => !used.has(i) && key(exercise.name) === key(item.name));
          if (index < 0) return;
          used.add(index);
          if (item.rpe) workout.exercises[index].rpe = item.rpe;
          if (item.type !== 'c' && item.minutes) workout.exercises[index].minutes = item.minutes;
        });
        writeState(state);
        window.dispatchEvent(new CustomEvent('fitlog:state-updated'));
      }
      cart = [];
      renderCart();
      renderGrid();
    }, 150);
  }

  // 보관함에서 "수정"을 누르면 기록한 종목을 담은 운동으로 되돌려, 종목을 눌러 세트를 고칠 수 있게 한다.
  window.addEventListener('fitlog:workout-edit', event => {
    const { date, id, exercises } = event.detail || {};
    if (!$('#wkPicker') || !exercises?.length) return;
    editInfo = { date, id };
    cart = exercises.map(cartFromExercise);
    const note = $('#workoutNote');
    if (note) note.value = '';
    if (editor) closeEditor();
    renderCart();
    renderGrid();
    setTimeout(() => $('#wkCart')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  });
  // "이 계획으로 기록": 계획의 종목·무게·세트를 담은 운동으로 넣는다(이미 담은 종목은 그대로 둔다).
  window.addEventListener('fitlog:plan-prefill', event => {
    const handoff = event.detail;
    const day = handoff?.day;
    if (!$('#wkPicker') || !day) return;
    const firstNumber = value => parseInt(String(value || '').match(/\d+/)?.[0], 10) || 0;
    const items = (day.exercises || []).map(exercise => {
      const name = exercise.name;
      const sets = Math.max(1, Math.round(+exercise.sets || 3));
      const type = typeOf(name) || (+exercise.weight > 0 ? 'w' : /초|분/.test(exercise.reps) ? 'c' : 'w');
      if (type === 'c') {
        const amount = firstNumber(exercise.reps);
        const minutes = /초/.test(exercise.reps) ? Math.max(1, Math.ceil(amount * sets / 60)) : amount || 10;
        return { name, type, sets: [], minutes, minutesAuto: false, rpe: 7, km: 0, intensity: '적당히', plan: true };
      }
      const reps = firstNumber(exercise.reps) || 10;
      const list = Array.from({ length: sets }, () => ({ w: type === 'w' ? +exercise.weight || 0 : 0, r: reps }));
      return { name, type, sets: list, minutes: autoMinutes(list), minutesAuto: true, rpe: null, km: 0, intensity: '적당히', plan: true };
    });
    const cardio = String(day.cardio || '').match(/([가-힣a-zA-Z()· ]+?)\s*(\d+)\s*분/);
    if (cardio) items.push({ name: cardio[1].trim(), type: 'c', sets: [], minutes: +cardio[2], minutesAuto: false, rpe: day.focus === '축구' ? 8 : 7, km: 0, intensity: day.focus === '축구' ? '격하게' : '적당히', plan: true });
    if (!items.length) return;
    const have = new Set(cart.map(item => key(item.name)));
    cart.push(...items.filter(item => !have.has(key(item.name))));
    const note = $('#workoutNote');
    if (note) note.value = '';
    if (editor) closeEditor();
    handoff.handled = true;
    renderCart();
    renderGrid();
  });

  window.addEventListener('fitlog:workout-edit-end', () => {
    editInfo = null;
    cart = [];
    renderCart();
    renderGrid();
  });

  install();
  window.addEventListener('fitlog:state-updated', () => { if ($('#wkPicker') && !editor) { renderTabs(); renderGrid(); } });
})();
