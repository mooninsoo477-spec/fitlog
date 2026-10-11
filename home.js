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
        <div class="hm-panel-head"><div><small class="hm-eyebrow">TODAY'S PLATE</small><h2>오늘의 식탁</h2><p class="hm-sub" id="hmMealSub"></p></div><button type="button" class="hm-link" data-hm-go="meals">기록 ›</button></div>
        <div id="homeLunchSlot" class="hm-lunch"></div>
        <div class="hm-meal-grid" id="hmMealGrid"></div>
        <div id="hmQuick"></div>
        <div id="hmWater"></div>
        <div class="hm-week" id="hmWeekSlot"></div>
      </section>
      <section class="hm-panel hm-workout">
        <div class="hm-panel-head"><div><small class="hm-eyebrow">TODAY'S SWEAT</small><h2>오늘의 땀</h2><p class="hm-sub" id="hmWorkoutSub"></p></div><button type="button" class="hm-link" data-hm-go="workout">기록 ›</button></div>
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
      if (event.target.closest('[data-hm-coach]')) { $('#recommend')?.click(); return; }
      const qf = event.target.closest('[data-qf]');
      if (qf) { addQuickFood(qf.dataset.qf, mealByHour(), viewDate); return; }
      const water = event.target.closest('[data-hm-water]');
      if (water) setWater(+water.dataset.hmWater);
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
      let soccer = 0;
      const isSoccer = w => /축구|풋살/.test(`${w.group || ''} ${w.note || ''}`) && !(w.exercises || []).some(e => !e.cardio && e.sets);
      for (let k = monday; k <= today; k = addDays(k, 1)) { const list = state.logs?.[k]?.workouts || []; if (list.some(w => !isSoccer(w))) done++; if (list.some(isSoccer)) soccer++; }
      const goal = +(state.profile?.workoutGoal || 5);
      info.innerHTML = `<b>${done}</b><span>/ ${goal}회 근력${soccer ? ` · 축구 ${soccer}` : ''}</span><div class="rec-bar"><i style="width:${Math.min(100, done / goal * 100)}%"></i></div>`;
    }
    document.querySelectorAll('.meal-type-tabs label').forEach(label => {
      const span = label.querySelector('span');
      const type = label.querySelector('input')?.value;
      if (span && ICONS[type] && !span.querySelector('svg')) span.insertAdjacentHTML('afterbegin', ICONS[type]);
    });
  }

  // ---- 자주 먹는 음식: 한 번 눌러 바로 기록 ----
  const mealByHour = () => { const h = new Date().getHours(); return h < 10 ? '아침' : h < 15 ? '점심' : h < 21 ? '저녁' : '간식'; };

  function frequentFoods(state) {
    const counts = new Map();
    Object.keys(state.logs || {}).sort().slice(-45).forEach(date => (state.logs[date].meals || []).forEach(meal => {
      if (!meal?.name || meal.src === 'lunch' || !(+meal.kcal > 0)) return;
      const k = meal.name.replace(/\s+/g, '');
      const prev = counts.get(k);
      counts.set(k, { meal, count: (prev?.count || 0) + 1, last: date });
    }));
    return [...counts.values()].filter(item => item.count >= 2).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, 10).map(item => item.meal);
  }

  function quickFoodsMarkup(state, label) {
    const foods = frequentFoods(state);
    if (!foods.length) return '';
    return `<div class="qf"><div class="qf-head"><b>자주 먹는 음식</b><small>${label}</small></div><div class="qf-chips">${foods.map(food => `<button type="button" data-qf="${esc(food.name)}"><span>${esc(food.name)}</span><small>${fmt(+food.kcal || 0)}kcal</small></button>`).join('')}</div></div>`;
  }

  function addQuickFood(name, type, date) {
    const state = readState();
    const food = frequentFoods(state).find(item => item.name === name);
    if (!food) return;
    state.logs ||= {};
    const log = state.logs[date] ||= { meals: [], workouts: [] };
    const copy = { ...food, id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, meal: type, updatedAt: new Date().toISOString(), quick: true };
    (log.meals ||= []).push(copy);
    if (log.skipped?.[type]) { log.skipped = { ...log.skipped }; delete log.skipped[type]; }
    core.writeState(state);
    window.dispatchEvent(new CustomEvent('fitlog:state-updated'));
    core.showToast(`${type}에 ${name} ${fmt(+food.kcal || 0)}kcal를 기록했어요.`);
    render();
  }

  // 식사 기록 화면 맨 위에도 같은 칩을 보여준다(위에서 고른 끼니로 기록).
  function renderMealsQuick(state) {
    const composer = $('#aiMealComposer');
    if (!composer) return;
    let box = $('#mealsQuick');
    if (!box) { box = document.createElement('div'); box.id = 'mealsQuick'; composer.prepend(box); }
    box.innerHTML = quickFoodsMarkup(state, '누르면 위에서 고른 끼니로 바로 기록돼요');
  }

  // ---- 물 마시기: 한 컵 250ml, 하루 8컵 ----
  const CUP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12l-1.6 15.2A2 2 0 0 1 14.4 21H9.6a2 2 0 0 1-2-1.8z" fill="currentColor"/></svg>';
  function waterMarkup(state) {
    const cups = +(state.logs?.[viewDate]?.water || 0);
    return `<div class="hm-water"><div class="hm-water-head"><b>물</b><span>${(cups * 0.25).toFixed(2).replace(/0$/, '')}L / 2L</span></div><div class="hm-cups">${Array.from({ length: 8 }, (_, index) => `<button type="button" class="${index < cups ? 'on' : ''}" data-hm-water="${index + 1}" aria-label="물 ${index + 1}컵">${CUP}</button>`).join('')}</div></div>`;
  }
  function setWater(cups) {
    const state = readState();
    state.logs ||= {};
    const log = state.logs[viewDate] ||= { meals: [], workouts: [] };
    log.water = +(log.water || 0) === cups ? cups - 1 : cups;
    core.writeState(state);
    window.dispatchEvent(new CustomEvent('fitlog:state-updated'));
    if (log.water === 8) core.showToast('오늘 물 2L 달성!');
    render();
  }

  // ---- 주간 배지 ----
  const BADGE_ICON = {
    lift: '<path d="M5 9v6M19 9v6M2 11v2M22 11v2M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/>',
    protein: '<ellipse cx="12" cy="13" rx="6" ry="7.5" fill="currentColor"/>',
    kcal: '<path d="M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9.5z" fill="currentColor"/>',
    water: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" fill="currentColor"/>',
    checkin: '<circle cx="12" cy="12" r="5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    soccer: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z" fill="currentColor"/>'
  };
  function weekBadges(state, weekStart) {
    const today = dateKey(new Date());
    const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).filter(date => date <= today);
    const targets = state.profile?.targets || {};
    const kcalTarget = +targets.kcal || 2200;
    const proteinTarget = +targets.protein || 150;
    const goal = +(state.profile?.workoutGoal || 5);
    const isSoccer = w => /축구|풋살/.test(`${w.group || ''} ${w.note || ''}`) && !(w.exercises || []).some(e => !e.cardio && e.sets);
    let lift = 0, protein = 0, kcalOk = 0, water = 0, checkin = 0, soccer = 0;
    days.forEach(date => {
      const log = state.logs?.[date] || {};
      const meals = log.meals || [];
      if ((log.workouts || []).some(w => !isSoccer(w))) lift++;
      if ((log.workouts || []).some(isSoccer)) soccer++;
      if (meals.length && sum(meals, 'protein') >= proteinTarget * 0.9) protein++;
      if (meals.length && Math.abs(sum(meals, 'kcal') - kcalTarget) <= kcalTarget * 0.1) kcalOk++;
      if (+log.water >= 8) water++;
      if (+log.weight && +log.sleep && log.condition) checkin++;
    });
    return [
      { id: 'lift', name: '근력 목표', detail: `${lift}/${goal}회`, earned: lift >= goal, color: '#5b8def' },
      { id: 'protein', name: '단백질 5일', detail: `${protein}/5일`, earned: protein >= 5, color: '#f2b13c' },
      { id: 'kcal', name: '칼로리 지킴', detail: `${kcalOk}/5일`, earned: kcalOk >= 5, color: '#ff7a5c' },
      { id: 'water', name: '물 2L', detail: `${water}/5일`, earned: water >= 5, color: '#26b5c9' },
      { id: 'checkin', name: '체크인 개근', detail: `${checkin}/6일`, earned: checkin >= 6, color: '#ffc83d' },
      { id: 'soccer', name: '축구', detail: soccer ? `${soccer}회` : '0회', earned: soccer >= 1, color: '#2fbf8f' }
    ];
  }
  function badgesMarkup(state, weekStart, title = '이번 주 배지') {
    const list = weekBadges(state, weekStart);
    const earned = list.filter(item => item.earned).length;
    return `<div class="badges"><div class="badges-head"><b>${title}</b><span>${earned}/${list.length}개 획득</span></div><div class="badge-grid">${list.map(item => {
      // "3/5회"처럼 진행도가 있으면 아직 못 딴 배지 밑에 막대로 보여준다.
      const [done, need] = (item.detail.match(/(\d+)\/(\d+)/) || []).slice(1).map(Number);
      const bar = !item.earned && need ? `<span class="badge-bar"><i style="--p:${Math.min(100, Math.round(done / need * 100))}%"></i></span>` : '';
      return `<div class="badge-item ${item.earned ? 'on' : ''}" style="--c:${item.color}"><i><svg viewBox="0 0 24 24" aria-hidden="true">${BADGE_ICON[item.id]}</svg></i><b>${item.name}</b><small>${item.detail}</small>${bar}</div>`;
    }).join('')}</div></div>`;
  }
  // 일요일엔 이번 주, 월요일엔 지난주 결과를 홈 맨 위에 축하 카드로 보여준다(닫으면 그 주는 안 뜸).
  function renderBadgeCard(state) {
    const day = new Date().getDay();
    const thisMonday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dateKey(d); })();
    const week = day === 1 ? addDays(thisMonday, -7) : thisMonday;
    let card = $('#hmBadgeCard');
    const hidden = (() => { try { return localStorage.getItem('fitlog:badgeSeen') === week; } catch { return false; } })();
    const show = (day === 0 || day === 1) && viewDate === dateKey(new Date()) && !hidden && weekBadges(state, week).some(item => item.earned);
    if (!show) { card?.remove(); return; }
    if (!card) {
      card = document.createElement('section');
      card.id = 'hmBadgeCard';
      card.className = 'hm-panel hm-badge-card';
      $('#hmHero')?.before(card);
      card.addEventListener('click', event => {
        if (!event.target.closest('[data-badge-close]')) return;
        try { localStorage.setItem('fitlog:badgeSeen', card.dataset.week); } catch {}
        card.remove();
      });
    }
    card.dataset.week = week;
    card.innerHTML = `<button type="button" class="hm-badge-close" data-badge-close aria-label="닫기">×</button>${badgesMarkup(state, week, day === 1 ? '지난주 결과' : '이번 주 결과')}`;
  }

  // ---- 숫자가 바뀔 때 부드럽게 올라가는 효과 ----
  const lastNumbers = new Map();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function countUp(selector) {
    document.querySelectorAll(selector).forEach((el, index) => {
      const node = [...el.childNodes].find(child => child.nodeType === 3 && /\d/.test(child.textContent));
      if (!node) return;
      const raw = node.textContent;
      const target = +raw.replace(/[^\d.-]/g, '');
      if (!Number.isFinite(target)) return;
      const keyName = `${selector}#${index}`;
      const from = lastNumbers.get(keyName);
      lastNumbers.set(keyName, target);
      if (reduceMotion || from == null || from === target) return;
      const decimals = (raw.split('.')[1] || '').replace(/\D/g, '').length;
      const start = performance.now();
      const step = now => {
        const p = Math.min(1, (now - start) / 600);
        const value = from + (target - from) * (1 - Math.pow(1 - p, 3));
        node.textContent = raw.replace(/-?[\d,]+(\.\d+)?/, decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString());
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  let lastArc = null;
  function animateGauge() {
    const arc = document.querySelector('.hm-gauge path[stroke^="url"]');
    if (!arc) { lastArc = 0; return; }
    const [fill, total] = arc.getAttribute('stroke-dasharray').split(' ').map(Number);
    if (!reduceMotion && lastArc != null && Math.abs(lastArc - fill) > 1) {
      const from = lastArc;
      const start = performance.now();
      const step = now => {
        const p = Math.min(1, (now - start) / 700);
        arc.setAttribute('stroke-dasharray', `${(from + (fill - from) * (1 - Math.pow(1 - p, 3))).toFixed(1)} ${total}`);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    lastArc = fill;
  }

  // 패널 제목 아래 한 줄 요약
  function renderSubs(state) {
    const log = state.logs?.[viewDate] || {};
    const meals = log.meals || [];
    const eatenTypes = MEALS.filter(type => meals.some(meal => (meal.meal || '간식') === type)).length;
    const fasted = Object.keys(log.skipped || {}).length;
    const mealSub = $('#hmMealSub');
    if (mealSub) mealSub.textContent = meals.length ? `${eatenTypes}끼 · ${fmt(sum(meals, 'kcal'))}kcal${fasted ? ` · 단식 ${fasted}` : ''}` : fasted ? `단식 ${fasted}끼` : '아직 기록 전이에요';
    const start = (() => { const d = new Date(`${viewDate}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dateKey(d); })();
    let lift = 0, soccer = 0;
    for (let k = start; k <= viewDate; k = addDays(k, 1)) {
      const list = state.logs?.[k]?.workouts || [];
      const isSoccer = w => /축구|풋살/.test(`${w.group || ''} ${w.note || ''}`) && !(w.exercises || []).some(e => !e.cardio && e.sets);
      if (list.some(w => !isSoccer(w))) lift++;
      if (list.some(isSoccer)) soccer++;
    }
    const workoutSub = $('#hmWorkoutSub');
    if (workoutSub) workoutSub.textContent = `이번 주 근력 ${lift}/${+(state.profile?.workoutGoal || 5)}회${soccer ? ` · 축구 ${soccer}회` : ''}`;
  }

  function render() {
    if (!$('#homeDash')) return;
    const state = readState();
    renderRecordHeaders(state);
    renderDates();
    renderHero(state);
    renderMeals(state);
    renderWorkout(state);
    renderSubs(state);
    $('#hmQuick').innerHTML = viewDate === dateKey(new Date()) ? quickFoodsMarkup(state, `누르면 ${mealByHour()}으로 바로 기록`) : '';
    $('#hmWater').innerHTML = waterMarkup(state);
    renderMealsQuick(state);
    renderBadgeCard(state);
    countUp('.hm-total strong, .hm-gauge-center b, .rec-info b, .hm-meal strong');
    animateGauge();
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
  // 식사 기록 화면의 자주 먹는 음식 칩: 위에서 고른 끼니로 오늘에 기록
  document.addEventListener('click', event => {
    const qf = event.target.closest('#mealsQuick [data-qf]');
    if (!qf) return;
    addQuickFood(qf.dataset.qf, $('[name="aiMealType"]:checked')?.value || mealByHour(), dateKey(new Date()));
  });
  window.FitLogHome = { render, badgesMarkup, countUp };
  // 리포트가 먼저 그려졌다면 배지를 넣어 한 번 더 그린다.
  core.renderCoachBoard?.();
})();
