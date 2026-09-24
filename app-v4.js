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
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
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

  async function analyzeWithAi(settings, prompt) {
    const sync = parse(localStorage.getItem(SYNC_KEY), {}) || {};
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
    const response = await fetch(`${projectOrigin}/functions/v1/${encodeURIComponent(functionName)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt,
        hasText: Boolean($('#aiMealText')?.value.trim()),
        photo: photoData ? { mimeType: photoData.mimeType, data: photoData.data } : null,
        model: settings.model || 'gpt-5.6-luna'
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `GPT 분석에 실패했어요. (${response.status})`);
    return body;
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
      @media(max-width:360px){.welcome{padding-right:118px}.welcome img{width:120px;height:120px}.calendar-grid,.calendar-weekdays{gap:2px}.calendar-day{height:52px}.activity-ring{width:26px;height:26px}.activity-ring:before{width:20px;height:20px}.activity-ring:after{width:14px;height:14px}.mascot-stats span{font-size:7px}}
    `;
    document.head.appendChild(style);
  }

  if (migrateMonthlyLog()) {
    location.reload();
    return;
  }
  injectStyles();
  updateMascot();
  refreshIcons();
  installCalendar();
  installMealComposer();
  removeDuplicateArchive();
  $('#saveWorkout')?.addEventListener('click', () => setTimeout(updateMascot, 850));
  window.addEventListener('hashchange', () => {
    if (location.hash === '#workout') renderCalendar();
    removeDuplicateArchive();
  });
  window.addEventListener('fitlog:state-updated', () => {
    updateMascot();
    renderCalendar();
  });
})();
