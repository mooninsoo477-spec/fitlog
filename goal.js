(() => {
  'use strict';

  // 목표 칼로리 질문형 설정: 한 화면에 질문 하나, 고르기 위주. 공식으로 계산하고 마지막에 직접 조정할 수 있다.
  const core = window.FitLogCore;
  if (!core) return;
  const { readState, writeState, showToast, esc } = core;
  const $ = (selector, root = document) => root.querySelector(selector);
  const fmt = value => Math.round(value).toLocaleString();

  const ACTIVITY = [
    ['sit', '거의 앉아서 지내요', '사무직 · 공부 · 운전', 1.2],
    ['mixed', '앉고 서기를 반반', '수업·회의 등 서 있는 시간이 꽤 있어요', 1.3],
    ['stand', '주로 서서 걷고 움직여요', '매장·현장 · 하루 8천 보 이상', 1.4],
    ['labor', '몸을 많이 쓰는 일', '물건 나르기 · 체육 · 하루 1만 2천 보 이상', 1.55]
  ];
  const SESSIONS = [['0', '안 해요', 0], ['1-2', '주 1~2회', 1.5], ['3-4', '주 3~4회', 3.5], ['5-6', '주 5~6회', 6], ['7', '매일', 7]];
  const SESSION_LOAD = [
    ['light', '30분 정도 가볍게', '걷기 · 가벼운 웨이트', 4, 0.5],
    ['normal', '1시간 정도 보통으로', '웨이트 위주 · 숨이 찰 때도 있음', 5, 1],
    ['hard', '1시간 넘게 강하게', '고강도 웨이트 · 축구 · 러닝', 6.5, 1.25]
  ];
  const GOALS = [['cut', '체지방 줄이기', '근육은 지키면서 지방을 빼요'], ['keep', '체중 유지하며 몸 만들기', '먹는 양은 그대로, 몸의 구성을 바꿔요'], ['gain', '근육 키우기', '조금 더 먹으면서 근육량을 늘려요']];
  const PACE = {
    cut: [['slow', '천천히', '주 0.25kg · 배고픔이 적어요', -275], ['normal', '보통', '주 0.5kg · 가장 많이 추천', -550], ['fast', '빠르게', '주 0.75kg · 짧은 기간만 추천', -825]],
    gain: [['slow', '천천히', '한 달 0.5kg · 지방 증가 최소', 150], ['normal', '보통', '한 달 1kg · 초보자에게 알맞아요', 300]]
  };

  let answers = {};
  let step = 0;
  let adjust = 0;

  function defaults() {
    const state = readState();
    const info = state.profile?.recommendationContext || {};
    const saved = state.profile?.goalSetup || {};
    const latest = (state.inbody || []).filter(item => !item.excluded && item.date).sort((a, b) => String(a.date).localeCompare(String(b.date))).at(-1) || {};
    const logWeight = Object.keys(state.logs || {}).sort().reverse().map(date => +state.logs[date]?.weight).find(value => value > 20);
    return {
      sex: saved.sex || (info.sex?.startsWith('여') ? 'f' : info.sex ? 'm' : ''),
      age: saved.age || (info.birthYear ? new Date().getFullYear() - +info.birthYear : 30),
      height: saved.height || +info.height || +state.profile?.height || 170,
      weight: logWeight || saved.weight || +info.weight || +latest.weight || 70,
      inbodyPbf: +(latest.pbf ?? latest.bodyFat) || null,
      pbfMode: saved.pbfMode || ((latest.pbf ?? latest.bodyFat) ? 'inbody' : ''),
      pbf: saved.pbf || +(latest.pbf ?? latest.bodyFat) || +info.bodyFat || 20,
      activity: saved.activity || '',
      sessions: saved.sessions || '',
      load: saved.load || '',
      goal: saved.goal || '',
      pace: saved.pace || '',
      targetPbf: saved.targetPbf || +state.profile?.targetFat || +state.profile?.bodyGoals?.targetBodyFat || 15
    };
  }

  // 체지방률을 알면 제지방량 기반(Katch-McArdle), 모르면 Mifflin-St Jeor 공식으로 기초대사량을 구한다.
  function calculate(a) {
    const pbf = a.pbfMode === 'inbody' ? a.inbodyPbf : a.pbfMode === 'manual' ? a.pbf : null;
    const lbm = pbf ? a.weight * (1 - pbf / 100) : null;
    const bmr = lbm ? 370 + 21.6 * lbm : 10 * a.weight + 6.25 * a.height - 5 * a.age + (a.sex === 'f' ? -161 : 5);
    const neat = ACTIVITY.find(item => item[0] === a.activity)?.[3] || 1.3;
    const sessions = SESSIONS.find(item => item[0] === a.sessions)?.[2] || 0;
    const load = SESSION_LOAD.find(item => item[0] === a.load) || SESSION_LOAD[1];
    const exercise = sessions ? load[3] * a.weight * load[4] * sessions / 7 : 0;
    const tdee = bmr * neat + exercise;
    const change = a.goal === 'keep' ? 0 : (PACE[a.goal] || []).find(item => item[0] === a.pace)?.[3] || 0;
    const floor = Math.max(bmr, a.sex === 'f' ? 1200 : 1500);
    let kcal = Math.round((tdee + change) / 10) * 10;
    const clamped = kcal < floor;
    if (clamped) kcal = Math.round(floor / 10) * 10;
    return { pbf, lbm, bmr, neat, exercise, tdee, change, kcal, clamped, floor };
  }

  function macros(a, kcal, result) {
    // 단백질: 제지방 1kg당 2.2g(감량) · 2.0g(유지·증량), 체지방률을 모르면 체중 1kg당 1.8g. 지방은 총열량의 25%.
    const protein = Math.round(result.lbm ? result.lbm * (a.goal === 'cut' ? 2.2 : 2.0) : a.weight * 1.8);
    const fat = Math.round(Math.max(kcal * 0.25, a.weight * 0.7 * 9) / 9);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { protein, fat, carbs };
  }

  const choice = (key, items, layout = '') => `<div class="gq-choices ${layout}">${items.map(([value, label, hint]) => `<button type="button" class="gq-choice ${answers[key] === value ? 'on' : ''}" data-gq-pick="${key}" data-value="${value}"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</button>`).join('')}</div>`;
  const stepper = (key, unit, stepSize, min, max, digits = 0) => `<div class="gq-stepper"><button type="button" data-gq-step="${key}" data-delta="${-stepSize}" aria-label="줄이기">−</button><label><input id="gq-${key}" inputmode="decimal" data-gq-input="${key}" value="${(+answers[key]).toFixed(digits)}" data-min="${min}" data-max="${max}"><span>${unit}</span></label><button type="button" data-gq-step="${key}" data-delta="${stepSize}" aria-label="늘리기">＋</button></div>`;

  function steps() {
    const list = [
      { title: '성별을 알려주세요', hint: '기초대사량 공식이 달라요.', body: () => choice('sex', [['m', '남성'], ['f', '여성']], 'two'), ready: () => answers.sex },
      { title: '나이는요?', hint: '만 나이로 적어 주세요.', body: () => stepper('age', '세', 1, 14, 90) },
      { title: '키는요?', body: () => stepper('height', 'cm', 1, 120, 220) },
      { title: '지금 몸무게는요?', hint: '아침 공복 체중이 가장 정확해요.', body: () => stepper('weight', 'kg', 0.1, 30, 200, 1) },
      {
        title: '체지방률을 알고 있나요?', hint: '알면 근육량까지 반영해서 훨씬 정확해져요.',
        body: () => choice('pbfMode', [
          ...(answers.inbodyPbf ? [['inbody', `인바디 값 쓰기 (${answers.inbodyPbf}%)`, '최근 인바디 기록']] : []),
          ['manual', '직접 입력할게요', '인바디·체지방계 수치'], ['none', '잘 모르겠어요', '키·몸무게·나이로 계산해요']
        ]) + (answers.pbfMode === 'manual' ? stepper('pbf', '%', 0.5, 4, 60, 1) : ''),
        ready: () => answers.pbfMode
      },
      { title: '평소 하루는 어떤가요?', hint: '운동 시간을 뺀 일상 활동이에요.', body: () => choice('activity', ACTIVITY), ready: () => answers.activity },
      { title: '운동은 일주일에 몇 번 하나요?', hint: '축구·러닝 같은 운동도 포함해서 세요.', body: () => choice('sessions', SESSIONS), ready: () => answers.sessions },
      { title: '한 번 운동할 때는요?', body: () => choice('load', SESSION_LOAD), ready: () => answers.load, skip: () => answers.sessions === '0' },
      { title: '목표가 무엇인가요?', body: () => choice('goal', GOALS), ready: () => answers.goal },
      { title: answers.goal === 'gain' ? '얼마나 빨리 늘릴까요?' : '얼마나 빨리 뺄까요?', body: () => choice('pace', PACE[answers.goal] || []), ready: () => answers.pace, skip: () => answers.goal === 'keep' },
      {
        title: '목표 체지방률은요?', hint: '목표까지 걸리는 기간을 계산해 드려요.',
        body: () => stepper('targetPbf', '%', 0.5, 4, 40, 1), skip: () => answers.goal !== 'cut' || answers.pbfMode === 'none'
      },
      { title: '나의 목표', result: true }
    ];
    return list;
  }

  function visibleSteps() { return steps().filter(item => !item.skip?.()); }

  function resultMarkup() {
    const a = answers;
    const result = calculate(a);
    const kcal = Math.max(1000, result.kcal + adjust);
    const m = macros(a, kcal, result);
    let timeline = '';
    if (a.goal === 'cut' && result.pbf && a.targetPbf < result.pbf) {
      const targetWeight = result.lbm / (1 - a.targetPbf / 100);
      const weekly = -(PACE.cut.find(item => item[0] === a.pace)?.[3] || 550) / 1100;
      const weeks = Math.ceil((a.weight - targetWeight) / weekly);
      timeline = `<div class="gq-timeline"><b>체지방률 ${result.pbf}% → ${a.targetPbf}%</b><span>근육을 지키면 체중 약 ${targetWeight.toFixed(1)}kg · 이 속도면 약 ${weeks}주</span></div>`;
    }
    return `
      <div class="gq-result">
        <span class="gq-result-label">하루 목표</span>
        <div class="gq-result-kcal"><button type="button" data-gq-adjust="-50" aria-label="50kcal 줄이기">−</button><strong>${fmt(kcal)}</strong><button type="button" data-gq-adjust="50" aria-label="50kcal 늘리기">＋</button></div>
        <span class="gq-result-unit">kcal${adjust ? ` · 직접 ${adjust > 0 ? '+' : ''}${adjust}` : ''}</span>
        <div class="gq-macros"><div><small>탄수화물</small><b>${m.carbs}g</b></div><div><small>단백질</small><b>${m.protein}g</b></div><div><small>지방</small><b>${m.fat}g</b></div></div>
        ${timeline}
        <ul class="gq-why">
          <li><span>기초대사량</span><b>${fmt(result.bmr)} kcal</b><small>${result.lbm ? `제지방량 ${result.lbm.toFixed(1)}kg 기준` : '키·몸무게·나이 기준'}</small></li>
          <li><span>하루 소모량</span><b>${fmt(result.tdee)} kcal</b><small>일상 ×${result.neat}${result.exercise ? ` + 운동 하루 평균 ${fmt(result.exercise)}` : ''}</small></li>
          ${result.change ? `<li><span>${result.change < 0 ? '감량' : '증량'} 조정</span><b>${result.change > 0 ? '+' : ''}${fmt(result.change)} kcal</b><small>${PACE[a.goal].find(item => item[0] === a.pace)?.[2] || ''}</small></li>` : ''}
          ${result.clamped ? `<li class="warn"><span>안전 하한</span><b>${fmt(result.floor)} kcal</b><small>기초대사량보다 적게 먹지 않도록 맞췄어요</small></li>` : ''}
        </ul>
      </div>`;
  }

  function render() {
    const sheet = $('#goalSheet');
    if (!sheet) return;
    const list = visibleSteps();
    step = Math.min(step, list.length - 1);
    const current = list[step];
    const progress = Math.round(step / (list.length - 1) * 100);
    sheet.innerHTML = `
      <div class="gq-top"><button type="button" class="gq-icon" data-gq-back aria-label="${step ? '이전 질문' : '닫기'}">${step ? '←' : '×'}</button><div class="gq-progress"><i style="width:${progress}%"></i></div><span class="gq-count">${step + 1}/${list.length}</span></div>
      <div class="gq-body">
        <h2>${current.title}</h2>${current.hint ? `<p class="gq-hint">${current.hint}</p>` : ''}
        ${current.result ? resultMarkup() : current.body()}
      </div>
      <div class="gq-foot">${current.result
        ? '<button type="button" class="gq-next" data-gq-save>이 목표로 저장</button>'
        : `<button type="button" class="gq-next" data-gq-next ${current.ready && !current.ready() ? 'disabled' : ''}>다음</button>`}</div>`;
  }

  function readInputs() {
    document.querySelectorAll('[data-gq-input]').forEach(input => {
      const value = +String(input.value).replace(',', '.');
      if (Number.isFinite(value)) answers[input.dataset.gqInput] = Math.min(+input.dataset.max, Math.max(+input.dataset.min, value));
    });
  }

  function save() {
    const a = answers;
    const result = calculate(a);
    const kcal = Math.max(1000, result.kcal + adjust);
    const m = macros(a, kcal, result);
    const state = readState();
    state.profile ||= {};
    state.profile.targets = { kcal, protein: m.protein, carbs: m.carbs, fat: m.fat };
    const sessions = SESSIONS.find(item => item[0] === a.sessions)?.[2] || 0;
    // 주간 근력 운동 목표(축구 제외)는 설정의 운동 규칙에서 따로 정한다. 여기 운동 횟수는 소모 칼로리 계산에만 쓴다.
    state.profile.trainingIntensity = { light: '낮음', normal: '중간', hard: '높음' }[a.load] || state.profile.trainingIntensity || '중간';
    if (a.goal === 'cut' && result.pbf) state.profile.targetFat = a.targetPbf;
    state.profile.goalSetup = { ...a, adjust, savedAt: new Date().toISOString() };
    state.profile.targetUpdatedAt = new Date().toISOString();
    state.profile.targetReason = '질문형 목표 계산';
    const info = state.profile.recommendationContext ||= {};
    info.sex = a.sex === 'f' ? '여성' : '남성';
    info.birthYear = new Date().getFullYear() - a.age;
    info.height = a.height;
    info.weight = a.weight;
    if (result.pbf) info.bodyFat = result.pbf;
    info.activity = ACTIVITY.find(item => item[0] === a.activity)?.[1] || info.activity;
    const goalLabel = GOALS.find(item => item[0] === a.goal)?.[1] || '';
    const paceLabel = (PACE[a.goal] || []).find(item => item[0] === a.pace)?.[2] || '';
    info.goalStatement = [goalLabel, paceLabel, a.goal === 'cut' && result.pbf ? `목표 체지방률 ${a.targetPbf}%` : ''].filter(Boolean).join(' · ');
    if (a.goal === 'cut' && result.pbf) state.profile.bodyGoals = { ...(state.profile.bodyGoals || {}), targetBodyFat: a.targetPbf };
    writeState(state);
    window.dispatchEvent(new CustomEvent('fitlog:state-updated'));
    close();
    showToast(`하루 목표를 ${fmt(kcal)}kcal로 저장했어요.`);
    renderCard();
  }

  function open() {
    answers = defaults();
    adjust = +(readState().profile?.goalSetup?.adjust || 0);
    step = 0;
    let sheet = $('#goalSheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'goalSheet';
      sheet.className = 'goal-sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.setAttribute('aria-label', '목표 칼로리 설정');
      document.body.append(sheet);
      sheet.addEventListener('click', onClick);
      sheet.addEventListener('change', readInputs);
    }
    document.body.classList.add('sheet-open');
    sheet.hidden = false;
    render();
  }

  function close() {
    const sheet = $('#goalSheet');
    if (sheet) sheet.hidden = true;
    document.body.classList.remove('sheet-open');
  }

  function onClick(event) {
    const pick = event.target.closest('[data-gq-pick]');
    if (pick) {
      answers[pick.dataset.gqPick] = pick.dataset.value;
      if (pick.dataset.gqPick === 'goal') answers.pace = answers.goal === 'keep' ? '' : (answers.pace && (PACE[answers.goal] || []).some(item => item[0] === answers.pace) ? answers.pace : '');
      render();
      // 하나만 고르면 되는 질문은 바로 다음으로 넘어간다(직접 입력을 고른 경우는 제외).
      if (!(pick.dataset.gqPick === 'pbfMode' && pick.dataset.value === 'manual')) setTimeout(() => { step++; render(); }, 160);
      return;
    }
    const stepButton = event.target.closest('[data-gq-step]');
    if (stepButton) {
      readInputs();
      const key = stepButton.dataset.gqStep;
      const input = $(`#gq-${key}`);
      const digits = String(stepButton.dataset.delta).includes('.') ? 1 : 0;
      answers[key] = Math.min(+input.dataset.max, Math.max(+input.dataset.min, Math.round((+answers[key] + +stepButton.dataset.delta) * 10) / 10));
      input.value = (+answers[key]).toFixed(digits || (key === 'weight' || key === 'pbf' || key === 'targetPbf' ? 1 : 0));
      return;
    }
    const adjustButton = event.target.closest('[data-gq-adjust]');
    if (adjustButton) { adjust += +adjustButton.dataset.gqAdjust; render(); return; }
    if (event.target.closest('[data-gq-next]')) { readInputs(); step++; render(); return; }
    if (event.target.closest('[data-gq-back]')) { readInputs(); if (step) { step--; render(); } else close(); return; }
    if (event.target.closest('[data-gq-save]')) save();
  }

  // 설정 화면 맨 위 카드 + 홈의 목표 숫자를 누르면 연다.
  function renderCard() {
    const more = $('[data-view="more"] .content');
    if (!more) return;
    let card = $('#goalCard');
    if (!card) {
      card = document.createElement('section');
      card.id = 'goalCard';
      card.className = 'goal-card';
      more.querySelector('header')?.after(card);
      card.addEventListener('click', event => {
        if (event.target.closest('[data-goal-open]')) { open(); return; }
        const week = event.target.closest('[data-goal-week]');
        if (!week) return;
        const state = readState();
        state.profile ||= {};
        state.profile.workoutGoal = Math.min(7, Math.max(1, +(state.profile.workoutGoal || 5) + +week.dataset.goalWeek));
        writeState(state);
        window.dispatchEvent(new CustomEvent('fitlog:state-updated'));
        renderCard();
      });
    }
    const state = readState();
    const targets = state.profile?.targets || {};
    const setup = state.profile?.goalSetup;
    card.innerHTML = `<div class="goal-card-top"><span>하루 목표</span><strong>${fmt(+targets.kcal || 2200)}<small>kcal</small></strong></div>
      <div class="goal-card-macros"><span>탄 <b>${+targets.carbs || 0}g</b></span><span>단 <b>${+targets.protein || 0}g</b></span><span>지 <b>${+targets.fat || 0}g</b></span></div>
      <p>${setup ? esc(state.profile?.recommendationContext?.goalStatement || '') : '몇 가지 질문에 답하면 내 몸에 맞는 목표를 계산해요.'}</p>
      <div class="goal-card-week"><span>근력 운동 <small>축구 제외</small></span><div><button type="button" data-goal-week="-1" aria-label="주간 운동 줄이기">−</button><b>주 ${+(state.profile?.workoutGoal || 5)}회</b><button type="button" data-goal-week="1" aria-label="주간 운동 늘리기">＋</button></div></div>
      <button type="button" class="gq-next" data-goal-open>${setup ? '질문으로 다시 계산' : '내 목표 계산하기'}</button>`;
  }

  renderCard();
  window.addEventListener('fitlog:state-updated', () => { if (!$('#goalSheet') || $('#goalSheet').hidden) renderCard(); });
  document.addEventListener('click', event => { if (event.target.closest('[data-goal-wizard]')) open(); });
  window.FitLogGoal = { open, calculate };
})();
