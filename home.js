(() => {
  'use strict';

  // 홈 화면: 날짜 줄 → 오늘의 칼로리(게이지) → 먹었어요(아침·점심·저녁·간식, 평일엔 급식 먼저) → 운동했어요
  const core = window.FitLogCore;
  if (!core) return;
  const { readState, dateKey, esc, goTo } = core;
  const $ = (selector, root = document) => root.querySelector(selector);
  const DAY = ['일', '월', '화', '수', '목', '금', '토'];
  const MEALS = ['아침', '점심', '저녁', '간식'];
  const addDays = (key, days) => { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + days); return dateKey(date); };
  const md = key => `${+key.slice(5, 7)}.${+key.slice(8, 10)}`;
  const weekday = key => DAY[new Date(`${key}T12:00:00`).getDay()];
  const sum = (list, key) => list.reduce((total, item) => total + (+item[key] || 0), 0);
  const fmt = value => Math.round(value).toLocaleString();
  let viewDate = dateKey(new Date());

  const ICONS = {
    아침: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="9" fill="#ffd23f"/><g stroke="#ffd23f" stroke-width="3" stroke-linecap="round"><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M11.3 36.7l3.5-3.5M33.2 14.8l3.5-3.5"/></g></svg>',
    점심: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="18" cy="18" r="8" fill="#ffd23f"/><g stroke="#ffd23f" stroke-width="2.6" stroke-linecap="round"><path d="M18 4v4M4 18h4M8 8l2.8 2.8M28 8l-2.8 2.8"/></g><path d="M6 38c4-9 9-14 15-14 5 0 8 3 11 7 2-2 4-3 6-3 4 0 6 4 6 10z" fill="#5fb54a"/></svg>',
    저녁: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M30 8a16 16 0 1 0 10 28A14 14 0 0 1 30 8z" fill="#9fb8e8"/></svg>',
    간식: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 22l30-8v24H8z" fill="#c98b5e"/><path d="M8 22l30-8v6L8 28z" fill="#8a5a3a"/><path d="M8 31h30v3H8z" fill="#8a5a3a"/><circle cx="31" cy="12" r="3.5" fill="#ff5a3c"/></svg>'
  };
  const CHECK = '<svg class="hm-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9.5z" fill="#ff7a45"/></svg>';

  function install() {
    const home = $('[data-view="home"] .content');
    if (!home || $('#homeDash')) return;
    const dash = document.createElement('div');
    dash.id = 'homeDash';
    dash.innerHTML = `
      <nav class="hm-dates" aria-label="날짜 선택"></nav>
      <section class="hm-panel hm-hero" id="hmHero"></section>
      <section class="hm-panel hm-meals">
        <div class="hm-panel-head"><h2>먹었어요</h2><button type="button" class="hm-link" data-hm-go="meals">식사 기록 ›</button></div>
        <div id="homeLunchSlot" class="hm-lunch"></div>
        <div class="hm-meal-grid" id="hmMealGrid"></div>
        <div class="hm-week" id="hmWeekSlot"></div>
      </section>
      <section class="hm-panel hm-workout">
        <div class="hm-panel-head"><h2>운동했어요</h2><button type="button" class="hm-link" data-hm-go="workout">운동 기록 ›</button></div>
        <div id="hmWorkoutSlot"></div>
        <div id="hmWorkoutPast"></div>
      </section>`;
    home.prepend(dash);
    // 로그인 안내 띠는 맨 위에 둔다.
    const banner = $('#loginBanner');
    if (banner) home.prepend(banner);
    // 아침 체크인은 날짜 줄 바로 아래(게이지 위)에 작게 둔다.
    const checkin = $('#checkin');
    if (checkin) dash.querySelector('.hm-dates').after(checkin);
    // 오늘 운동 카드(계획·7일 줄), 급식 카드, 최근 7일 섭취는 새 자리로 먼저 옮긴다.
    const planHero = $('#planHero');
    if (planHero) $('#hmWorkoutSlot').append(planHero);
    const lunch = $('#lunchGuide');
    if (lunch) $('#homeLunchSlot').append(lunch);
    const week = $('#kcalWeek');
    if (week) $('#hmWeekSlot').append(week);
    // 남은 기존 홈 요소는 다른 화면 코드가 값을 써 넣으므로 지우지 않고 숨긴다.
    [...home.children].forEach(child => {
      if (child !== dash && child.id !== 'loginBanner') child.classList.add('hm-old');
    });

    dash.addEventListener('click', event => {
      const day = event.target.closest('[data-hm-date]');
      if (day && !day.disabled) { viewDate = day.dataset.hmDate; render(); return; }
      const go = event.target.closest('[data-hm-go]');
      if (go) { goTo(go.dataset.hmGo); return; }
      const skip = event.target.closest('[data-hm-skip]');
      if (skip) { toggleSkip(skip.dataset.hmSkip); return; }
      const meal = event.target.closest('[data-hm-meal]');
      if (meal) { openMeal(meal.dataset.hmMeal); return; }
      if (event.target.closest('[data-hm-coach]')) { $('#recommend')?.click(); }
    });
    render();
  }

  // 건너뛴 끼니(단식)를 날짜별로 기록한다. 다시 누르면 취소.
  function toggleSkip(type) {
    const state = readState();
    state.logs ||= {};
    const log = state.logs[viewDate] ||= { meals: [], workouts: [] };
    log.skipped = { ...(log.skipped || {}) };
    if (log.skipped[type]) delete log.skipped[type]; else log.skipped[type] = new Date().toISOString();
    core.writeState(state);
    window.dispatchEvent(new CustomEvent('fitlog:state-updated'));
    core.showToast(log.skipped[type] ? `${type}은 건너뛰었다고 기록했어요.` : `${type} 건너뛰기를 취소했어요.`);
    render();
  }

  // 끼니 카드를 누르면 식사 화면을 그 끼니(지난 날짜면 그 날짜)로 연다.
  function openMeal(type) {
    const today = dateKey(new Date());
    goTo('meals');
    setTimeout(() => {
      if (viewDate === today) {
        const radio = $(`[name="aiMealType"][value="${type}"]`);
        if (radio) radio.checked = true;
        $('#aiMealComposer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('#aiMealText')?.focus({ preventScroll: true });
      } else {
        $(`[data-meal-day="${viewDate}"]`)?.click();
        setTimeout(() => {
          const select = $('#mealAiType');
          if (select) { select.value = type; select.dispatchEvent(new Event('change', { bubbles: true })); }
          $('#mealDays')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      }
    }, 80);
  }

  function renderDates() {
    const today = dateKey(new Date());
    const prev = addDays(viewDate, -1);
    const next = addDays(viewDate, 1);
    const label = key => key === today ? '오늘' : weekday(key);
    $('#homeDash .hm-dates').innerHTML = `
      <button type="button" class="hm-date side" data-hm-date="${prev}" aria-label="이전 날">${md(prev)} ${label(prev)}</button>
      <button type="button" class="hm-date main" data-hm-date="${today}" aria-label="오늘로">${md(viewDate)} <b>${viewDate === today ? '오늘' : weekday(viewDate)}</b></button>
      <button type="button" class="hm-date side" data-hm-date="${next}" ${next > today ? 'disabled' : ''} aria-label="다음 날">${md(next)} ${label(next)}</button>`;
  }

  function gauge(ratio, over) {
    // 반원 게이지: 바탕 호 + 먹은 만큼 채워지는 호
    const r = 108, cx = 130, cy = 130, length = Math.PI * r;
    const fill = Math.max(0, Math.min(1, ratio)) * length;
    return `<svg class="hm-gauge" viewBox="0 0 260 150" aria-hidden="true">
      <defs><linearGradient id="hmArc" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${over ? '#ff5b3a' : '#2fbf8f'}"/><stop offset="1" stop-color="${over ? '#ffb38a' : '#b9f0a8'}"/></linearGradient></defs>
      <path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="#ffffff1f" stroke-width="22" stroke-linecap="round"/>
      ${fill > 0 ? `<path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="url(#hmArc)" stroke-width="22" stroke-linecap="round" stroke-dasharray="${fill.toFixed(1)} ${length.toFixed(1)}"/>` : ''}
    </svg>`;
  }

  function renderHero(state) {
    const log = state.logs?.[viewDate] || {};
    const meals = log.meals || [];
    const targets = state.profile?.targets || {};
    const target = +targets.kcal || 2200;
    const kcal = sum(meals, 'kcal');
    const macro = { carbs: sum(meals, 'carbs'), protein: sum(meals, 'protein'), fat: sum(meals, 'fat') };
    const macroKcal = macro.carbs * 4 + macro.protein * 4 + macro.fat * 9;
    const pct = value => macroKcal ? Math.round(value / macroKcal * 100) : 0;
    const burned = (log.workouts || []).reduce((total, workout) => total + (+workout.burnKcal || 0), 0);
    const diff = Math.round(kcal - target);
    const over = diff > 0;
    const bar = (name, value, goal) => `<div class="hm-macro"><span>${name}</span><div class="hm-bar"><i style="width:${goal ? Math.min(100, value / goal * 100) : 0}%" class="${goal && value > goal * 1.1 ? 'over' : ''}"></i></div><b><em class="${goal && value > goal * 1.1 ? 'over' : ''}">${fmt(value)}</em> / ${fmt(goal || 0)}g</b></div>`;
    $('#hmHero').innerHTML = `
      <div class="hm-total"><strong>${fmt(kcal)}</strong><button type="button" class="hm-target" data-goal-wizard aria-label="목표 칼로리 설정">/ ${fmt(target)} kcal</button></div>
      <div class="hm-ratio"><span><i class="c">탄</i>${pct(macro.carbs * 4)}<small>%</small></span><span><i class="p">단</i>${pct(macro.protein * 4)}<small>%</small></span><span><i class="f">지</i>${pct(macro.fat * 9)}<small>%</small></span></div>
      <div class="hm-gauge-wrap">${gauge(kcal / target, over)}<div class="hm-gauge-center"><b class="${over ? 'over' : ''}">${fmt(Math.abs(diff))}</b><span>${kcal === 0 ? '아직 기록 전이에요' : over ? 'kcal 초과했어요' : 'kcal 더 먹을 수 있어요'}</span></div></div>
      <p class="hm-burn">${FLAME}<b>${fmt(burned)}kcal</b> 소모 <i>|</i> 목표 대비 <b class="${over ? 'over' : ''}">${kcal ? `${Math.round(kcal / target * 100)}%` : '0%'}</b></p>
      <div class="hm-macros">${bar('탄수화물', macro.carbs, +targets.carbs)}${bar('단백질', macro.protein, +targets.protein)}${bar('지방', macro.fat, +targets.fat)}</div>
      ${viewDate === dateKey(new Date()) ? '<button type="button" class="hm-coach" data-hm-coach><span>오늘 남은 끼니 어떻게 먹을까?</span><b>AI 추천 ›</b></button>' : ''}`;
  }

  function renderMeals(state) {
    const meals = state.logs?.[viewDate]?.meals || [];
    const skipped = state.logs?.[viewDate]?.skipped || {};
    $('#hmMealGrid').innerHTML = MEALS.map(type => {
      const list = meals.filter(meal => (meal.meal || '간식') === type);
      const names = list.map(meal => meal.name).filter(Boolean);
      const skip = !list.length && skipped[type];
      // 카드 전체는 기록 열기, 오른쪽 아래 작은 버튼은 건너뛰기/취소(버튼 안에 버튼을 넣지 않도록 나란히 둔다).
      return `<div class="hm-meal-wrap"><button type="button" class="hm-meal ${list.length || skip ? 'done' : ''} ${skip ? 'skip' : ''}" data-hm-meal="${type}">
        <span class="hm-meal-icon">${ICONS[type]}</span>${list.length || skip ? CHECK : '<span class="hm-plus" aria-hidden="true">＋</span>'}
        <span class="hm-meal-name">${type}</span>
        <strong>${list.length ? `${fmt(sum(list, 'kcal'))}<small>kcal</small>` : skip ? '<small class="hm-fast">단식했어요</small>' : '<small>기록하기</small>'}</strong>
        ${names.length ? `<span class="hm-meal-foods">${esc(names.slice(0, 3).join(', '))}${names.length > 3 ? ` 외 ${names.length - 3}` : ''}</span>` : ''}
      </button>${list.length ? '' : `<button type="button" class="hm-skip" data-hm-skip="${type}">${skip ? '취소' : '건너뛰기'}</button>`}</div>`;
    }).join('');
    // 평일 오늘에는 급식 카드를 끼니 카드 위에 먼저 보여준다.
    const day = new Date(`${viewDate}T12:00:00`).getDay();
    const showLunch = viewDate === dateKey(new Date()) && day >= 1 && day <= 5;
    $('#homeLunchSlot').hidden = !showLunch || !$('#homeLunchSlot').children.length;
  }

  function renderWorkout(state) {
    const today = dateKey(new Date());
    $('#hmWorkoutSlot').hidden = viewDate !== today;
    const past = $('#hmWorkoutPast');
    if (viewDate === today) { past.innerHTML = ''; return; }
    const workouts = state.logs?.[viewDate]?.workouts || [];
    const helpers = window.FitLogCore;
    past.innerHTML = workouts.length ? workouts.map(workout => {
      const exercises = helpers.workoutExercises ? helpers.workoutExercises(workout) : [];
      return `<article class="hm-workout-card"><div class="hm-workout-top"><b>${esc(workout.group || '운동')}</b><span>${[workout.minutes ? `${workout.minutes}분` : '', workout.burnKcal ? `${fmt(workout.burnKcal)}kcal` : ''].filter(Boolean).join(' · ')}</span></div>
        <ul>${exercises.length ? exercises.map(exercise => `<li><span>${esc(exercise.name)}</span><b>${esc(helpers.setSummary(exercise))}</b></li>`).join('') : `<li><span>${esc(workout.note || workout.name || '')}</span></li>`}</ul></article>`;
    }).join('') : `<p class="hm-empty">${md(viewDate)} 운동 기록이 없어요.</p>`;
  }

  // 기록 화면(식사·운동) 머리에 오늘 요약을 보여주고, 끼니 선택 칸에 아이콘을 붙인다.
  function renderRecordHeaders(state) {
    const today = dateKey(new Date());
    const target = +state.profile?.targets?.kcal || 2200;
    const eaten = sum(state.logs?.[today]?.meals || [], 'kcal');
    const mealsHeader = $('[data-view="meals"] header');
    if (mealsHeader) {
      let info = $('#mealsHeaderInfo');
      if (!info) { info = document.createElement('div'); info.id = 'mealsHeaderInfo'; info.className = 'rec-info'; mealsHeader.append(info); }
      info.innerHTML = `<b>${fmt(eaten)}</b><span>/ ${fmt(target)} kcal</span><div class="rec-bar"><i style="width:${Math.min(100, eaten / target * 100)}%"></i></div>`;
    }
    const workoutHeader = $('[data-view="workout"] header');
    if (workoutHeader) {
      let info = $('#workoutHeaderInfo');
      if (!info) { info = document.createElement('div'); info.id = 'workoutHeaderInfo'; info.className = 'rec-info'; workoutHeader.append(info); }
      const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dateKey(d); })();
      let done = 0;
      for (let k = monday; k <= today; k = addDays(k, 1)) if ((state.logs?.[k]?.workouts || []).length) done++;
      const goal = +(state.profile?.workoutGoal || 4);
      info.innerHTML = `<b>${done}</b><span>/ ${goal}회 이번 주</span><div class="rec-bar"><i style="width:${Math.min(100, done / goal * 100)}%"></i></div>`;
    }
    document.querySelectorAll('.meal-type-tabs label').forEach(label => {
      const span = label.querySelector('span');
      const type = label.querySelector('input')?.value;
      if (span && ICONS[type] && !span.querySelector('svg')) span.insertAdjacentHTML('afterbegin', ICONS[type]);
    });
  }

  function render() {
    if (!$('#homeDash')) return;
    const state = readState();
    renderRecordHeaders(state);
    renderDates();
    renderHero(state);
    renderMeals(state);
    renderWorkout(state);
  }

  install();
  // 기록이 바뀌거나 홈으로 돌아올 때, 날짜가 바뀐 뒤 처음 열 때 다시 그린다.
  window.addEventListener('fitlog:state-updated', () => setTimeout(render, 0));
  window.addEventListener('storage', event => { if (event.key === 'fitlog:dashboard:v3') setTimeout(render, 0); });
  window.addEventListener('hashchange', () => { if (location.hash === '#home') { viewDate = dateKey(new Date()) < viewDate ? dateKey(new Date()) : viewDate; render(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  // 식사 저장 등 기존 홈 숫자가 바뀌면(인라인 렌더) 따라서 다시 그린다.
  const kcal = $('#kcal');
  if (kcal) new MutationObserver(() => render()).observe(kcal, { childList: true, characterData: true, subtree: true });
  window.FitLogHome = { render };
})();
