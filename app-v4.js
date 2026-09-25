(() => {
  'use strict';

  const STATE_KEY = 'fitlog:dashboard:v3';
  const AI_KEY = 'fitlog-ai-settings';
  const SYNC_KEY = 'fitlog-sync';
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const pad = value => String(value).padStart(2, '0');
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const normalizeProjectUrl = value => String(value || '').trim().replace('woyrhbvvizsjgxtlaclq.supabase.co', 'woyrhbvvizsjgxtlaclg.supabase.co').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedDate = dateKey(new Date());
  let photoData = null;
  let pendingMealItems = [];
  let editingMealId = null;

  function readState() {
    return parse(localStorage.getItem(STATE_KEY), { profile: {}, logs: {}, inbody: [] }) || { profile: {}, logs: {}, inbody: [] };
  }

  function writeState(state) {
    state.lastSaved = new Date().toISOString();
    const serialized = JSON.stringify(state);
    localStorage.setItem(STATE_KEY, serialized);
    try { window.dispatchEvent(new StorageEvent('storage', { key: STATE_KEY, newValue: serialized })); } catch { /* Older WebViews still keep the saved state. */ }
  }

  function migrateMonthlyLog() {
    const state = readState();
    let changed = false;
    for (const [key, monthly] of Object.entries(state.logs || {})) {
      if (!/^\d{4}-\d{2}$/.test(key) || !monthly || Array.isArray(monthly)) continue;
      for (const [day, log] of Object.entries(monthly)) {
        if (validDate(day) && !state.logs[day]) state.logs[day] = log;
      }
      delete state.logs[key];
      changed = true;
    }
    if (changed) writeState(state);
    return changed;
  }

  const icon = (name, color) => {
    const paths = {
      home: '<path d="M4 11.5 12 5l8 6.5v7a1.5 1.5 0 0 1-1.5 1.5h-4v-5h-5v5h-4A1.5 1.5 0 0 1 4 18.5z"/>',
      workout: '<path d="M5 9v6m14-6v6M2.5 10.5v3m19-3v3M5 12h14"/>',
      report: '<path d="M5 19V9m7 10V5m7 14v-7"/><path d="m4 7 5-3 4 3 7-5"/>',
      more: '<circle cx="6" cy="7" r="1.5"/><circle cx="12" cy="7" r="1.5"/><circle cx="18" cy="7" r="1.5"/><path d="M5 12.5h14v6H5z"/>',
      plus: '<path d="M12 5v14M5 12h14"/>'
    };
    return `<span class="nav-bubble" style="--bubble:${color}"><svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg></span>`;
  };

  function refreshIcons() {
    const nav = $('.nav');
    if (!nav) return;
    const buttons = [...nav.querySelectorAll('button')];
    const specs = [
      ['home', '#ffe1d8', '오늘'], ['workout', '#d9f5e8', '운동'], ['plus', '#fff09c', '기록'],
      ['report', '#e5ddff', '리포트'], ['more', '#dcecff', '더보기']
    ];
    buttons.forEach((button, index) => {
      const [name, color, label] = specs[index];
      button.innerHTML = `${icon(name, color)}<span>${label}</span>`;
      button.setAttribute('aria-label', label);
    });
    const profileButton = $('.top [data-go="more"]');
    if (profileButton) profileButton.innerHTML = '<span aria-hidden="true">🐾</span>';
    const quick = $('.quick');
    if (quick) quick.innerHTML = `
      <button data-quick="meals"><span class="quick-icon peach">🍱</span><strong>식사</strong></button>
      <button data-quick="workout"><span class="quick-icon mint">🏃</span><strong>운동</strong></button>
      <button data-quick="more"><span class="quick-icon lilac">⚖️</span><strong>신체</strong></button>`;
  }

  function mascotMetrics() {
    const state = readState();
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return dateKey(date);
    });
    const weekLogs = dates.map(date => state.logs?.[date] || null);
    const mealDays = weekLogs.filter(log => (log?.meals || []).length);
    const activeDays = weekLogs.filter(log => (log?.workouts || []).length).length;
    const avgKcal = mealDays.length ? Math.round(mealDays.reduce((sum, log) => sum + calories(log), 0) / mealDays.length) : 0;
    const targetKcal = +(state.profile?.targets?.kcal || 2200);
    const workoutGoal = +(state.profile?.workoutGoal || state.profile?.workoutDays || 5);
    const dataDays = weekLogs.filter(log => log && ((log.meals || []).length || (log.workouts || []).length)).length;
    const ratio = avgKcal ? avgKcal / targetKcal : 1;
    let level = 3;
    if (dataDays >= 3) {
      if (activeDays >= Math.max(4, workoutGoal - 1) && ratio <= 1.05) level = 5;
      else if (activeDays >= 3 && ratio <= 1.12) level = 4;
      else if (ratio > 1.28 && activeDays <= 1) level = 1;
      else if (ratio > 1.12 || activeDays < 2) level = 2;
    }
    return { level, avgKcal, activeDays, workoutGoal, dataDays, targetKcal };
  }

  function updateMascot() {
    const mascot = $('.welcome img');
    if (!mascot) return;
    const metrics = mascotMetrics();
    const states = {
      1: ['잠깐 재충전', '조금 쉬어가도 괜찮아요. 다음 한 번이면 표정이 달라져요!', '축 처져 앉아 있는 아스날 강아지'],
      2: ['몸이 조금 무거워요', '가볍게 한 번 움직이면 다시 신날 거예요.', '천천히 공을 따라 걷는 아스날 강아지'],
      3: ['균형을 잡는 중', '기록을 이어가며 내 페이스를 찾아가요.', '축구공 위에 발을 올린 아스날 강아지'],
      4: ['기세 좋은 러너', '식단과 운동 흐름이 좋아요. 한 단계만 더!', '공을 몰며 달리는 아스날 강아지'],
      5: ['불타는 질주', '이번 주 정말 뜨거워요. 공까지 날아가겠어요!', '불꽃과 함께 공을 차며 달리는 아스날 강아지']
    };
    const [title, message, alt] = states[metrics.level];
    mascot.src = `fitlog-puppy-state-${metrics.level}.png`;
    mascot.alt = alt;
    const welcome = $('.welcome');
    welcome.className = welcome.className.replace(/\s*mascot-level-\d/g, '') + ` mascot-level-${metrics.level}`;
    let meter = $('#mascotMeter');
    if (!meter) {
      meter = document.createElement('section');
      meter.id = 'mascotMeter';
      meter.className = 'mascot-meter';
      welcome.insertAdjacentElement('afterend', meter);
    }
    const average = metrics.avgKcal ? `${metrics.avgKcal.toLocaleString()} kcal` : '식단 기록 대기';
    meter.innerHTML = `
      <div class="mascot-meter-head"><span>최근 7일 컨디션</span><strong>${title}</strong></div>
      <div class="mascot-levels" aria-label="5단계 중 ${metrics.level}단계">${[1, 2, 3, 4, 5].map(level => `<i class="${level <= metrics.level ? 'on' : ''}"></i>`).join('')}</div>
      <p>${message}</p>
      <div class="mascot-stats"><span><b>${average}</b>평균 섭취</span><span><b>${metrics.activeDays}일</b>운동 완료</span><span><b>${metrics.dataDays}일</b>기록 반영</span></div>`;
  }

  function calories(log) {
    return (log?.meals || []).reduce((sum, meal) => sum + (+meal.kcal || 0), 0);
  }

  function updatePlanHero() {
    const hero = $('.hero');
    if (!hero) return;
    const state = readState();
    const info = state.profile?.recommendationContext || {};
    const coach = state.profile?.weeklyCoach || {};
    const intensity = state.profile?.trainingIntensity || '중간';
    const goal = info.goalStatement || info.goal || '꾸준한 체력 향상';
    const action = coach.nextActions?.[0] || `이번 주 ${state.profile?.workoutGoal || 4}회, 회복 상태를 보며 진행해요.`;
    hero.querySelector('.tag').textContent = `AI 목표 · ${intensity} 강도`;
    hero.querySelector('h2').textContent = goal.length > 24 ? `${goal.slice(0, 24)}…` : goal;
    hero.querySelector('p').textContent = action;
  }

  function removeLegacyDemoMeals() {
    const state = readState();
    let changed = false;
    Object.values(state.logs || {}).forEach(log => {
      const meals = log?.meals || [];
      const cleaned = meals.filter(item => !(
        (item.id === 'a' && item.name === '계란 3개, 햇반 1/2' && +item.kcal === 480) ||
        (item.id === 'b' && item.name === '나물비빔밥, 쇠고기무국' && +item.kcal === 710)
      ));
      if (cleaned.length !== meals.length) {
        log.meals = cleaned;
        changed = true;
      }
    });
    if (changed) writeState(state);
    return changed;
  }

  const FOOD_EMOJIS = [
    [/갈비|고기|소고기|돼지|삼겹|스테이크|불고기|제육|돈까스/, ['🍖', '🥩']],
    [/닭|치킨|닭가슴살/, ['🍗', '🐔']],
    [/생선|연어|고등어|참치|회|초밥/, ['🐟', '🍣']],
    [/국수|면|라면|파스타|우동|냉면/, ['🍜', '🍝']],
    [/밥|비빔밥|볶음밥|덮밥|죽/, ['🍚', '🍛']],
    [/김밥/, ['🍙', '🍘']],
    [/계란|달걀|오믈렛/, ['🍳', '🥚']],
    [/샐러드|나물|채소|야채|브로콜리/, ['🥗', '🥦']],
    [/국|탕|찌개|전골/, ['🍲', '🥘']],
    [/빵|토스트|샌드위치|베이글/, ['🍞', '🥪']],
    [/과일|사과|바나나|딸기|귤|포도/, ['🍎', '🍌', '🍓']],
    [/커피|라떼|음료|주스/, ['☕', '🥤']],
    [/간식|과자|쿠키|케이크|초콜릿/, ['🍪', '🍰', '🍫']]
  ];

  function stablePick(list, seed) {
    const score = [...String(seed || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return list[score % list.length];
  }

  function mealEmoji(items, mealType) {
    const ordered = [...items].sort((a, b) => (+b.kcal || 0) - (+a.kcal || 0));
    const names = ordered.map(item => item.name || '').join(' ');
    for (const [pattern, choices] of FOOD_EMOJIS) {
      const match = ordered.find(item => pattern.test(String(item.name || '')));
      if (match) return stablePick(choices, `${mealType}-${match.name}-${match.kcal}`);
    }
    return stablePick(mealType === '간식' ? ['🍎', '🥛', '🍪'] : ['🍽️', '🥣', '🍱'], `${mealType}-${names}`);
  }

  function groupedMeals(meals) {
    return ['아침', '점심', '저녁', '간식'].map(meal => ({ meal, items: meals.filter(item => item.meal === meal) })).filter(group => group.items.length);
  }

  function renderGroupedMeals() {
    const state = readState();
    const today = dateKey(new Date());
    const meals = state.logs?.[today]?.meals || [];
    const groups = groupedMeals(meals);
    const signature = meals.map(item => `${item.id}:${item.meal}:${item.name}:${item.kcal}`).join('|') || 'empty';
    const preview = $('#mealPreview');
    const list = $('#mealList');
    if (preview) {
      const markup = groups.length ? groups.map(group => {
        const kcal = group.items.reduce((sum, item) => sum + (+item.kcal || 0), 0);
        const protein = group.items.reduce((sum, item) => sum + (+item.protein || 0), 0);
        return `<button class="meal-row meal-group-row" data-go="meals"><span class="meal-emoji" aria-hidden="true">${mealEmoji(group.items, group.meal)}</span><span><strong>${esc(group.meal)}</strong><span>${esc(group.items.map(item => item.name).join(' · '))}</span><small>단백질 ${Math.round(protein)}g</small></span><em><b class="kcal-value">${Math.round(kcal).toLocaleString()}</b> kcal</em></button>`;
      }).join('') : `<button class="meal-row" data-go="meals"><span class="meal-emoji" aria-hidden="true">🍽️</span><span><strong>아직 기록이 없어요</strong><span>눌러서 식사를 추가하세요</span></span><em>＋</em></button>`;
      if (preview.dataset.mealSignature !== signature || !preview.querySelector('.meal-emoji')) {
        preview.dataset.mealSignature = signature;
        preview.innerHTML = markup;
      }
    }
    if (list) {
      const markup = groups.length ? groups.map(group => {
        const kcal = group.items.reduce((sum, item) => sum + (+item.kcal || 0), 0);
        return `<section class="meal-group"><header><span class="meal-emoji small" aria-hidden="true">${mealEmoji(group.items, group.meal)}</span><div><strong>${esc(group.meal)}</strong><span>${group.items.length}가지 음식</span></div><em><b class="kcal-value">${Math.round(kcal).toLocaleString()}</b> kcal</em></header><div class="meal-group-items">${group.items.map(item => `<article><div><strong>${esc(item.name)}</strong><span>${esc(item.amount || item.referenceAmount || '')} · 단백질 ${Math.round(+item.protein || 0)}g · 탄수 ${Math.round(+item.carbs || 0)}g · 지방 ${Math.round(+item.fat || 0)}g</span></div><b class="item-kcal">${Math.round(+item.kcal || 0)} kcal</b><button type="button" class="edit-meal" data-edit-meal="${esc(item.id)}">수정</button><button type="button" class="delete" data-del-meal="${esc(item.id)}">삭제</button></article>`).join('')}</div></section>`;
      }).join('') : '<div class="item"><div><strong>오늘의 식사를 추가해 주세요</strong><span>편하게 적으면 AI가 음식별로 나눠 계산해요.</span></div></div>';
      if (list.dataset.mealSignature !== signature || (groups.length ? !list.querySelector('.meal-group') : !list.querySelector('.item'))) {
        list.dataset.mealSignature = signature;
        list.innerHTML = markup;
      }
    }
  }

  function activityRing(log, target) {
    const kcal = calories(log);
    const kcalProgress = Math.min(100, Math.round(kcal / Math.max(1, target) * 100));
    const mealProgress = Math.min(100, (log?.meals || []).length * 25);
    const workoutProgress = (log?.workouts || []).length ? 100 : 0;
    return `<span class="activity-ring" style="--kcal:${kcalProgress * 3.6}deg;--meal:${mealProgress * 3.6}deg;--move:${workoutProgress * 3.6}deg"><i></i></span>`;
  }

  function renderCalendar() {
    const grid = $('#archiveCalendar');
    if (!grid) return;
    const state = readState();
    const logs = state.logs || {};
    const target = +(state.profile?.targets?.kcal || 2200);
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    $('#calendarTitle').textContent = `${year}년 ${month + 1}월`;
    const firstDay = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    const today = dateKey(new Date());
    const cells = [];
    for (let index = 0; index < firstDay; index++) cells.push('<span class="calendar-empty"></span>');
    for (let day = 1; day <= count; day++) {
      const key = `${year}-${pad(month + 1)}-${pad(day)}`;
      const log = logs[key];
      const hasData = Boolean(log && ((log.meals || []).length || (log.workouts || []).length || log.weight || log.bodyFat || log.sleep));
      cells.push(`<button class="calendar-day ${key === today ? 'today' : ''} ${key === selectedDate ? 'selected' : ''} ${hasData ? 'has-data' : ''}" data-calendar-date="${key}"><span>${day}</span>${hasData ? activityRing(log, target) : '<i class="empty-dot"></i>'}</button>`);
    }
    grid.innerHTML = cells.join('');
    renderDaySummary();
  }

  function renderDaySummary() {
    const target = $('#daySummary');
    if (!target) return;
    const state = readState();
    const log = state.logs?.[selectedDate];
    const pretty = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${selectedDate}T12:00:00`));
    if (!log) {
      target.innerHTML = `<div class="summary-empty"><strong>${pretty}</strong><span>아직 기록이 없어요.</span></div>`;
      return;
    }
    const meals = log.meals || [];
    const workouts = log.workouts || [];
    const kcal = Math.round(calories(log));
    const mealGroups = ['아침', '점심', '저녁', '간식'].map(group => {
      const names = meals.filter(item => item.meal === group).map(item => item.name).filter(Boolean);
      return names.length ? `<div><b>${group}</b><span>${esc(names.join(' · '))}</span></div>` : '';
    }).join('');
    const workoutNames = workouts.map(item => item.name || item.note || item.group || item.type || '운동').filter(Boolean);
    const extras = [
      log.weight ? `체중 ${log.weight}kg` : '', log.bodyFat ? `체지방 ${log.bodyFat}%` : '',
      log.sleep ? `수면 ${log.sleep}시간` : '', log.condition ? `컨디션 ${log.condition}` : '', log.stress ? `스트레스 ${log.stress}` : ''
    ].filter(Boolean);
    target.innerHTML = `
      <div class="summary-head"><div><span>${pretty}</span><strong>${kcal.toLocaleString()} kcal</strong></div><div class="summary-count"><span>🍽 ${meals.length}</span><span>🏃 ${workouts.length}</span></div></div>
      ${mealGroups ? `<section class="day-block"><h3>식단</h3>${mealGroups}</section>` : ''}
      ${workoutNames.length ? `<section class="day-block"><h3>운동</h3><p>${esc(workoutNames.join(' · '))}</p></section>` : ''}
      ${extras.length || log.workoutNote || log.eventNote ? `<section class="day-block"><h3>기타</h3><p>${esc([...extras, log.workoutNote, log.eventNote].filter(Boolean).join(' · '))}</p></section>` : ''}`;
  }

  function installCalendar() {
    const legacy = $('#workoutList');
    if (!legacy || $('#calendarArchive')) return;
    legacy.classList.add('hidden');
    const heading = legacy.previousElementSibling?.querySelector('h2');
    if (heading) heading.textContent = '기록 보관함';
    const archive = document.createElement('section');
    archive.id = 'calendarArchive';
    archive.className = 'card calendar-card';
    archive.innerHTML = `
      <div class="calendar-head"><button type="button" id="prevMonth" aria-label="이전 달">‹</button><strong id="calendarTitle"></strong><button type="button" id="nextMonth" aria-label="다음 달">›</button></div>
      <div class="calendar-weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
      <div class="calendar-grid" id="archiveCalendar"></div>
      <div class="ring-legend"><span><i class="red"></i>운동</span><span><i class="green"></i>식단</span><span><i class="orange"></i>칼로리</span></div>
      <div class="day-summary" id="daySummary"></div>`;
    legacy.insertAdjacentElement('afterend', archive);
    $('#prevMonth').onclick = () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); };
    $('#nextMonth').onclick = () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); };
    archive.addEventListener('click', event => {
      const button = event.target.closest('[data-calendar-date]');
      if (!button) return;
      selectedDate = button.dataset.calendarDate;
      renderCalendar();
    });
    renderCalendar();
  }

  function removeDuplicateArchive() {
    const panel = $('#syncPanel');
    if (!panel || panel.dataset.calendarMoved) return;
    const children = [...panel.children];
    if (children[0]?.textContent.includes('기록 보관함')) children[0].remove();
    if (children[1]?.classList.contains('sync-card')) children[1].remove();
    panel.dataset.calendarMoved = 'true';
  }

  async function imagePayload(file) {
    if (!file) return null;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    return { mimeType: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl };
  }

  function nutritionPrompt(mealType, text) {
    return `한국 식단의 실제 섭취량을 음식별로 분리해 분석한다. 입력에 음식이 여러 개면 절대 합쳐 이름을 만들지 말고 각각 별도 항목으로 반환한다. "밥 갈비 1/3"이면 밥과 갈비를 나누고 1/3은 갈비에 적용한다. 텍스트의 제품명·중량·개수를 사진보다 우선한다. 각 음식마다 급식 또는 일반 식사의 현실적인 추천 1인분 기준량과, 사용자가 먹은 양을 0.25 단위 servings로 추정한다. kcal과 영양소는 추천 1인분 기준값으로 반환한다. 끼니: ${mealType}. 기록: ${text || '사진만 제공'}.`;
  }

  function extractJson(text) {
    const cleaned = String(text || '').replace(/```json|```/gi, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('AI 결과 형식을 읽지 못했어요.');
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  async function analyzeWithAi(settings, prompt, mode = 'analyze', includeMealPhoto = true) {
    const sync = parse(localStorage.getItem(SYNC_KEY), {}) || {};
    sync.url = normalizeProjectUrl(sync.url);
    if (sync.url) localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
    if (!sync.url || !sync.key) throw new Error('더보기에서 여러 기기 동기화를 먼저 연결해 주세요.');
    if (!settings.token) throw new Error('더보기에서 AI 연결 토큰을 입력해 주세요.');
    const headers = {
      'Content-Type': 'application/json',
      apikey: sync.key,
      'x-fitlog-token': settings.token
    };
    if (String(sync.key).startsWith('eyJ')) headers.Authorization = `Bearer ${sync.key}`;
    const functionName = settings.functionName || 'smart-endpoint';
    const projectOrigin = new URL(sync.url).origin;
    const endpoint = `${projectOrigin}/functions/v1/${encodeURIComponent(functionName)}`;
    const shouldAttachPhoto = includeMealPhoto && mode === 'analyze';
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode,
          prompt,
          hasText: shouldAttachPhoto && Boolean($('#aiMealText')?.value.trim()),
          photo: shouldAttachPhoto && photoData ? { mimeType: photoData.mimeType, data: photoData.data } : null,
          model: settings.model || 'gpt-5.6-luna'
        })
      });
    } catch {
      throw new Error('AI 서버에 연결하지 못했어요. Supabase 함수 배포와 함수 이름을 확인해 주세요.');
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `GPT 분석에 실패했어요. (${response.status})`);
    return body;
  }

  const shortDate = value => {
    const parts = String(value || '').split('-');
    return parts.length === 3 ? `${+parts[1]}/${+parts[2]}` : String(value || '').slice(5).replace('-', '/');
  };

  function svgEmpty(message) {
    return `<div class="chart-empty"><span>📊</span><strong>${message}</strong><small>기록을 추가하면 최근 10회 흐름이 자동으로 나타나요.</small></div>`;
  }

  function linePath(values, min, max) {
    const range = Math.max(.01, max - min);
    return values.map((value, index) => `${24 + index * (312 / Math.max(1, values.length - 1))},${16 + (max - value) / range * 76}`).join(' ');
  }

  function lineChart(records) {
    if (!records.length) return svgEmpty('아직 인바디 측정 기록이 없어요.');
    const series = [
      ['weight', '#67aef2'], ['pbf', '#ff8f78'], ['smm', '#54bb93']
    ];
    const lines = series.map(([key, color]) => {
      const present = records.map((item, index) => ({ index, value: +(key === 'pbf' ? item.pbf ?? item.bodyFat : item[key]) })).filter(item => Number.isFinite(item.value) && item.value > 0);
      if (!present.length) return '';
      const min = Math.min(...present.map(item => item.value)); const max = Math.max(...present.map(item => item.value));
      const range = Math.max(.01, max - min);
      const points = present.map(item => `${24 + item.index * (312 / Math.max(1, records.length - 1))},${16 + (max - item.value) / range * 76}`).join(' ');
      return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${present.map(item => `<circle cx="${24 + item.index * (312 / Math.max(1, records.length - 1))}" cy="${16 + (max - item.value) / range * 76}" r="3" fill="${color}"><title>${item.value}</title></circle>`).join('')}`;
    }).join('');
    return `<svg class="chart real-chart" viewBox="0 0 360 126" role="img" aria-label="최근 인바디 변화"><line class="grid" x1="24" y1="92" x2="336" y2="92"/>${lines}${records.map((item,index)=>`<text x="${24 + index * (312 / Math.max(1, records.length - 1))}" y="116" text-anchor="middle">${shortDate(item.date)}</text>`).join('')}</svg>`;
  }

  function workoutVolume(workout) {
    const direct = +(workout.totalVolume ?? workout.volume ?? workout.trainingVolume);
    if (direct > 0) return direct;
    if (Array.isArray(workout.exercises)) return workout.exercises.reduce((sum, exercise) => sum + (+(exercise.volume) || (+exercise.weight || 0) * (+exercise.reps || 0) * (+exercise.sets || 0)), 0);
    return (+workout.weight || 0) * (+workout.reps || 0) * (+workout.sets || 0);
  }

  function cardioCalories(workout) {
    const group = String(workout.group || workout.type || workout.name || '').toLowerCase();
    const cardio = /유산소|축구|러닝|달리기|걷기|사이클|수영|cardio|run|soccer/.test(group);
    return cardio ? +(workout.kcal ?? workout.calories ?? workout.burnedCalories ?? workout.calorie) || 0 : 0;
  }

  function barChart(records, color, unit, target = 0) {
    if (!records.length) return svgEmpty('표시할 실제 기록이 없어요.');
    const max = Math.max(target, ...records.map(item => item.value), 1);
    const width = 260 / Math.max(1, records.length); const barWidth = Math.min(22, width * .62);
    return `<svg class="chart real-chart" viewBox="0 0 360 132" role="img"><line class="grid" x1="38" y1="96" x2="338" y2="96"/>${target ? `<line x1="38" y1="${96-target/max*76}" x2="338" y2="${96-target/max*76}" stroke="#9db4aa" stroke-dasharray="4 4"/><text x="336" y="${90-target/max*76}" text-anchor="end">목표</text>` : ''}${records.map((item,index)=>{const x=46+index*(284/Math.max(1,records.length-1))-barWidth/2; const h=Math.max(2,item.value/max*76); return `<rect x="${x}" y="${96-h}" width="${barWidth}" height="${h}" rx="5" fill="${color}"><title>${Math.round(item.value).toLocaleString()} ${unit}</title></rect><text x="${x+barWidth/2}" y="116" text-anchor="middle">${shortDate(item.date)}</text>`}).join('')}</svg>`;
  }

  function renderRealReportCharts() {
    const report = $('[data-view="report"] .content'); if (!report) return;
    const state = readState(); const cards = [...report.querySelectorAll('.chart-card')]; if (cards.length < 3) return;
    const inbody = (state.inbody || []).filter(item => !item.excluded && item.date).sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-10);
    cards[0].querySelector('.chart-head').innerHTML = `<div><span>신체 변화</span><br><strong>최근 인바디 측정 ${inbody.length}회</strong></div><span>최대 10회</span>`;
    const oldBodyChart = cards[0].querySelector('.chart, .chart-empty'); if (oldBodyChart) oldBodyChart.outerHTML = lineChart(inbody);
    const stats = $('#stats');
    if (stats && !inbody.length) stats.innerHTML = '<article class="stat report-empty-stat"><span>인바디 기록 대기</span><strong>–</strong><em>더보기에서 첫 측정값을 입력해 주세요.</em></article>';
    const bodyComment = [...report.querySelectorAll('.comment')].find(element => !element.id);
    if (bodyComment) bodyComment.textContent = inbody.length > 1 ? '실제 인바디 기록의 최근 변화입니다. 수치 하나보다 같은 조건에서 측정한 흐름을 함께 보세요.' : inbody.length ? '측정값이 더 쌓이면 변화 속도와 목표 방향을 함께 분석해요.' : '인바디를 입력하면 실제 측정값을 바탕으로 코칭해요.';
    const logRows = Object.entries(state.logs || {}).sort(([a],[b])=>a.localeCompare(b));
    const volumeRows = logRows.map(([date,log])=>({date,value:(log.workouts||[]).reduce((sum,w)=>sum+workoutVolume(w),0)})).filter(item=>item.value>0).slice(-10);
    cards[1].querySelector('.chart-head').innerHTML = `<strong>근력운동 총 볼륨</strong><span>최근 ${volumeRows.length}회 · kg</span>`;
    const oldVolume = cards[1].querySelector('.chart, .chart-empty'); if (oldVolume) oldVolume.outerHTML = barChart(volumeRows, '#67aef2', 'kg');
    const legend = cards[1].querySelector('.legend'); if (legend) legend.innerHTML = '<span><i style="background:#67aef2"></i>중량 × 횟수 × 세트 합계</span>';
    const kcalTarget = +(state.profile?.targets?.kcal || 2200);
    const calorieRows = logRows.map(([date,log])=>({date,value:calories(log), meals:(log.meals||[]).length})).filter(item=>item.meals>0).slice(-10);
    cards[2].querySelector('.chart-head').innerHTML = `<strong>하루 섭취 칼로리</strong><span>최근 ${calorieRows.length}일 · kcal</span>`;
    const oldCalories = cards[2].querySelector('.chart, .chart-empty'); if (oldCalories) oldCalories.outerHTML = barChart(calorieRows, '#ff9e82', 'kcal', kcalTarget);
    let cardioCard = $('#cardioReportCard');
    const cardioRows = logRows.map(([date, log]) => ({ date, value: (log.workouts || []).reduce((sum, workout) => sum + cardioCalories(workout), 0) })).filter(item => item.value > 0).slice(-7);
    if (cardioRows.length) {
      if (!cardioCard) {
        cardioCard = document.createElement('section');
        cardioCard.id = 'cardioReportCard';
        cardioCard.className = 'card chart-card';
        cards[2].insertAdjacentElement('afterend', cardioCard);
      }
      cardioCard.innerHTML = `<div class="chart-head"><strong>유산소 소모 칼로리</strong><span>최근 ${cardioRows.length}회 · kcal</span></div>${barChart(cardioRows, '#72d1ae', 'kcal')}<div class="legend"><span><i style="background:#72d1ae"></i>기록된 유산소만 표시</span></div>`;
    } else if (cardioCard) {
      cardioCard.remove();
    }
    const header = report.querySelector('.eyebrow'); if (header) header.textContent = '실제 기록 기준 · 최근 10회';
  }

  function remainingMealTypes(meals) {
    const hour = new Date().getHours();
    const recorded = new Set(meals.map(item => item.meal));
    const result = [];
    if (hour < 10 && !recorded.has('아침')) result.push('아침');
    if (hour < 15 && !recorded.has('점심')) result.push(hour >= 10 && !recorded.has('아침') ? '아점' : '점심');
    if (hour < 21 && !recorded.has('저녁')) result.push('저녁');
    if (!recorded.has('간식')) result.push('간식');
    return result.length ? result : ['가벼운 간식'];
  }

  function installWorkoutCardioField() {
    const noteField = $('#workoutNote')?.closest('.field');
    const saveButton = $('#saveWorkout');
    if (!noteField || !saveButton || $('#workoutKcal')) return;
    noteField.insertAdjacentHTML('afterend', `<label class="field cardio-kcal-field"><span>유산소 소모 칼로리 <small>유산소를 기록할 때만 입력</small></span><div class="kcal-input-wrap"><input class="input" id="workoutKcal" inputmode="numeric" placeholder="예: 420"><b>kcal</b></div></label>`);
    saveButton.addEventListener('click', () => {
      const kcal = Math.max(0, +$('#workoutKcal')?.value || 0);
      const cardioSelected = [...document.querySelectorAll('[name="wt"]:checked')].some(input => /유산소|축구/.test(input.value));
      if (!cardioSelected || !kcal) return;
      setTimeout(() => {
        const state = readState();
        const today = dateKey(new Date());
        const workouts = state.logs?.[today]?.workouts || [];
        let changed = false;
        workouts.forEach(workout => {
          if (/유산소|축구/.test(String(workout.group || workout.type || '')) && !cardioCalories(workout)) {
            workout.kcal = kcal;
            changed = true;
          }
        });
        if (changed) {
          writeState(state);
          window.dispatchEvent(new CustomEvent('fitlog:state-updated'));
        }
      }, 0);
    });
  }

  function profileContextText(state) {
    const info = state.profile?.recommendationContext || {};
    const latest = (state.inbody || []).filter(item => !item.excluded).at(-1) || {};
    const goals = state.profile?.bodyGoals || {};
    return [
      info.sex && `성별 ${info.sex}`,
      info.birthYear && `출생연도 ${info.birthYear}`,
      (info.height || state.profile?.height) && `키 ${info.height || state.profile.height}cm`,
      (info.weight || latest.weight) && `체중 ${info.weight || latest.weight}kg`,
      (info.bodyFat || latest.pbf || latest.bodyFat) && `체지방률 ${info.bodyFat || latest.pbf || latest.bodyFat}%`,
      latest.smm && `골격근량 ${latest.smm}kg`,
      latest.bodyFatMass && `체지방량 ${latest.bodyFatMass}kg`,
      latest.bmi && `BMI ${latest.bmi}`,
      latest.visceralFat && `내장지방레벨 ${latest.visceralFat}`,
      latest.bmr && `기초대사량 ${latest.bmr}kcal`,
      goals.targetWeight && `목표 체중 ${goals.targetWeight}kg`,
      goals.targetSmm && `목표 골격근량 ${goals.targetSmm}kg`,
      goals.targetBodyFat && `목표 체지방률 ${goals.targetBodyFat}%`,
      goals.targetDate && `목표일 ${goals.targetDate}`,
      (info.goalStatement || info.goal) && `목표 ${info.goalStatement || info.goal}`,
      info.goalDeadline && `목표 기간 ${info.goalDeadline}`,
      info.goalPriority && `가장 중요한 기준 ${info.goalPriority}`,
      info.experience && `운동경력 ${info.experience}`,
      info.activity && `일상 활동량 ${info.activity}`,
      info.activityDetail && `직업·평소 움직임 ${info.activityDetail}`,
      info.schedule && `운동 가능 일정 ${info.schedule}`,
      info.trainingPreference && `선호 운동 ${info.trainingPreference}`,
      info.sleep && `평균 수면 ${info.sleep}`,
      info.injuries && `부상·주의사항 ${info.injuries}`,
      info.diet && `식사 패턴·알레르기 ${info.diet}`,
      info.eventContext && `특별 일정 ${info.eventContext}`
    ].filter(Boolean).join(', ') || '추가 정보 없음';
  }

  function clamp(value, min, max, fallback) {
    const number = +value;
    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
  }

  function targetPlanFromCoach(result, state) {
    const text = [result?.summary, ...(result?.adjustments || []), ...(result?.nextActions || [])].join(' ');
    const match = text.match(/\[TARGETS:([^\]]+)\]/i);
    if (!match) return null;
    const values = Object.fromEntries(match[1].split(';').map(part => part.split('=').map(value => value.trim())).filter(pair => pair.length === 2));
    const current = state.profile?.targets || { kcal: 2200, protein: 153, carbs: 260, fat: 61 };
    return {
      kcal: clamp(values.kcal, 1200, 4500, current.kcal),
      protein: clamp(values.protein, 40, 350, current.protein),
      carbs: clamp(values.carbs, 60, 650, current.carbs),
      fat: clamp(values.fat, 30, 180, current.fat),
      workouts: clamp(values.workouts, 1, 7, state.profile?.workoutGoal || 4),
      intensity: ['낮음', '중간', '높음'].includes(values.intensity) ? values.intensity : (state.profile?.trainingIntensity || '중간')
    };
  }

  function splitCoachText(value, count) {
    const parts = String(value || '').split(/\s*\|\|\s*/).map(item => item.trim()).filter(Boolean);
    while (parts.length < count) parts.push('기록을 이어가며 다음 분석의 정확도를 높여보세요.');
    return parts.slice(0, count);
  }

  async function analyzeCoachingSafely(settings, context, kind = 'weekly') {
    const format = kind === 'weekly'
      ? `items를 정확히 4개 반환한다. 1번: name=한줄제목과 요약, referenceAmount=운동강도(낮음/중간/높음 중 하나), servings=주간운동횟수, kcalPerServing=목표kcal, proteinPerServing=단백질g, carbsPerServing=탄수g, fatPerServing=지방g. 2번: name에 잘한 점 2개를 || 로 구분. 3번: name에 조정할 점 2개를 || 로 구분. 4번: name에 다음 행동 3개를 || 로 구분. 2~4번 숫자 필드는 0, referenceAmount는 기록분석, servings는 1로 쓴다. confidence는 모두 보통. `
      : `items를 정확히 1개 반환한다. name=계산 근거 요약, referenceAmount=운동강도(낮음/중간/높음 중 하나), servings=주간운동횟수, kcalPerServing=목표kcal, proteinPerServing=단백질g, carbsPerServing=탄수g, fatPerServing=지방g, confidence=보통. `;
    const raw = await analyzeWithAi(settings, `${format}${context}`, 'analyze', false);
    const items = Array.isArray(raw?.items) ? raw.items : [];
    if (!items.length) throw new Error('AI 목표 계산 결과를 읽지 못했어요.');
    const planItem = items[0];
    const result = {
      headline: String(planItem.name || '다음 목표를 계산했어요.'),
      summary: String(planItem.name || ''),
      strengths: splitCoachText(items[1]?.name, 2),
      adjustments: splitCoachText(items[2]?.name, 2),
      nextActions: splitCoachText(items[3]?.name, 3)
    };
    const plan = {
      kcal: planItem.kcalPerServing,
      protein: planItem.proteinPerServing,
      carbs: planItem.carbsPerServing,
      fat: planItem.fatPerServing,
      workouts: planItem.servings,
      intensity: String(planItem.referenceAmount || '').match(/낮음|중간|높음/)?.[0]
    };
    return { result, plan };
  }

  function saveAiTargets(state, plan, reason) {
    if (!plan) return false;
    state.profile ||= {};
    state.profile.targets = { kcal: plan.kcal, protein: plan.protein, carbs: plan.carbs, fat: plan.fat };
    state.profile.workoutGoal = plan.workouts;
    state.profile.trainingIntensity = plan.intensity;
    state.profile.targetUpdatedAt = new Date().toISOString();
    state.profile.targetReason = reason || 'AI 코칭 분석';
    return true;
  }

  function targetSummary(state) {
    const targets = state.profile?.targets || { kcal: 2200, protein: 153, carbs: 260, fat: 61 };
    return `<div class="ai-target-summary"><span><b>${(+targets.kcal || 0).toLocaleString()}</b> kcal</span><span><b>${+targets.protein || 0}g</b> 단백질</span><span><b>${+targets.carbs || 0}g</b> 탄수</span><span><b>${+targets.fat || 0}g</b> 지방</span><span><b>주 ${state.profile?.workoutGoal || 4}회</b> ${esc(state.profile?.trainingIntensity || '중간')} 강도</span></div>`;
  }

  function installBodyGoals() {
    const host = $('#recommendationProfile');
    if (!host || $('#inbodyPanel')) return;
    const state = readState();
    const latest = (state.inbody || []).filter(item => !item.excluded).at(-1) || {};
    const panel = document.createElement('details');
    panel.id = 'inbodyPanel';
    panel.className = 'card settings-fold';
    panel.innerHTML = `
      <summary><span class="fold-icon">⚖️</span><span><strong>인바디 기록</strong><small>${latest.date ? `최근 측정 ${esc(latest.date)}` : '측정값을 입력하면 추세와 코칭에 반영돼요'}</small></span><b>›</b></summary>
      <div class="fold-content body-profile-card">
        <div class="body-score"><div><span>BODY PROFILE</span><strong>${esc(latest.score || '기록 전')}</strong></div><small>${latest.date ? `최근 측정 ${esc(latest.date)}` : '첫 측정값을 입력해 주세요'}</small></div>
        <div class="body-input-grid">
          <label class="field"><span>측정일</span><input class="input" id="ibDate" type="date" value="${esc(latest.date || dateKey(new Date()))}"></label>
          <label class="field"><span>체중 kg</span><input class="input" id="ibWeight" inputmode="decimal" value="${esc(latest.weight || '')}"></label>
          <label class="field"><span>골격근량 kg</span><input class="input" id="ibSmm" inputmode="decimal" value="${esc(latest.smm || '')}"></label>
          <label class="field"><span>체지방량 kg</span><input class="input" id="ibFatMass" inputmode="decimal" value="${esc(latest.bodyFatMass || '')}"></label>
          <label class="field"><span>체지방률 %</span><input class="input" id="ibPbf" inputmode="decimal" value="${esc(latest.pbf || latest.bodyFat || '')}"></label>
          <label class="field"><span>BMI</span><input class="input" id="ibBmi" inputmode="decimal" value="${esc(latest.bmi || '')}"></label>
          <label class="field"><span>내장지방 레벨</span><input class="input" id="ibVisceral" inputmode="decimal" value="${esc(latest.visceralFat || '')}"></label>
          <label class="field"><span>기초대사량 kcal</span><input class="input" id="ibBmr" inputmode="numeric" value="${esc(latest.bmr || '')}"></label>
        </div>
        <button type="button" class="primary mint full" id="saveInbody">측정값 저장</button>
      </div>`;
    host.insertAdjacentElement('afterend', panel);
    $('#saveInbody').onclick = () => {
      const next = readState();
      next.inbody ||= [];
      const item = { date: $('#ibDate').value || dateKey(new Date()), weight: +$('#ibWeight').value || null, smm: +$('#ibSmm').value || null, bodyFatMass: +$('#ibFatMass').value || null, pbf: +$('#ibPbf').value || null, bmi: +$('#ibBmi').value || null, visceralFat: +$('#ibVisceral').value || null, bmr: +$('#ibBmr').value || null };
      const index = next.inbody.findIndex(value => value.date === item.date);
      if (index >= 0) next.inbody[index] = { ...next.inbody[index], ...item }; else next.inbody.push(item);
      next.inbody.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      writeState(next); window.dispatchEvent(new CustomEvent('fitlog:state-updated')); showToast('인바디 측정값을 저장했어요.');
    };
  }

  function installWeeklyCoach() {
    const report = $('[data-view="report"] .content');
    const firstChart = report?.querySelector('.chart-card');
    if (!report || !firstChart || $('#weeklyCoach')) return;
    const coach = document.createElement('section');
    coach.id = 'weeklyCoach'; coach.className = 'card weekly-coach';
    const saved = readState().profile?.weeklyCoach;
    coach.innerHTML = saved ? weeklyCoachMarkup(saved) : `<div class="coach-title"><span>FITLOG WEEKLY COACH</span><strong>지난 7일을 함께 읽어볼까요?</strong><small>매주 일요일 밤 11시 이후 앱을 열면 기록·인바디·목표를 함께 분석해 다음 주 기준을 조정해요.</small></div><button type="button" class="primary full" id="runWeeklyCoach">지금 주간 코칭 받기</button>${adviceMarkup()}`;
    firstChart.insertAdjacentElement('afterend', coach);
    bindCoachActions();

    function weekRows(state) {
      const dates = Array.from({length:7}, (_, i) => { const d=new Date(); d.setDate(d.getDate()-6+i); return dateKey(d); });
      return dates.map(date => { const log=state.logs?.[date] || {}; const meals=log.meals || []; const workouts=log.workouts || []; return { date, recorded: Boolean(meals.length || workouts.length), kcal: meals.length ? meals.reduce((s,m)=>s+(+m.kcal||0),0) : null, protein: meals.length ? meals.reduce((s,m)=>s+(+m.protein||0),0) : null, workouts: workouts.map(w=>({type:w.group||w.type||w.name||'운동', volume:workoutVolume(w)||null, cardioKcal:cardioCalories(w)||null})) }; });
    }

    function weeklyCoachMarkup(savedCoach) {
      return `<div class="coach-title"><span>${savedCoach.auto ? '일요일 자동 주간 리포트' : '이번 주 코치 노트'}</span><strong>${esc(savedCoach.headline || '꾸준함을 이어갈 한 주')}</strong><small>${esc(savedCoach.summary || '')}</small></div><div class="coach-columns"><div><b>잘한 점</b>${(savedCoach.strengths||[]).map(x=>`<p>✓ ${esc(x)}</p>`).join('')}</div><div><b>조정할 점</b>${(savedCoach.adjustments||[]).map(x=>`<p>• ${esc(x)}</p>`).join('')}</div></div><div class="coach-plan"><b>다음 7일 실행 계획</b>${(savedCoach.nextActions||[]).map((x,i)=>`<p><span>${i+1}</span>${esc(x)}</p>`).join('')}</div>${targetSummary(readState())}<small class="coach-note">${savedCoach.createdAt ? `${new Date(savedCoach.createdAt).toLocaleString('ko-KR')} 작성 · ` : ''}기록 기반 일반 코칭이며 의료 진단을 대신하지 않아요.</small><button type="button" class="link" id="refreshCoach">다시 분석</button>${adviceMarkup()}`;
    }

    function adviceMarkup() {
      return `<details class="event-advice"><summary>특별 일정 조언하기 <b>＋</b></summary><div><textarea class="textarea compact" id="eventAdviceText" placeholder="예: 추석 연휴 동안 식사가 많았고 이번 주 운동은 2회만 가능해요."></textarea><button type="button" class="primary mint full" id="runEventAdvice">목표 kcal·운동강도만 조정</button><p class="notice" id="eventAdviceNotice"></p></div></details>`;
    }

    function bindCoachActions() {
      $('#runWeeklyCoach')?.addEventListener('click', () => runWeeklyCoach(false));
      $('#refreshCoach')?.addEventListener('click', () => runWeeklyCoach(false));
      $('#runEventAdvice')?.addEventListener('click', runEventAdvice);
    }

    async function runWeeklyCoach(auto) {
      const state = readState();
      const rows = weekRows(state);
      const button = $('#runWeeklyCoach') || $('#refreshCoach');
      const current = state.profile?.targets || { kcal: 2200, protein: 153, carbs: 260, fat: 61 };
      const prompt = `대한민국 최고 수준의 스포츠영양·피트니스 코치처럼 분석한다. 현재 목표: ${JSON.stringify(current)}, 주 ${state.profile?.workoutGoal || 4}회, ${state.profile?.trainingIntensity || '중간'} 강도. 사용자: ${profileContextText(state)}. 최근 7일: ${JSON.stringify(rows)}. 미기록은 0kcal로 보지 않는다. 최신 인바디와 실제 기록으로 다음 7일 기준을 보수적으로 조정한다. kcal은 주당 최대 100, 운동은 최대 1회만 바꾸며 과식 후 굶기는 금지한다. 의료 진단은 하지 않는다.`;
      const settings = parse(localStorage.getItem(AI_KEY), {}) || {};
      if (!settings.token) return showToast('더보기에서 AI 연결 토큰을 먼저 설정해 주세요.');
      if (!rows.some(row => row.recorded)) return showToast('이번 주 기록이 생기면 주간 코칭을 만들 수 있어요.');
      if (button) { button.disabled = true; button.textContent = '기록을 분석하는 중…'; }
      try {
        const coaching = await analyzeCoachingSafely(settings, prompt, 'weekly');
        const result = coaching.result;
        const next = readState();
        const proposed = coaching.plan ? {
          kcal: clamp(coaching.plan.kcal, 1200, 4500, current.kcal),
          protein: clamp(coaching.plan.protein, 40, 350, current.protein),
          carbs: clamp(coaching.plan.carbs, 60, 650, current.carbs),
          fat: clamp(coaching.plan.fat, 30, 180, current.fat),
          workouts: clamp(coaching.plan.workouts, 1, 7, next.profile?.workoutGoal || 4),
          intensity: ['낮음', '중간', '높음'].includes(coaching.plan.intensity) ? coaching.plan.intensity : (next.profile?.trainingIntensity || '중간')
        } : null;
        if (proposed) {
          proposed.kcal = clamp(proposed.kcal, current.kcal - 100, current.kcal + 100, current.kcal);
          proposed.workouts = clamp(proposed.workouts, Math.max(1, (next.profile?.workoutGoal || 4) - 1), Math.min(7, (next.profile?.workoutGoal || 4) + 1), next.profile?.workoutGoal || 4);
          saveAiTargets(next, proposed, '주간 리포트 자동 조정');
        }
        const savedCoach = { ...result, createdAt: new Date().toISOString(), auto };
        next.profile ||= {};
        next.profile.weeklyCoach = savedCoach;
        next.profile.weeklyCoachKey = scheduledCoachKey();
        writeState(next);
        coach.innerHTML = weeklyCoachMarkup(savedCoach);
        bindCoachActions();
        window.dispatchEvent(new CustomEvent('fitlog:state-updated'));
      } catch (error) {
        const recorded = rows.filter(row => row.kcal > 0); const active = rows.filter(row => row.workouts.length);
        const target = +(state.profile?.targets?.kcal || 2200);
        const average = recorded.length ? Math.round(recorded.reduce((sum,row)=>sum+row.kcal,0)/recorded.length) : 0;
        const strengths = [active.length ? `${active.length}일 운동 기록을 남겨 흐름을 확인할 수 있어요.` : '운동 기록을 시작하면 훈련 흐름을 더 정확히 볼 수 있어요.', recorded.length >= 4 ? `${recorded.length}일 식단을 기록해 섭취 패턴이 잘 보입니다.` : '기록한 식단은 다음 계획을 조정하는 좋은 기준이 됩니다.'];
        const adjustments = [average && average > target ? `기록일 평균이 목표보다 ${average-target}kcal 높아 간식과 음료부터 조정해 보세요.` : '칼로리뿐 아니라 매 끼니 단백질과 채소 구성을 함께 확인해 보세요.', active.length < +(state.profile?.workoutGoal || 5) ? `주간 목표까지 ${Math.max(0, +(state.profile?.workoutGoal || 5)-active.length)}회 남았어요. 짧은 운동도 기록해 보세요.` : '훈련량이 충분하니 수면과 회복 상태도 함께 살펴보세요.'];
        const nextActions = ['운동하는 날에는 근력운동 총 볼륨을 입력해 증가 폭을 확인하기', '식사는 빠뜨리지 않고 기록하되 미기록일을 억지로 0kcal로 채우지 않기', '다음 인바디 측정은 비슷한 시간과 상태에서 진행하기'];
        coach.innerHTML = `<div class="coach-title"><span>기록 기반 코치 노트</span><strong>${active.length >= 3 ? '좋은 흐름을 꾸준히 이어가요' : '이번 주는 기록과 루틴부터 단단하게'}</strong><small>AI 서버 연결이 원활하지 않아 저장된 기록으로 기본 코칭을 만들었어요.</small></div><div class="coach-columns"><div><b>잘한 점</b>${strengths.map(x=>`<p>✓ ${esc(x)}</p>`).join('')}</div><div><b>조정할 점</b>${adjustments.map(x=>`<p>• ${esc(x)}</p>`).join('')}</div></div><div class="coach-plan"><b>다음 7일 실행 계획</b>${nextActions.map((x,i)=>`<p><span>${i+1}</span>${esc(x)}</p>`).join('')}</div><small class="coach-note">연결 오류: ${esc(error.message || 'AI 서버 연결 실패')} · 의료 진단을 대신하지 않아요.</small><button type="button" class="link" id="refreshCoach">AI 코칭 다시 시도</button>${adviceMarkup()}`;
        bindCoachActions();
      }
    }

    async function runEventAdvice() {
      const text = $('#eventAdviceText')?.value.trim();
      const notice = $('#eventAdviceNotice');
      if (!text) return notice.textContent = '특별 일정이나 최근 변화를 적어주세요.';
      const state = readState();
      const settings = parse(localStorage.getItem(AI_KEY), {}) || {};
      const button = $('#runEventAdvice');
      button.disabled = true; button.textContent = '조정안을 계산하는 중…';
      try {
        const prompt = `사용자 정보: ${profileContextText(state)}. 현재 목표 ${JSON.stringify(state.profile?.targets || {})}, 운동강도 ${state.profile?.trainingIntensity || '중간'}. 특별 상황: ${text}. 건강한 보상행동 원칙을 지키며 목표 kcal와 운동강도만 보수적으로 수정하고 영양소와 운동 횟수는 유지한다.`;
        const coaching = await analyzeCoachingSafely(settings, prompt, 'event');
        const result = coaching.result;
        const next = readState(); const plan = coaching.plan;
        if (!plan) throw new Error('조정값을 읽지 못했어요.');
        next.profile.targets.kcal = clamp(plan.kcal, next.profile.targets.kcal - 150, next.profile.targets.kcal + 150, next.profile.targets.kcal);
        next.profile.trainingIntensity = ['낮음', '중간', '높음'].includes(plan.intensity) ? plan.intensity : (next.profile.trainingIntensity || '중간');
        next.profile.recommendationContext ||= {};
        next.profile.recommendationContext.eventContext = text;
        next.profile.targetUpdatedAt = new Date().toISOString();
        next.profile.targetReason = '특별 일정 조언';
        writeState(next);
        notice.textContent = result.summary || '목표를 조정했어요.';
        window.dispatchEvent(new CustomEvent('fitlog:state-updated'));
      } catch (error) {
        notice.textContent = error.message || '조정하지 못했어요.';
      } finally {
        button.disabled = false; button.textContent = '목표 kcal·운동강도만 조정';
      }
    }

    function scheduledCoachKey(now = new Date()) {
      const due = new Date(now);
      due.setHours(23, 0, 0, 0);
      due.setDate(due.getDate() - due.getDay());
      if (due > now) due.setDate(due.getDate() - 7);
      return dateKey(due);
    }

    function maybeRunScheduledCoach() {
      const state = readState();
      const dueKey = scheduledCoachKey();
      const due = new Date(`${dueKey}T23:00:00`);
      const hasRecords = weekRows(state).some(row => row.recorded);
      const settings = parse(localStorage.getItem(AI_KEY), {}) || {};
      if (new Date() >= due && state.profile?.weeklyCoachKey !== dueKey && hasRecords && settings.token) setTimeout(() => runWeeklyCoach(true), 1200);
    }
    maybeRunScheduledCoach();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeRunScheduledCoach(); });
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + ((7 - now.getDay()) % 7));
    nextSunday.setHours(23, 0, 0, 0);
    if (nextSunday <= now) nextSunday.setDate(nextSunday.getDate() + 7);
    setTimeout(maybeRunScheduledCoach, Math.min(2147483000, nextSunday - now + 1500));
  }

  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function installUserContext() {
    const more = $('[data-view="more"] .content');
    const firstCard = more?.querySelector('.card.form');
    if (!more || !firstCard || $('#recommendationProfile')) return;
    const state = readState();
    const info = state.profile?.recommendationContext || {};
    firstCard.classList.add('hidden');
    const section = document.createElement('details');
    section.id = 'recommendationProfile';
    section.className = 'card settings-fold recommendation-profile';
    section.innerHTML = `
      <summary><span class="fold-icon">🎯</span><span><strong>목표 설정과 나의 정보</strong><small>한 번 입력하면 AI가 식단·운동 기준을 계산해요</small></span><b>›</b></summary>
      <div class="fold-content">
        <section class="profile-step"><span>1</span><div><strong>기본 정보</strong><small>필요한 계산에만 사용해요.</small></div></section>
        <div class="profile-detail-grid">
          <label class="field full-field"><span>이름</span><input class="input" id="ctxName" value="${esc(state.profile?.name || '')}"></label>
          <label class="field"><span>성별</span><select class="select" id="ctxSex"><option value="">선택 안 함</option><option ${info.sex === '남성' ? 'selected' : ''}>남성</option><option ${info.sex === '여성' ? 'selected' : ''}>여성</option><option ${info.sex === '기타·비공개' ? 'selected' : ''}>기타·비공개</option></select></label>
          <label class="field"><span>출생연도</span><input class="input" id="ctxBirth" inputmode="numeric" value="${esc(info.birthYear || '')}" placeholder="예: 1995"></label>
          <label class="field"><span>키 cm</span><input class="input" id="ctxHeight" inputmode="decimal" value="${esc(info.height || '')}" placeholder="예: 175"></label>
          <label class="field"><span>현재 체중 kg</span><input class="input" id="ctxWeight" inputmode="decimal" value="${esc(info.weight || '')}" placeholder="예: 72.5"></label>
        </div>
        <section class="profile-step"><span>2</span><div><strong>원하는 변화</strong><small>선택하지 말고 본인의 말로 구체적으로 적어주세요.</small></div></section>
        <label class="field"><span>목표</span><textarea class="textarea goal-text" id="ctxGoal" placeholder="예: 근육량 증가와 체지방 감소를 동시에 하고 싶어요. 체중보다 허리둘레와 운동 수행능력이 중요해요.">${esc(info.goalStatement || info.goal || '')}</textarea></label>
        <div class="profile-detail-grid">
          <label class="field"><span>목표 기간</span><input class="input" id="ctxDeadline" value="${esc(info.goalDeadline || '')}" placeholder="예: 12주"></label>
          <label class="field"><span>가장 중요한 기준</span><input class="input" id="ctxPriority" value="${esc(info.goalPriority || '')}" placeholder="예: 체지방률"></label>
        </div>
        <section class="profile-step"><span>3</span><div><strong>생활과 운동 조건</strong><small>실제로 지킬 수 있는 계획을 만드는 기준이에요.</small></div></section>
        <label class="field"><span>직업·평소 움직임</span><input class="input" id="ctxActivityDetail" value="${esc(info.activityDetail || '')}" placeholder="예: 사무직, 하루 평균 7천 보"></label>
        <label class="field"><span>운동 경력</span><input class="input" id="ctxExperience" value="${esc(info.experience || '')}" placeholder="예: 웨이트 2년, 축구 주 1회"></label>
        <label class="field"><span>운동 가능한 요일·시간</span><input class="input" id="ctxSchedule" value="${esc(info.schedule || '')}" placeholder="예: 월·화·목·금, 회당 60분"></label>
        <label class="field"><span>선호 운동·싫어하는 운동</span><input class="input" id="ctxTrainingPreference" value="${esc(info.trainingPreference || '')}" placeholder="예: 머신 선호, 장거리 달리기는 어려움"></label>
        <label class="field"><span>평균 수면과 회복</span><input class="input" id="ctxSleep" value="${esc(info.sleep || '')}" placeholder="예: 6시간 30분, 평일 피로가 큼"></label>
        <label class="field"><span>부상·통증·주의사항</span><textarea class="textarea compact" id="ctxInjuries" placeholder="예: 오른쪽 무릎 통증">${esc(info.injuries || '')}</textarea></label>
        <label class="field"><span>평소 식사 패턴·알레르기·피하는 음식</span><textarea class="textarea compact" id="ctxDiet" placeholder="예: 평일 점심은 급식, 유제품 알레르기, 생선 선호">${esc(info.diet || '')}</textarea></label>
        <button type="button" class="primary mint full" id="saveRecommendationProfile">정보 저장</button>
        <div id="currentAiTargets">${targetSummary(state)}</div>
        <button type="button" class="primary full" id="analyzeMyGoal">AI가 목표 영양·운동 기준 계산</button>
        <p class="notice" id="goalAnalysisNotice">입력한 목표와 최신 인바디를 함께 분석해요.</p>
      </div>`;
    firstCard.insertAdjacentElement('afterend', section);
    const saveProfileFields = () => {
      const next = readState();
      next.profile ||= {};
      next.profile.name = $('#ctxName').value.trim() || next.profile.name || '인수';
      next.profile.recommendationContext = {
        sex: $('#ctxSex').value,
        birthYear: $('#ctxBirth').value.trim(),
        height: $('#ctxHeight').value.trim(),
        weight: $('#ctxWeight').value.trim(),
        goalStatement: $('#ctxGoal').value.trim(),
        goalDeadline: $('#ctxDeadline').value.trim(),
        goalPriority: $('#ctxPriority').value.trim(),
        activityDetail: $('#ctxActivityDetail').value.trim(),
        experience: $('#ctxExperience').value.trim(),
        schedule: $('#ctxSchedule').value.trim(),
        trainingPreference: $('#ctxTrainingPreference').value.trim(),
        sleep: $('#ctxSleep').value.trim(),
        injuries: $('#ctxInjuries').value.trim(),
        diet: $('#ctxDiet').value.trim()
      };
      writeState(next);
      window.dispatchEvent(new CustomEvent('fitlog:state-updated'));
      return next;
    };
    $('#saveRecommendationProfile').onclick = () => {
      saveProfileFields();
      showToast('추천용 나의 정보를 저장했어요.');
    };
    $('#analyzeMyGoal').onclick = async () => {
      const state = saveProfileFields();
      const goal = state.profile?.recommendationContext?.goalStatement;
      const notice = $('#goalAnalysisNotice');
      const button = $('#analyzeMyGoal');
      if (!goal) return notice.textContent = '먼저 원하는 목표를 본인의 말로 적어주세요.';
      const settings = parse(localStorage.getItem(AI_KEY), {}) || {};
      button.disabled = true;
      button.textContent = 'AI 코치가 기준을 계산하는 중…';
      notice.textContent = '목표·생활패턴·인바디를 함께 분석하고 있어요.';
      try {
        const prompt = `대한민국 최고 수준의 스포츠영양·피트니스 코치처럼 안전하고 현실적으로 설계한다. 사용자 정보: ${profileContextText(state)}. 현재 목표값: ${JSON.stringify(state.profile?.targets || {})}, 주간 운동 ${state.profile?.workoutGoal || 4}회. 현재 상태와 자유롭게 적은 목표에 맞는 하루 kcal, 단백질g, 탄수g, 지방g, 주간 운동횟수, 운동강도를 결정한다. 급격한 감량과 의학적 진단은 피한다.`;
        const coaching = await analyzeCoachingSafely(settings, prompt, 'goal');
        const result = coaching.result;
        const latest = readState();
        const plan = coaching.plan ? {
          kcal: clamp(coaching.plan.kcal, 1200, 4500, latest.profile?.targets?.kcal || 2200),
          protein: clamp(coaching.plan.protein, 40, 350, latest.profile?.targets?.protein || 153),
          carbs: clamp(coaching.plan.carbs, 60, 650, latest.profile?.targets?.carbs || 260),
          fat: clamp(coaching.plan.fat, 30, 180, latest.profile?.targets?.fat || 61),
          workouts: clamp(coaching.plan.workouts, 1, 7, latest.profile?.workoutGoal || 4),
          intensity: ['낮음', '중간', '높음'].includes(coaching.plan.intensity) ? coaching.plan.intensity : (latest.profile?.trainingIntensity || '중간')
        } : null;
        if (!plan) throw new Error('AI 목표 숫자를 읽지 못했어요. 다시 시도해 주세요.');
        saveAiTargets(latest, plan, result.summary || 'AI 목표 분석');
        writeState(latest);
        $('#currentAiTargets').innerHTML = targetSummary(latest);
        notice.textContent = result.summary || '목표 기준을 새로 계산했어요.';
        window.dispatchEvent(new CustomEvent('fitlog:state-updated'));
      } catch (error) {
        notice.textContent = error.message || '목표를 계산하지 못했어요.';
      } finally {
        button.disabled = false;
        button.textContent = 'AI가 목표 영양·운동 기준 다시 계산';
      }
    };
  }

  function installMealRecommendation() {
    const trigger = $('#recommend');
    const mealPhoto = $('[data-view="meals"] .photo');
    if (!trigger || !mealPhoto || $('#mealRecommendation')) return;
    const panel = document.createElement('section');
    panel.id = 'mealRecommendation';
    panel.className = 'card meal-recommendation';
    panel.innerHTML = '<div class="recommend-loading"><strong>남은 끼니 추천</strong><span>홈에서 추천받기를 눌러주세요.</span></div>';
    mealPhoto.insertAdjacentElement('afterend', panel);

    trigger.onclick = async () => {
      location.hash = 'meals';
      document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.dataset.view === 'meals'));
      document.querySelectorAll('.nav [data-go]').forEach(button => button.classList.toggle('active', button.dataset.go === 'meals'));
      const state = readState();
      const today = dateKey(new Date());
      const meals = state.logs?.[today]?.meals || [];
      const eaten = meals.reduce((sum, item) => ({
        kcal: sum.kcal + (+item.kcal || 0), protein: sum.protein + (+item.protein || 0),
        carbs: sum.carbs + (+item.carbs || 0), fat: sum.fat + (+item.fat || 0)
      }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
      const targets = state.profile?.targets || { kcal: 2200, protein: 153, carbs: 260, fat: 61 };
      const types = remainingMealTypes(meals);
      const settings = parse(localStorage.getItem(AI_KEY), {}) || {};
      panel.classList.add('show');
      panel.innerHTML = '<div class="recommend-loading"><span class="spinner dark"></span><strong>남은 끼니를 맞추는 중…</strong><span>오늘 기록과 목표를 함께 계산하고 있어요.</span></div>';
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      try {
        const prompt = `사용자 정보: ${profileContextText(state)}. 현재 시간 ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}. 오늘 먹은 음식: ${meals.map(item => `${item.meal} ${item.name} ${item.kcal}kcal`).join(', ') || '없음'}. 섭취 합계: ${Math.round(eaten.kcal)}kcal, 단백질 ${Math.round(eaten.protein)}g, 탄수 ${Math.round(eaten.carbs)}g, 지방 ${Math.round(eaten.fat)}g. 하루 목표: ${targets.kcal}kcal, 단백질 ${targets.protein}g, 탄수 ${targets.carbs}g, 지방 ${targets.fat}g. 추천할 남은 끼니: ${types.join(', ')}. 목표, 알레르기, 부상과 취향을 지키면서 목표를 과하게 넘지 않는 현실적인 한국식 메뉴를 끼니별로 추천한다.`;
        const result = await analyzeWithAi(settings, prompt, 'recommend');
        const suggestions = Array.isArray(result.meals) ? result.meals : [];
        panel.innerHTML = `<div class="recommend-head"><div><span>오늘의 남은 끼니</span><strong>${esc(result.title || '가볍고 든든하게')}</strong></div><small>${esc(result.summary || '')}</small></div>
          <div class="recommend-list">${suggestions.map((item, index) => `<article><div><span>${esc(item.mealType)}</span><strong>${esc(item.name)}</strong><small>${esc(item.portion)} · ${Math.round(+item.kcal || 0)} kcal</small></div><button type="button" data-use-recommend="${index}">입력</button><p>${esc(item.reason || '')}</p></article>`).join('')}</div>`;
        panel.querySelectorAll('[data-use-recommend]').forEach(button => {
          button.onclick = () => {
            const item = suggestions[+button.dataset.useRecommend];
            const text = $('#aiMealText');
            if (text) text.value = `${item.name} ${item.portion}`;
            const radio = $(`[name="aiMealType"][value="${item.mealType}"]`);
            if (radio) radio.checked = true;
            $('#aiMealComposer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          };
        });
      } catch (error) {
        panel.innerHTML = `<div class="recommend-loading bad"><strong>추천을 불러오지 못했어요.</strong><span>${esc(error.message || '잠시 후 다시 시도해 주세요.')}</span><button type="button" id="retryRecommend">다시 시도</button></div>`;
        $('#retryRecommend').onclick = () => trigger.click();
      }
    };
  }

  function normalizedMealItems(result) {
    const source = Array.isArray(result?.items) ? result.items : [result];
    return source.filter(Boolean).map((item, index) => ({
      key: `${Date.now()}-${index}`,
      name: String(item.name || `음식 ${index + 1}`),
      referenceAmount: String(item.referenceAmount || item.amount || '추천 1인분'),
      servings: Math.max(.25, Math.round((+item.servings || 1) * 4) / 4),
      kcalPerServing: Math.max(0, +item.kcalPerServing || +item.kcal || 0),
      proteinPerServing: Math.max(0, +item.proteinPerServing || +item.protein || 0),
      carbsPerServing: Math.max(0, +item.carbsPerServing || +item.carbs || 0),
      fatPerServing: Math.max(0, +item.fatPerServing || +item.fat || 0),
      confidence: item.confidence || '보통'
    }));
  }

  const actualNutrition = item => ({
    kcal: Math.round(item.kcalPerServing * item.servings),
    protein: Math.round(item.proteinPerServing * item.servings * 10) / 10,
    carbs: Math.round(item.carbsPerServing * item.servings * 10) / 10,
    fat: Math.round(item.fatPerServing * item.servings * 10) / 10
  });

  function renderMealPreview() {
    const preview = $('#aiMealPreview');
    if (!preview) return;
    if (!pendingMealItems.length) {
      preview.classList.remove('show');
      preview.innerHTML = '';
      return;
    }
    preview.classList.add('show');
    preview.innerHTML = `
      <div class="analysis-head"><div><span>음식별 분석 결과</span><strong>${pendingMealItems.length}개 음식</strong></div><small>각 항목을 수정한 뒤 저장하세요.</small></div>
      <div class="analysis-items">${pendingMealItems.map((item, index) => {
        const value = actualNutrition(item);
        return `<article class="analysis-item" data-analysis-index="${index}">
          <label><span>음식 이름</span><input class="input" data-meal-field="name" value="${esc(item.name)}"></label>
          <label><span>추천 기준량</span><input class="input" data-meal-field="referenceAmount" value="${esc(item.referenceAmount)}"></label>
          <div class="portion-row"><div><span>먹은 양</span><strong>${item.servings}인분</strong></div><div class="portion-stepper"><button type="button" data-portion="-.25">−</button><button type="button" data-portion=".25">＋</button></div></div>
          <div class="nutrition-edit">
            <label><span>1인분 kcal</span><input inputmode="decimal" data-meal-field="kcalPerServing" value="${item.kcalPerServing}"></label>
            <label><span>단백질 g</span><input inputmode="decimal" data-meal-field="proteinPerServing" value="${item.proteinPerServing}"></label>
            <label><span>탄수 g</span><input inputmode="decimal" data-meal-field="carbsPerServing" value="${item.carbsPerServing}"></label>
            <label><span>지방 g</span><input inputmode="decimal" data-meal-field="fatPerServing" value="${item.fatPerServing}"></label>
          </div>
          <p class="analysis-total">현재 양 기준 <b>${value.kcal} kcal</b> · 단백질 ${value.protein}g · 탄수 ${value.carbs}g · 지방 ${value.fat}g</p>
        </article>`;
      }).join('')}</div>
      <button type="button" class="primary mint full" id="saveAnalyzedMeals">${editingMealId ? '수정 내용 저장' : `${pendingMealItems.length}개 음식 저장`}</button>`;
  }

  function mealRecord(item, meal, id) {
    const value = actualNutrition(item);
    return {
      id: id || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      meal,
      name: item.name,
      amount: `${item.servings}인분 · ${item.referenceAmount}`,
      servings: item.servings,
      referenceAmount: item.referenceAmount,
      kcalPerServing: item.kcalPerServing,
      proteinPerServing: item.proteinPerServing,
      carbsPerServing: item.carbsPerServing,
      fatPerServing: item.fatPerServing,
      ...value,
      src: 'ai',
      confidence: item.confidence || '보통'
    };
  }

  function enhanceMealList() {
    $('#mealList')?.querySelectorAll('[data-del-meal]').forEach(button => {
      if (button.parentElement.querySelector('[data-edit-meal]')) return;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'edit-meal';
      edit.dataset.editMeal = button.dataset.delMeal;
      edit.textContent = '수정';
      button.before(edit);
    });
  }

  function installMealComposer() {
    const oldForm = $('#saveMeal')?.closest('.form');
    if (!oldForm || $('#aiMealComposer')) return;
    oldForm.id = 'aiMealComposer';
    oldForm.innerHTML = `
      <div class="meal-type-tabs" role="radiogroup" aria-label="끼니 선택">
        ${['아침', '점심', '저녁', '간식'].map((type, index) => `<label><input type="radio" name="aiMealType" value="${type}" ${index === 0 ? 'checked' : ''}><span>${type}</span></label>`).join('')}
      </div>
      <label class="field"><span>먹은 내용을 편하게 적어주세요</span><textarea class="textarea meal-free-text" id="aiMealText" placeholder="예: 햇반 반 공기, 계란후라이 2개, 닭가슴살 150g\n양이나 제품명을 적으면 더 정확해요."></textarea></label>
      <div class="photo-analyzer">
        <label class="photo-picker" for="mealPhoto"><span>📷</span><strong>사진으로 분석</strong><small>음식 전체가 보이게 찍어주세요</small></label>
        <input class="hidden" id="mealPhoto" type="file" accept="image/*" capture="environment">
        <img id="mealPhotoPreview" alt="선택한 식사 사진 미리보기">
      </div>
      <button class="primary ai-save full" id="analyzeMeal"><span>✦</span> AI로 음식별 분석</button>
      <p class="notice ai-notice" id="aiMealNotice">설명과 사진을 함께 쓰면 양을 더 정확하게 계산해요.</p>`;
    oldForm.insertAdjacentHTML('afterend', '<section class="card analysis-preview" id="aiMealPreview"></section>');

    if ($('#focusMeal')) $('#focusMeal').onclick = () => $('#aiMealText')?.focus();

    $('#mealPhoto').onchange = async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        photoData = await imagePayload(file);
        $('#mealPhotoPreview').src = photoData.preview;
        $('#mealPhotoPreview').classList.add('show');
        $('.photo-picker').classList.add('has-photo');
      } catch {
        $('#aiMealNotice').textContent = '사진을 읽지 못했어요. 다른 사진을 선택해 주세요.';
      }
    };

    $('#analyzeMeal').onclick = async () => {
      const button = $('#analyzeMeal');
      const notice = $('#aiMealNotice');
      const text = $('#aiMealText').value.trim();
      const meal = $('[name="aiMealType"]:checked')?.value || '아침';
      if (!text && !photoData) {
        notice.textContent = '먹은 내용을 적거나 사진을 추가해 주세요.';
        return;
      }
      const settings = parse(localStorage.getItem(AI_KEY), {}) || {};
      if (!settings.token) {
        notice.innerHTML = 'GPT 연결 설정이 필요해요. <button class="inline-link" data-go="more">더보기에서 연결하기</button>';
        return;
      }
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span> 사진과 설명을 함께 분석 중…';
      notice.textContent = '양과 조리법까지 반영해 계산하고 있어요.';
      try {
        const result = await analyzeWithAi(settings, nutritionPrompt(meal, text));
        editingMealId = null;
        pendingMealItems = normalizedMealItems(result);
        renderMealPreview();
        notice.textContent = `${pendingMealItems.length}개 음식으로 나눴어요. 양과 수치를 확인해 주세요.`;
        button.disabled = false;
        button.innerHTML = '<span>✦</span> 다시 분석';
        $('#aiMealPreview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        notice.textContent = error.message || '분석하지 못했어요. 잠시 후 다시 시도해 주세요.';
        button.disabled = false;
        button.innerHTML = '<span>✦</span> AI로 음식별 분석';
      }
    };

    $('#aiMealPreview').addEventListener('click', event => {
      const card = event.target.closest('[data-analysis-index]');
      const portion = event.target.closest('[data-portion]');
      if (card && portion) {
        const item = pendingMealItems[+card.dataset.analysisIndex];
        item.servings = Math.min(5, Math.max(.25, Math.round((item.servings + +portion.dataset.portion) * 4) / 4));
        renderMealPreview();
        return;
      }
      if (event.target.closest('#saveAnalyzedMeals')) {
        const state = readState();
        const today = dateKey(new Date());
        const meal = $('[name="aiMealType"]:checked')?.value || '아침';
        state.logs ||= {};
        state.logs[today] ||= { meals: [], workouts: [] };
        state.logs[today].meals ||= [];
        if (editingMealId) {
          const index = state.logs[today].meals.findIndex(item => item.id === editingMealId);
          if (index >= 0) state.logs[today].meals[index] = mealRecord(pendingMealItems[0], meal, editingMealId);
        } else {
          pendingMealItems.forEach(item => state.logs[today].meals.push(mealRecord(item, meal)));
        }
        writeState(state);
        sessionStorage.setItem('fitlog:notice', editingMealId ? '식사 기록을 수정했어요.' : `${pendingMealItems.length}개 음식을 각각 저장했어요.`);
        location.reload();
      }
    });

    $('#aiMealPreview').addEventListener('input', event => {
      const card = event.target.closest('[data-analysis-index]');
      const field = event.target.dataset.mealField;
      if (!card || !field) return;
      const item = pendingMealItems[+card.dataset.analysisIndex];
      item[field] = ['name', 'referenceAmount'].includes(field) ? event.target.value : Math.max(0, +event.target.value || 0);
      const total = card.querySelector('.analysis-total');
      const value = actualNutrition(item);
      total.innerHTML = `현재 양 기준 <b>${value.kcal} kcal</b> · 단백질 ${value.protein}g · 탄수 ${value.carbs}g · 지방 ${value.fat}g`;
    });

    document.addEventListener('click', event => {
      const button = event.target.closest('[data-edit-meal]');
      if (!button) return;
      const state = readState();
      const today = dateKey(new Date());
      const meal = state.logs?.[today]?.meals?.find(item => item.id === button.dataset.editMeal);
      if (!meal) return;
      editingMealId = meal.id;
      const servings = Math.max(.25, +meal.servings || 1);
      pendingMealItems = normalizedMealItems({
        ...meal,
        servings,
        referenceAmount: meal.referenceAmount || meal.amount || '기록 기준 1인분',
        kcalPerServing: +meal.kcalPerServing || (+meal.kcal || 0) / servings,
        proteinPerServing: +meal.proteinPerServing || (+meal.protein || 0) / servings,
        carbsPerServing: +meal.carbsPerServing || (+meal.carbs || 0) / servings,
        fatPerServing: +meal.fatPerServing || (+meal.fat || 0) / servings
      });
      const radio = $(`[name="aiMealType"][value="${meal.meal}"]`);
      if (radio) radio.checked = true;
      renderMealPreview();
      $('#aiMealPreview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    enhanceMealList();
    const mealList = $('#mealList');
    if (mealList) new MutationObserver(enhanceMealList).observe(mealList, { childList: true, subtree: true });
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :root{--red:#f25f5c;--soft-red:#ffe1d8;--violet:#8f7ee7}.welcome{background:linear-gradient(135deg,#fff0eb,#fff9dc 62%,#ddf7ed);padding-right:148px}.welcome img{width:145px;height:145px;right:-2px;bottom:-8px;transform-origin:55% 85%}.welcome.mascot-level-5{background:linear-gradient(135deg,#fff0d2,#ffe0d2 55%,#fff5b5)}.welcome.mascot-level-5 img{animation:mascotKick .62s ease-in-out infinite alternate}.welcome.mascot-level-4 img{animation:mascotRun .85s ease-in-out infinite alternate}.welcome.mascot-level-3 img{animation:mascotBreathe 2.4s ease-in-out infinite}.welcome.mascot-level-2 img{animation:mascotSlow 2.2s ease-in-out infinite}.welcome.mascot-level-1 img{animation:mascotDroop 3s ease-in-out infinite}.mascot-meter{margin-top:9px;padding:12px 14px;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:0 7px 20px #2666500d}.mascot-meter-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.mascot-meter-head span{color:var(--sub);font-size:10px}.mascot-meter-head strong{font-size:13px}.mascot-levels{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:8px 0}.mascot-levels i{height:6px;border-radius:9px;background:#e6eeeb}.mascot-levels i.on:nth-child(1){background:#aebac0}.mascot-levels i.on:nth-child(2){background:#9dc9bd}.mascot-levels i.on:nth-child(3){background:#72d1ae}.mascot-levels i.on:nth-child(4){background:#ffb45f}.mascot-levels i.on:nth-child(5){background:#f25f5c}.mascot-meter p{margin:0 0 10px;color:var(--sub);font-size:10px}.mascot-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.mascot-stats span{padding:7px 5px;border-radius:11px;background:#f5faf8;color:var(--sub);font-size:8px;text-align:center}.mascot-stats b{display:block;margin-bottom:2px;color:var(--ink);font-size:11px}@keyframes mascotKick{from{transform:translate(-3px,2px) rotate(-2deg) scale(.98)}to{transform:translate(4px,-5px) rotate(2deg) scale(1.03)}}@keyframes mascotRun{from{transform:translateX(-3px) rotate(-1deg)}to{transform:translate(4px,-3px) rotate(2deg)}}@keyframes mascotBreathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-2px) scale(1.015)}}@keyframes mascotSlow{0%,100%{transform:translateX(-1px) rotate(-1deg)}50%{transform:translateX(2px) rotate(1deg)}}@keyframes mascotDroop{0%,100%{transform:translateY(1px) rotate(0)}50%{transform:translateY(4px) rotate(-1deg)}}.bottom{border-top:1px solid #e5ece9;box-shadow:0 -8px 25px #17372c0b}.nav button{gap:3px}.nav button>span:last-child{font-size:9px}.nav-bubble{width:35px;height:35px;border-radius:13px;background:var(--bubble);display:grid;place-items:center;transition:.2s transform}.nav-bubble svg{width:20px;height:20px;fill:none;stroke:#29483e;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.nav button.active .nav-bubble{transform:translateY(-2px);box-shadow:0 5px 12px #17372c18}.nav .plus .nav-bubble{width:46px;height:46px;margin-top:-20px;border-radius:17px;background:#fff09c;box-shadow:0 8px 18px #c7a92435}.quick button{display:grid;place-items:center;gap:7px}.quick-icon{width:43px;height:43px;display:grid;place-items:center;border-radius:15px;font-size:21px}.quick-icon.peach{background:#ffe1d8}.quick-icon.mint{background:#d9f5e8}.quick-icon.lilac{background:#e5ddff}.quick button strong{font-size:11px}
      .calendar-card{padding:15px}.calendar-head{display:grid;grid-template-columns:38px 1fr 38px;align-items:center;text-align:center}.calendar-head button{width:34px;height:34px;border:0;border-radius:12px;background:#f2f7f5;font-size:24px}.calendar-weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.calendar-weekdays{margin:13px 0 6px;color:var(--sub);font-size:9px;text-align:center}.calendar-day{position:relative;min-width:0;height:55px;padding:4px 0;border:0;border-radius:13px;background:transparent;display:grid;place-items:center;align-content:start;gap:2px}.calendar-day>span{font-size:10px}.calendar-day.today>span{width:20px;height:20px;display:grid;place-items:center;border-radius:8px;background:#17372c;color:#fff}.calendar-day.selected{background:#f3f8f6;box-shadow:inset 0 0 0 2px #98d9c2}.activity-ring{position:relative;width:29px;height:29px;border-radius:50%;background:conic-gradient(var(--red) var(--move),#f2dddd 0);display:grid;place-items:center}.activity-ring:before{content:"";width:22px;height:22px;border-radius:50%;background:conic-gradient(#65cba5 var(--meal),#deeee8 0)}.activity-ring:after{content:"";position:absolute;width:15px;height:15px;border-radius:50%;background:conic-gradient(#ffb35f var(--kcal),#f3e7d7 0)}.activity-ring i{position:absolute;z-index:1;width:8px;height:8px;border-radius:50%;background:#fff}.empty-dot{width:4px;height:4px;margin-top:8px;border-radius:50%;background:#dce9e4}.ring-legend{display:flex;justify-content:center;gap:12px;margin:12px 0;color:var(--sub);font-size:9px}.ring-legend i{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:4px}.ring-legend .red{background:var(--red)}.ring-legend .green{background:#65cba5}.ring-legend .orange{background:#ffb35f}.day-summary{padding:14px;border-radius:17px;background:#f7fbf9}.summary-head{display:flex;justify-content:space-between;align-items:center}.summary-head span,.summary-head strong{display:block}.summary-head span{color:var(--sub);font-size:10px}.summary-head strong{font-size:19px;margin-top:2px}.summary-count{display:flex;gap:5px}.summary-count span{padding:6px 8px;border-radius:10px;background:#fff;color:var(--ink)}.day-block{margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}.day-block h3{margin:0 0 6px;font-size:11px}.day-block div{display:grid;grid-template-columns:35px 1fr;gap:6px;margin:5px 0}.day-block b,.day-block span,.day-block p{font-size:10px}.day-block span,.day-block p{margin:0;color:var(--sub);line-height:1.5}.summary-empty strong,.summary-empty span{display:block}.summary-empty span{margin-top:3px;color:var(--sub);font-size:10px}
      .meal-type-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:13px}.meal-type-tabs input{position:absolute;opacity:0}.meal-type-tabs span{min-height:42px;border:1px solid var(--line);border-radius:13px;background:#f7fbf9;display:grid;place-items:center;font-size:11px;font-weight:850}.meal-type-tabs input:checked+span{background:#17372c;color:#fff;border-color:#17372c}.meal-free-text{min-height:112px;line-height:1.55}.photo-analyzer{position:relative;margin:10px 0;min-height:82px}.photo-picker{min-height:82px;padding:12px;border:1px dashed #9ecdbc;border-radius:17px;background:#f0faf6;display:grid;grid-template-columns:42px 1fr;align-items:center;column-gap:9px;cursor:pointer}.photo-picker>span{grid-row:1/3;width:42px;height:42px;border-radius:14px;background:#fff;display:grid;place-items:center;font-size:20px}.photo-picker strong,.photo-picker small{display:block}.photo-picker strong{font-size:12px}.photo-picker small{color:var(--sub);font-size:9px}.photo-picker.has-photo{padding-right:92px}.photo-analyzer img{display:none;position:absolute;right:7px;top:7px;width:68px;height:68px;object-fit:cover;border-radius:13px}.photo-analyzer img.show{display:block}.ai-save{background:linear-gradient(135deg,#f26b63,#ff9a6d);box-shadow:0 8px 18px #e2644930}.ai-save span{margin-right:5px}.ai-save:disabled{opacity:.7}.ai-notice{line-height:1.5}.inline-link{border:0;background:transparent;color:#2f8467;font-weight:900;text-decoration:underline}.spinner{display:inline-block;width:14px;height:14px;border:2px solid #ffffff66;border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
      .analysis-preview{display:none;margin-top:10px;padding:14px}.analysis-preview.show{display:block}.analysis-head{display:flex;justify-content:space-between;align-items:end;gap:8px;margin-bottom:10px}.analysis-head span,.analysis-head strong{display:block}.analysis-head span,.analysis-head small{color:var(--sub);font-size:9px}.analysis-head strong{margin-top:2px;font-size:15px}.analysis-item{padding:12px;margin-bottom:9px;border-radius:16px;background:#f5faf8;border:1px solid #dcebe5}.analysis-item>label{display:block;margin-bottom:8px}.analysis-item>label span,.nutrition-edit span,.portion-row span{display:block;margin-bottom:4px;color:var(--sub);font-size:9px}.analysis-item .input{padding:9px 10px;font-size:13px}.portion-row{display:flex;align-items:center;justify-content:space-between;margin:9px 0}.portion-row strong{font-size:17px}.portion-stepper{display:grid;grid-template-columns:42px 42px;gap:6px}.portion-stepper button{height:36px;border:0;border-radius:12px;background:#fff;font-size:20px;font-weight:900}.nutrition-edit{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.nutrition-edit input{width:100%;min-width:0;padding:8px 4px;border:1px solid var(--line);border-radius:10px;background:#fff;text-align:center;font-size:11px}.analysis-total{margin:9px 0 0;color:var(--sub);font-size:10px}.analysis-total b{color:var(--ink)}.edit-meal{align-self:center;border:0;border-radius:11px;background:#e7f6f0;color:#28765d;padding:6px 9px;font-weight:800}.item:has(.edit-meal){grid-template-columns:1fr auto auto}
      .meal-recommendation{display:none;margin:10px 0;padding:14px;background:linear-gradient(145deg,#fff8df,#eefaf5)}.meal-recommendation.show{display:block}.recommend-loading{min-height:92px;display:grid;place-items:center;align-content:center;gap:6px;text-align:center}.recommend-loading strong,.recommend-loading span{display:block}.recommend-loading span{color:var(--sub);font-size:10px}.recommend-loading.bad strong{color:#a65341}.recommend-loading button{border:0;border-radius:11px;background:#17372c;color:#fff;padding:8px 12px;font-weight:800}.spinner.dark{border-color:#17372c33;border-top-color:#17372c}.recommend-head{display:flex;justify-content:space-between;align-items:end;gap:10px;margin-bottom:10px}.recommend-head span,.recommend-head strong{display:block}.recommend-head span{color:#6d827b;font-size:9px}.recommend-head strong{margin-top:2px;font-size:16px}.recommend-head small{max-width:48%;color:#6d827b;font-size:9px;text-align:right}.recommend-list article{display:grid;grid-template-columns:1fr auto;gap:6px;padding:11px;margin-top:7px;border-radius:15px;background:#fff}.recommend-list span,.recommend-list strong,.recommend-list small{display:block}.recommend-list span{color:#378d70;font-size:9px;font-weight:900}.recommend-list strong{margin:2px 0;font-size:13px}.recommend-list small,.recommend-list p{color:var(--sub);font-size:9px}.recommend-list p{grid-column:1/-1;margin:0;line-height:1.45}.recommend-list button{border:0;border-radius:11px;background:#e1f8ef;color:#25755a;padding:7px 10px;font-weight:900}
      .recommendation-profile>.section-head{margin-top:18px}.recommendation-profile .section-head small{display:block;margin-top:3px;color:var(--sub);font-size:9px}.profile-detail-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:0 8px}.profile-detail-grid .full-field{grid-column:1/-1}.textarea.compact{min-height:68px}
      .nutrition .cal-line strong{display:flex;align-items:baseline;gap:5px}.nutrition #kcal{font-size:34px;line-height:1;font-weight:950;letter-spacing:-1.5px}.nutrition .cal-line strong{font-size:20px}.nutrition .cal-line strong+span,.nutrition .cal-line>div>span{color:var(--sub);font-size:11px}.body-profile-card,.body-goal-card,.weekly-coach{padding:16px;margin-top:10px}.body-score,.goal-heading{display:flex;justify-content:space-between;align-items:end;margin-bottom:13px}.body-score span,.goal-heading span{display:block;color:#3a8b70;font-size:9px;font-weight:950;letter-spacing:.8px}.body-score strong,.goal-heading strong{display:block;margin-top:3px;font-size:18px}.body-score small{color:var(--sub);font-size:9px}.body-input-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:0 8px}.body-profile-card .primary,.body-goal-card .primary{margin-top:5px}.body-goal-card{background:linear-gradient(145deg,#f1fff9,#fff9df)}.goal-heading{display:block}.weekly-coach{margin:12px 0;background:linear-gradient(145deg,#eef9ff,#f2fff7 55%,#fff7dc)}.coach-title span,.coach-title strong,.coach-title small{display:block}.coach-title span{color:#477e9d;font-size:9px;font-weight:950;letter-spacing:.8px}.coach-title strong{margin:5px 0;font-size:18px}.coach-title small,.coach-note{color:var(--sub);font-size:9px;line-height:1.5}.weekly-coach>.primary{margin-top:13px}.coach-columns{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:13px}.coach-columns>div,.coach-plan{padding:11px;border-radius:14px;background:#fff}.coach-columns b,.coach-plan b{font-size:11px}.coach-columns p,.coach-plan p{margin:7px 0 0;color:var(--sub);font-size:10px;line-height:1.45}.coach-plan{margin-top:7px}.coach-plan p{display:grid;grid-template-columns:20px 1fr;gap:5px}.coach-plan p span{width:18px;height:18px;border-radius:7px;background:#dff4ec;color:#28765d;display:grid;place-items:center;font-weight:900}.coach-note{display:block;margin-top:9px}
      .kcal-value{font-size:19px;line-height:1;font-weight:950;letter-spacing:-.4px;color:var(--ink)}.meal-row em{display:flex;align-items:baseline;gap:3px;white-space:nowrap;font-size:11px}.meal-row .meal-emoji{width:56px;height:56px;border-radius:17px;background:linear-gradient(145deg,#fff3df,#e9f8f1);display:grid;place-items:center;font-size:31px;box-shadow:inset 0 0 0 1px #e2ede8}.meal-group-row>span:nth-child(2)>span{font-size:11px;line-height:1.45;color:#526a61}.meal-group-row small{display:block;margin-top:4px;color:var(--sub);font-size:9px}.meal-group{padding:5px 0;border-bottom:1px solid var(--line)}.meal-group:last-child{border-bottom:0}.meal-group>header{display:grid;grid-template-columns:42px 1fr auto;gap:9px;align-items:center;padding:9px 0}.meal-emoji.small{width:42px;height:42px;border-radius:14px;background:#f1faf6;display:grid;place-items:center;font-size:23px}.meal-group header strong,.meal-group header span{display:block}.meal-group header span{color:var(--sub);font-size:9px}.meal-group header em{display:flex;align-items:baseline;gap:3px;font-style:normal;font-size:10px}.meal-group-items{margin-left:51px}.meal-group-items article{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:6px;align-items:center;padding:9px 0;border-top:1px dashed #e4efeb}.meal-group-items article strong,.meal-group-items article span{display:block}.meal-group-items article strong{font-size:12px}.meal-group-items article span{margin-top:3px;color:var(--sub);font-size:9px;line-height:1.4}.item-kcal{font-size:16px;white-space:nowrap}.meal-group-items .edit-meal,.meal-group-items .delete{padding:6px 7px;font-size:10px}.analysis-total b,.recommend-list small{font-size:15px;color:var(--ink);font-weight:900}.photo strong #mealKcal{font-size:36px;letter-spacing:-1.5px}.photo strong{display:flex;align-items:baseline;gap:5px}#mealRemain,#kcalMsg{font-size:13px;font-weight:800}.kcal-input-wrap{position:relative}.kcal-input-wrap input{padding-right:55px}.kcal-input-wrap b{position:absolute;right:13px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--sub)}.cardio-kcal-field small{font-size:9px;color:#8a9a94}
      .settings-fold{margin:10px 0;overflow:hidden}.settings-fold>summary{list-style:none;min-height:72px;padding:12px 15px;display:grid;grid-template-columns:44px 1fr auto;align-items:center;gap:10px;cursor:pointer}.settings-fold>summary::-webkit-details-marker{display:none}.settings-fold>summary .fold-icon{width:44px;height:44px;border-radius:15px;background:#f0faf6;display:grid;place-items:center;font-size:21px}.settings-fold>summary strong,.settings-fold>summary small{display:block}.settings-fold>summary strong{font-size:14px}.settings-fold>summary small{margin-top:3px;color:var(--sub);font-size:9px;line-height:1.4}.settings-fold>summary>b{font-size:21px;transition:.2s transform}.settings-fold[open]>summary>b{transform:rotate(90deg)}.fold-content{padding:3px 15px 16px;border-top:1px solid var(--line)}.body-profile-card{padding:13px 0 0;margin:0;box-shadow:none;border:0}.profile-step{display:grid;grid-template-columns:28px 1fr;gap:8px;align-items:center;margin:15px 0 10px}.profile-step>span{width:27px;height:27px;border-radius:10px;background:#17372c;color:#fff;display:grid;place-items:center;font-weight:900;font-size:11px}.profile-step strong,.profile-step small{display:block}.profile-step strong{font-size:13px}.profile-step small{color:var(--sub);font-size:9px;margin-top:2px}.goal-text{min-height:105px;line-height:1.5}.ai-target-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin:12px 0;padding:11px;border-radius:16px;background:#f4faf7}.ai-target-summary span{padding:7px 8px;border-radius:11px;background:#fff;color:var(--sub);font-size:9px}.ai-target-summary span:last-child{grid-column:1/-1}.ai-target-summary b{display:block;margin-bottom:2px;color:var(--ink);font-size:14px}.event-advice{margin-top:11px;border-top:1px solid #dcebe5}.event-advice>summary{list-style:none;padding:12px 2px 2px;color:#3a8069;font-size:11px;font-weight:900;cursor:pointer}.event-advice>summary::-webkit-details-marker{display:none}.event-advice>summary b{float:right}.event-advice>div{padding-top:8px}.event-advice .primary{font-size:11px}.chart-card#cardioReportCard{background:linear-gradient(145deg,#effbf6,#fff)}
      @media(max-width:360px){.welcome{padding-right:118px}.welcome img{width:120px;height:120px}.calendar-grid,.calendar-weekdays{gap:2px}.calendar-day{height:52px}.activity-ring{width:26px;height:26px}.activity-ring:before{width:20px;height:20px}.activity-ring:after{width:14px;height:14px}.mascot-stats span{font-size:7px}}
    `;
    document.head.appendChild(style);
  }

  if (migrateMonthlyLog()) {
    location.reload();
    return;
  }
  removeLegacyDemoMeals();
  injectStyles();
  updateMascot();
  updatePlanHero();
  refreshIcons();
  installCalendar();
  installWorkoutCardioField();
  installMealComposer();
  installMealRecommendation();
  installUserContext();
  installBodyGoals();
  installWeeklyCoach();
  renderRealReportCharts();
  renderGroupedMeals();
  removeDuplicateArchive();
  [$('#mealPreview'), $('#mealList')].filter(Boolean).forEach(target => new MutationObserver(() => renderGroupedMeals()).observe(target, { childList: true }));
  $('#saveWorkout')?.addEventListener('click', () => setTimeout(updateMascot, 850));
  window.addEventListener('hashchange', () => {
    if (location.hash === '#workout') renderCalendar();
    if (location.hash === '#report') renderRealReportCharts();
    removeDuplicateArchive();
  });
  window.addEventListener('fitlog:state-updated', () => {
    updateMascot();
    updatePlanHero();
    renderCalendar();
    renderRealReportCharts();
    renderGroupedMeals();
  });
})();
