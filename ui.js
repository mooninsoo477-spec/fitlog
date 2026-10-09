(() => {
  'use strict';

  // 화면 배치 정리: 모든 모듈이 화면을 그린 뒤에 실행한다.
  const $ = (selector, root = document) => root.querySelector(selector);
  const view = name => $(`[data-view="${name}"] .content`);
  const headingOf = (root, text) => [...root.querySelectorAll('.section-head')].find(el => el.textContent.includes(text));
  // 기존 화면 코드가 값을 써 넣는 요소가 있어서 지우지 않고 숨긴다.
  const hide = el => { if (el) el.hidden = true; };
  const hideSection = (root, text) => {
    const head = headingOf(root, text);
    if (!head) return;
    const next = head.nextElementSibling;
    if (next && !next.classList.contains('section-head')) hide(next);
    hide(head);
  };
  const sectionHead = title => {
    const head = document.createElement('div');
    head.className = 'section-head';
    head.innerHTML = `<h2>${title}</h2>`;
    return head;
  };

  function arrangeWorkout() {
    const workout = view('workout');
    const report = view('report');
    const calendar = $('#calendarArchive');
    if (!workout || !report) return;
    // 기록 달력은 리포트 맨 아래로 옮긴다.
    if (calendar && !report.contains(calendar)) {
      hide(headingOf(workout, '기록 보관함'));
      report.append(sectionHead('기록 달력'), calendar);
    }
    hide($('#workoutList'));
  }

  function arrangeMeals() {
    const meals = view('meals');
    if (!meals) return;
    const header = meals.querySelector('header');
    // 입력이 먼저, 지난 기록·급식표·추천은 그 아래.
    // 공개용은 AI 입력칸 대신 직접 입력 폼(식사 기록 제목 · 목록 · 입력 카드)이 입력 자리에 온다.
    const manualHead = $('#aiMealComposer') ? null : headingOf(meals, '식사 기록');
    const manual = manualHead ? [manualHead, $('#mealList'), $('#mealList')?.nextElementSibling] : [];
    const order = [...manual, ...['#aiMealComposer', '#aiMealPreview', '#mealDays', '#mealRecommendation', '#lunchManager'].map(id => $(id))].filter(Boolean);
    let anchor = header;
    order.forEach(node => { anchor.after(node); anchor = node; });
    hideSection(meals, '남은 끼니 추천');
    hide($('#mealAdvice'));
  }

  function arrangeReport() {
    const report = view('report');
    if (!report) return;
    const header = report.querySelector('header');
    if (header) header.innerHTML = '<div><h1>리포트</h1></div>';
    hide($('#bodyComment'));
    hide(headingOf(report, '운동량 흐름'));
    // 핵심(코칭 보드)만 펼쳐 두고, 자세한 카드는 눌러서 여는 묶음으로 접는다.
    let anchor = $('#coachBoard');
    if (!anchor) return;
    [
      ['foldBody', '몸 변화', '인바디 · 체성분 추이', ['#bodyCard']],
      ['foldCoach', 'AI 주간 리포트', '지난 7일 분석 · 특별 일정 조언', ['#weeklyCoach']],
      ['foldCharts', '그래프', '운동량 · 부위별 세트 · 섭취 칼로리', ['#volumeCard', '#partSetsCard', '#calorieCard', '#cardioReportCard']]
    ].forEach(([id, title, sub, selectors]) => {
      let box = $(`#${id}`);
      if (!box) {
        box = document.createElement('details');
        box.id = id;
        box.className = 'rp-fold';
        box.innerHTML = `<summary><span><strong>${title}</strong><small>${sub}</small></span><i aria-hidden="true">›</i></summary><div class="rp-fold-body"></div>`;
      }
      if (anchor.nextElementSibling !== box) anchor.after(box);
      const body = box.querySelector('.rp-fold-body');
      selectors.map(selector => $(selector)).filter(Boolean).forEach(node => { if (node.parentElement !== body) body.append(node); });
      anchor = box;
    });
  }

  function arrangeSettings() {
    const more = view('more');
    if (!more) return;
    hideSection(more, '앱 정보');
    hideSection(more, '데이터 관리');
    hide($('#csv'));
    hideSection(more, '저장과 백업');
    hide(more.querySelector('.backup-state'));
    const sync = $('#syncPanel');
    if (!sync) return;
    [...sync.querySelectorAll('.section-head')].forEach(hide);
    const [accountCard, aiCard] = sync.querySelectorAll(':scope > section.card');
    const backupMenu = [...more.querySelectorAll('section.card.menu')].find(card => card.querySelector('#backup'));
    const profile = $('#recommendationProfile');
    // "목표 설정과 나의 정보"는 이제 목표 질문이 맡으므로, 운동 규칙·코칭 정보만 남긴다.
    if (profile && !profile.dataset.slim) {
      profile.dataset.slim = '1';
      const summary = profile.querySelector('summary strong');
      const small = profile.querySelector('summary small');
      if (summary) summary.textContent = '운동 규칙 · 코칭 정보';
      if (small) small.textContent = '운동 시간대 · 부상 · 하체 규칙 · AI 모델';
      [...profile.querySelectorAll('.profile-step')].forEach(step => {
        if (/기본 정보|원하는 변화/.test(step.querySelector('strong')?.textContent || '')) hide(step);
      });
      ['#currentAiTargets', '#analyzeMyGoal', '#goalAnalysisNotice'].forEach(selector => hide($(selector)));
      // 주관식은 숨기고, 운동 일정·부상만 눌러서 고르게 한다(고른 값은 원래 칸에 적혀 그대로 저장된다).
      ['#ctxName', '#ctxSex', '#ctxBirth', '#ctxHeight', '#ctxWeight', '#ctxGoal', '#ctxDeadline', '#ctxPriority',
        '#ctxActivityDetail', '#ctxExperience', '#ctxTrainingPreference', '#ctxSleep', '#ctxDiet', '#ctxCustomRules'].forEach(selector => hide($(selector)?.closest('label, .field')));
      // 칸이 모두 숨겨져 빈 묶음이 된 줄도 숨긴다.
      [...profile.querySelectorAll('.profile-grid, .context-grid, .field-grid')].forEach(grid => { if ([...grid.children].every(child => child.hidden)) hide(grid); });
      const chipField = (selector, title, options) => {
        const input = $(selector);
        const label = input?.closest('label, .field');
        if (!input || !label) return;
        hide(label);
        const box = document.createElement('div');
        box.className = 'pick-field';
        const chosen = () => new Set(input.value.split(/[,·]/).map(item => item.trim()).filter(Boolean));
        const draw = () => {
          const set = chosen();
          box.innerHTML = `<span>${title}</span><div class="pick-chips">${options.map(option => `<button type="button" class="${set.has(option) ? 'on' : ''}" data-pick="${option}">${option}</button>`).join('')}</div>`;
        };
        box.addEventListener('click', event => {
          const chip = event.target.closest('[data-pick]');
          if (!chip) return;
          const set = chosen();
          const value = chip.dataset.pick;
          if (value === '없음') { set.clear(); set.add('없음'); }
          else { set.delete('없음'); if (set.has(value)) set.delete(value); else set.add(value); }
          input.value = [...set].join(', ');
          draw();
        });
        label.after(box);
        draw();
      };
      chipField('#ctxSchedule', '운동하는 시간대', ['평일 아침', '평일 점심', '평일 저녁', '주말 오전', '주말 오후']);
      chipField('#ctxInjuries', '아프거나 조심할 곳', ['없음', '어깨', '허리', '무릎', '손목', '발목', '목', '팔꿈치']);
      [...profile.querySelectorAll('.profile-step strong')].forEach(strong => { if (/생활과 운동 조건/.test(strong.textContent)) strong.textContent = '운동 일정 · 부상'; });
    }
    const group = (id, title, nodes) => {
      let box = $(`#${id}`);
      if (!box) {
        box = document.createElement('section');
        box.id = id;
        box.className = 'st-group';
        box.innerHTML = `<h3>${title}</h3>`;
      }
      nodes.filter(Boolean).forEach(node => { if (node.parentElement !== box) box.append(node); });
      return box;
    };
    const fold = (id, title, sub, nodes) => {
      let box = $(`#${id}`);
      if (!box) {
        box = document.createElement('details');
        box.id = id;
        box.className = 'card settings-fold';
        box.innerHTML = `<summary><span><strong>${title}</strong><small>${sub}</small></span><b>›</b></summary><div class="st-fold-body"></div>`;
      }
      const body = box.querySelector('.st-fold-body');
      nodes.filter(Boolean).forEach(node => { if (node.parentElement !== body) body.append(node); });
      return box;
    };
    const groups = [
      group('stBody', '내 몸 · 운동', [$('#inbodyPanel'), profile]),
      group('stAccount', '계정', [accountCard]),
      group('stAi', 'AI', [fold('aiFold', 'AI 모델', '음식 분석·추천에 쓰는 모델', [aiCard])]),
      group('stData', '데이터', [fold('dataFold', '백업 · 복원 · 기록 정리', '파일로 저장하거나 지난 식사 칼로리를 다시 계산해요', [backupMenu, $('#recalcCard')])])
    ];
    let anchor = $('#goalCard') || more.querySelector('header');
    groups.forEach(box => { if (anchor.nextElementSibling !== box) anchor.after(box); anchor = box; });
  }

  // 숨긴 기본 정보 칸은 목표 질문에서 정한 최신 값으로 맞춘 뒤 저장되게 한다(예전 값이 덮어쓰지 않도록).
  document.addEventListener('click', event => {
    if (!event.target.closest('#saveRecommendationProfile')) return;
    const info = window.FitLogCore?.readState()?.profile?.recommendationContext || {};
    const set = (selector, value) => { const field = $(selector); if (field && value != null && value !== '') field.value = value; };
    set('#ctxSex', info.sex);
    set('#ctxBirth', info.birthYear);
    set('#ctxHeight', info.height);
    set('#ctxWeight', info.weight);
    set('#ctxGoal', info.goalStatement);
  }, true);

  // 기록 시트의 '체크인'은 홈의 체크인 칸을 열어 준다.
  function installCheckinShortcut() {
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-checkin-open]')) return;
      setTimeout(() => {
        $('#checkin [data-checkin-edit]')?.click();
        const card = $('#checkin');
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => $('#ciWeight')?.focus({ preventScroll: true }), 350);
      }, 60);
    });
  }

  function arrange() {
    arrangeWorkout();
    arrangeMeals();
    arrangeReport();
    arrangeSettings();
  }

  arrange();
  installCheckinShortcut();
  // 다른 모듈이 늦게 다시 그리는 경우를 대비해 한 번 더 맞춘다.
  window.addEventListener('load', arrange);
  window.addEventListener('fitlog:state-updated', () => setTimeout(arrangeReport, 0));
  window.addEventListener('hashchange', () => { if (location.hash === '#report') setTimeout(arrangeReport, 0); if (location.hash === '#more') setTimeout(arrangeSettings, 0); });
})();
