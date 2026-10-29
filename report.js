(() => {
  'use strict';

  // 리포트: 주간 · 월간 · 달력 탭.
  // 주간은 "이번 주 판정 → 몸의 변화 → 운동 → 식단 → 회복 → 다음 주 할 일" 순서로 읽히게 한다.
  const core = window.FitLogCore;
  if (!core) return;
  const { readState, writeState, showToast, dateKey, esc, workoutExercises } = core;
  const $ = (selector, root = document) => root.querySelector(selector);
  const partOf = (name, group) => core.exercisePart?.(name, group) || '기타';

  const DAY = 86400000;
  const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
  const PARTS = ['가슴', '등', '어깨', '팔', '하체', '코어'];
  // 부위별 주간 세트 권장 범위(큰 부위 10~20, 팔·코어는 보조로도 자극돼 조금 낮게)
  const BANDS = { 가슴: [10, 20], 등: [10, 20], 어깨: [10, 20], 하체: [10, 20], 팔: [6, 14], 코어: [4, 12] };
  const MEALS = ['아침', '점심', '저녁', '간식'];

  const addDays = (key, n) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + n); return dateKey(d); };
  const mondayOf = key => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dateKey(d); };
  const todayKey = () => dateKey(new Date());
  const range = (start, count) => Array.from({ length: Math.max(0, count) }, (_, i) => addDays(start, i));
  const between = (a, b) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / DAY);
  const fmt = n => Math.round(n).toLocaleString();
  const kg = n => (Math.round(n * 10) / 10).toFixed(1);
  const signed = (n, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`;
  const short = key => `${+key.slice(5, 7)}/${+key.slice(8)}`;
  const wd = key => WEEKDAY[new Date(`${key}T12:00:00`).getDay()];
  const sum = (list, k) => list.reduce((total, item) => total + (+item[k] || 0), 0);
  const avg = list => (list.length ? list.reduce((total, v) => total + v, 0) / list.length : null);
  // 받침에 따라 은/는, 이/가
  const josa = (word, pair) => { const code = word.charCodeAt(word.length - 1) - 0xac00; return code >= 0 && code % 28 ? pair[0] : pair[1]; };

  let tab = 'week';
  try { tab = sessionStorage.getItem('fitlog:reportTab') || 'week'; } catch {}
  let weekStart = null;
  let monthKey = null;

  // ---- 기록 읽기 ----
  const targets = state => ({ kcal: +state.profile?.targets?.kcal || 2200, protein: +state.profile?.targets?.protein || 150 });
  const mealsOf = (state, date) => state.logs?.[date]?.meals || [];
  const kcalOf = (state, date) => sum(mealsOf(state, date), 'kcal');
  const proteinOf = (state, date) => sum(mealsOf(state, date), 'protein');
  const workoutsOf = (state, date) => state.logs?.[date]?.workouts || [];
  const isSoccer = workout => /축구|풋살/.test(`${workout.group || ''} ${workout.note || ''} ${workout.name || ''}`) && !workoutExercises(workout).some(e => !e.cardio && e.setList?.length);
  const liftOn = (state, date) => workoutsOf(state, date).some(w => !isSoccer(w));
  const soccerOn = (state, date) => workoutsOf(state, date).some(isSoccer);
  const strengthSets = (state, date, fn) => workoutsOf(state, date).forEach(w => workoutExercises(w).forEach(e => { if (!e.cardio && e.setList?.length) fn(e, w); }));
  const e1rm = (weight, reps) => (weight > 0 && reps > 0 ? weight * (1 + Math.min(reps, 15) / 30) : 0);
  const exKey = name => String(name || '').replace(/\s+/g, '').toLowerCase();

  function weightPoints(state) {
    const map = new Map();
    (state.inbody || []).filter(r => !r.excluded && +r.weight > 20 && r.date).forEach(r => map.set(String(r.date).slice(0, 10), +r.weight));
    Object.entries(state.logs || {}).forEach(([date, log]) => { if (+log.weight > 20) map.set(date, +log.weight); });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, w]) => ({ date, w }));
  }
  // 7일 평균 체중: 그날까지 7일 안의 측정값 평균(물·염분에 흔들리는 하루 값 대신 추세를 본다)
  const trendAt = (points, date) => avg(points.filter(p => p.date > addDays(date, -7) && p.date <= date).map(p => p.w));
  function slopePerDay(points) {
    if (points.length < 3) return null;
    const xs = points.map(p => between(points[0].date, p.date));
    if (xs.at(-1) < 6) return null;
    const ys = points.map(p => p.w);
    const mx = avg(xs), my = avg(ys);
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
    return den ? num / den : null;
  }
  const inbodyList = state => (state.inbody || []).filter(r => !r.excluded && r.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const pbfOf = r => (r ? +(r.pbf ?? r.bodyFat) || null : null);

  // 종목별 지금까지의 최고 추정 1RM(날짜 순)
  function liftHistory(state) {
    const map = new Map();
    Object.keys(state.logs || {}).sort().forEach(date => strengthSets(state, date, e => {
      const best = e.setList.reduce((top, set) => { const v = e1rm(+set.weight, +set.reps); return v > top.v ? { v, w: +set.weight, r: +set.reps } : top; }, { v: 0 });
      if (!best.v) return;
      const key = exKey(e.name);
      if (!map.has(key)) map.set(key, { name: e.name, sessions: [] });
      map.get(key).sessions.push({ date, ...best, sets: e.setList.length });
    }));
    return map;
  }

  // ---- 한 주 요약 ----
  function weekStats(state, start) {
    const t = targets(state);
    const now = todayKey();
    const days = range(start, 7);
    const past = days.filter(d => d <= now);
    const current = start === mondayOf(now);
    const closed = current ? past.filter(d => d < now) : past;
    const ate = closed.filter(d => mealsOf(state, d).length);
    const kcalOk = ate.filter(d => Math.abs(kcalOf(state, d) - t.kcal) <= t.kcal * 0.1).length;
    const proteinOk = ate.filter(d => proteinOf(state, d) >= t.protein * 0.9).length;
    const lifts = days.filter(d => liftOn(state, d)).length;
    const soccer = days.filter(d => soccerOn(state, d)).length;
    const goal = +(state.profile?.workoutGoal || 5);
    const expected = current ? Math.max(1, Math.round(goal * past.length / 7)) : goal;
    const sleeps = past.map(d => +state.logs?.[d]?.sleep).filter(v => v > 0);
    const conds = past.map(d => +state.logs?.[d]?.condition).filter(v => v > 0);
    const parts = Object.fromEntries(PARTS.map(p => [p, 0]));
    let volume = 0;
    days.forEach(d => strengthSets(state, d, (e, w) => {
      const part = partOf(e.name, w.group);
      if (part in parts) parts[part] += e.setList.length;
      volume += e.setList.reduce((total, set) => total + (+set.weight || 0) * (+set.reps || 0), 0);
    }));
    const comps = [{ key: '운동', value: Math.min(1, lifts / expected), text: `근력 ${lifts}/${goal}회${soccer ? ` · 축구 ${soccer}` : ''}` }];
    if (ate.length) {
      comps.push({ key: '칼로리', value: kcalOk / ate.length, text: `목표 ±10% ${kcalOk}/${ate.length}일` });
      comps.push({ key: '단백질', value: proteinOk / ate.length, text: `목표 달성 ${proteinOk}/${ate.length}일` });
    }
    if (sleeps.length || conds.length) {
      const parts2 = [sleeps.length ? Math.min(1, avg(sleeps) / 7) : null, conds.length ? avg(conds) / 5 : null].filter(v => v != null);
      comps.push({ key: '회복', value: avg(parts2), text: [sleeps.length ? `수면 ${avg(sleeps).toFixed(1)}h` : '', conds.length ? `컨디션 ${avg(conds).toFixed(1)}/5` : ''].filter(Boolean).join(' · ') });
    }
    const score = Math.round(avg(comps.map(c => c.value)) * 100);
    return {
      start, days, past, closed, ate, kcalOk, proteinOk, lifts, soccer, goal, expected, sleeps, conds, parts, volume, comps, score, current, t,
      avgKcal: ate.length ? avg(ate.map(d => kcalOf(state, d))) : null,
      avgProtein: ate.length ? avg(ate.map(d => proteinOf(state, d))) : null
    };
  }

  // 실제 하루 소모량: 먹은 양 − 체중 변화(1kg ≈ 7,700kcal). 최근 21일.
  function tdeeEstimate(state, end) {
    const from = addDays(end, -20);
    const days = range(from, 21).filter(d => mealsOf(state, d).length);
    const points = weightPoints(state).filter(p => p.date >= from && p.date <= end);
    const slope = slopePerDay(points);
    const need = { meals: 10, weights: 4 };
    if (days.length < need.meals || points.length < need.weights || slope == null) return { ready: false, meals: days.length, weights: points.length, need };
    const intake = avg(days.map(d => kcalOf(state, d)));
    const tdee = intake - slope * 7700;
    return { ready: tdee > 1200 && tdee < 4500, intake, slope, tdee, meals: days.length, weights: points.length, need };
  }

  // ---- 그림 ----
  function ring(score, size = 116) {
    const r = size / 2 - 9, c = 2 * Math.PI * r;
    const value = score == null ? 0 : score / 100;
    const color = score >= 80 ? '#2fbf8f' : score >= 60 ? '#8fd16a' : score >= 40 ? '#f2b13c' : '#ff8f7a';
    return `<svg class="rx-ring" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#ffffff1f" stroke-width="12"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(c * value).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
  }

  function weightChart(points, from, to, inbodyDates) {
    const shown = points.filter(p => p.date >= from && p.date <= to);
    if (shown.length < 2) return '<p class="rx-empty">공복 체중을 2번 이상 기록하면 추세 선이 보여요. 아침 체크인에 적어 주세요.</p>';
    const W = 330, H = 160, L = 34, R = 10, T = 12, B = 24;
    const span = Math.max(1, between(from, to));
    const x = d => L + between(from, d) / span * (W - L - R);
    const trend = range(from, span + 1).filter(d => d >= shown[0].date).map(d => ({ d, v: trendAt(points, d) })).filter(p => p.v != null);
    const values = [...shown.map(p => p.w), ...trend.map(p => p.v)];
    let lo = Math.min(...values), hi = Math.max(...values);
    const pad = Math.max(0.4, (hi - lo) * 0.18);
    lo -= pad; hi += pad;
    const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
    const grid = [0, 0.5, 1].map(f => lo + (hi - lo) * f).map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="rx-grid"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" class="rx-axis" text-anchor="end">${v.toFixed(1)}</text>`).join('');
    const ticks = [from, addDays(from, Math.round(span / 2)), to].map((d, i) => `<text x="${x(d).toFixed(1)}" y="${H - 6}" class="rx-axis" text-anchor="${['start', 'middle', 'end'][i]}">${short(d)}</text>`).join('');
    const path = trend.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const dots = shown.map(p => inbodyDates.has(p.date)
      ? `<rect x="${(x(p.date) - 4.5).toFixed(1)}" y="${(y(p.w) - 4.5).toFixed(1)}" width="9" height="9" rx="2" class="rx-inbody-dot" transform="rotate(45 ${x(p.date).toFixed(1)} ${y(p.w).toFixed(1)})"/>`
      : `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.w).toFixed(1)}" r="3" class="rx-dot"/>`).join('');
    return `<svg class="rx-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="체중 추세">${grid}${ticks}${dots}<path d="${path}" class="rx-trend"/></svg>`;
  }

  function spark(values) {
    if (values.filter(v => v != null).length < 2) return '';
    const W = 92, H = 30;
    const known = values.map((v, i) => ({ v, i })).filter(p => p.v != null);
    const lo = Math.min(...known.map(p => p.v)), hi = Math.max(...known.map(p => p.v));
    const x = i => 3 + i / (values.length - 1) * (W - 6);
    const y = v => (hi === lo ? H / 2 : 4 + (hi - v) / (hi - lo) * (H - 8));
    const path = known.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const last = known.at(-1);
    return `<svg class="rx-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${path}"/><circle cx="${x(last.i).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="3"/></svg>`;
  }

  const card = (cls, eyebrow, title, body, extra = '') => `<section class="rx-card ${cls}">${extra}<div class="rx-head"><small>${eyebrow}</small><h3>${title}</h3></div>${body}</section>`;

  // ---- ① 이번 주 점수 ----
  function scoreCard(state, w, prev) {
    const label = w.score == null ? '기록을 시작해요' : w.score >= 80 ? '훌륭한 한 주' : w.score >= 60 ? '좋은 흐름' : w.score >= 40 ? '조금 아쉬워요' : '다시 시작해요';
    const prevHasData = prev && (prev.lifts || prev.soccer || prev.ate.length || prev.sleeps.length);
    const delta = prevHasData && w.score != null ? w.score - prev.score : null;
    const sorted = [...w.comps].sort((a, b) => b.value - a.value);
    const best = sorted[0], worst = sorted.at(-1);
    const coach = state.profile?.weeklyCoach;
    const coachFits = coach?.headline && coach.period?.end && coach.period.end >= w.start && coach.period.end <= addDays(w.start, 7);
    const line = coachFits ? coach.headline
      : w.comps.length < 2 ? '식사·체크인을 기록하면 점수가 더 정확해져요.'
      : best.value - worst.value < 0.15 ? `${best.key}·${worst.key} 모두 고르게 지켰어요.`
      : `${best.key}${josa(best.key, ['은', '는'])} 잘 지켰고, ${worst.key}${josa(worst.key, ['이', '가'])} 아쉬웠어요.`;
    const isThis = w.start === mondayOf(todayKey());
    const badges = window.FitLogHome?.badgesMarkup ? window.FitLogHome.badgesMarkup(state, w.start, isThis ? '이번 주 배지' : '그 주 배지') : '';
    return `<section class="rx-card rx-score">
      <div class="rx-weeknav"><button type="button" data-rx-week="-1" aria-label="지난주">‹</button><b>${isThis ? '이번 주' : `${short(w.start)} 주`} <small>${short(w.start)}~${short(addDays(w.start, 6))}</small></b><button type="button" data-rx-week="1" aria-label="다음 주" ${isThis ? 'disabled' : ''}>›</button></div>
      <div class="rx-score-main">
        <div class="rx-ring-wrap">${ring(w.score)}<div><b>${w.score ?? '–'}</b><small>/100</small></div></div>
        <div class="rx-score-text"><strong>${label}</strong>${delta != null ? `<span class="rx-delta ${delta >= 0 ? 'up' : 'down'}">지난주보다 ${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}</span>` : ''}<p>${esc(line)}</p></div>
      </div>
      <div class="rx-comps">${w.comps.map(c => `<div><span>${c.key}</span><i><b style="width:${Math.round(c.value * 100)}%"></b></i><small>${esc(c.text)}</small></div>`).join('')}</div>
      ${badges ? `<details class="rx-badges"><summary>배지 보기</summary>${badges}</details>` : ''}
    </section>`;
  }

  // ---- ② 체중 추세 + 인바디 ----
  function weightCard(state, w) {
    const end = w.current ? todayKey() : addDays(w.start, 6);
    const from = addDays(end, -34);
    const points = weightPoints(state);
    const inbody = inbodyList(state);
    const now = trendAt(points, end);
    const before = trendAt(points, addDays(end, -7));
    const change = now != null && before != null ? now - before : null;
    const setup = state.profile?.goalSetup || {};
    const paceKg = { slow: 0.25, normal: 0.5, fast: 0.75 }[setup.pace] || (setup.goal === 'cut' ? 0.5 : 0);
    const cutting = setup.goal ? setup.goal === 'cut' : true;
    let status = '';
    if (change != null && cutting) {
      const loss = -change;
      if (now && loss > now * 0.01) status = `<p class="rx-note warn">일주일에 체중의 1% 넘게 빠지고 있어요. 근육이 빠질 수 있어 하루 +150kcal을 추천해요.</p>`;
      else if (paceKg && loss < paceKg * 0.6) status = `<p class="rx-note">목표 속도(주 −${paceKg}kg)보다 느려요(이번 주 ${signed(change)}kg). 2주 연속이면 칼로리를 −100~150 줄여 보세요.</p>`;
      else if (paceKg) status = `<p class="rx-note ok">목표 속도(주 −${paceKg}kg)에 잘 맞게 빠지고 있어요.</p>`;
    }
    // 목표 체지방률까지 예상
    const latest = inbody.at(-1), previous = inbody.at(-2);
    let eta = '';
    const pbf = pbfOf(latest);
    const targetPbf = +setup.targetPbf || +state.profile?.targetFat || 0;
    if (cutting && pbf && targetPbf && pbf > targetPbf && now) {
      const lbm = +latest.weight * (1 - pbf / 100);
      const goalWeight = lbm / (1 - targetPbf / 100);
      const rate = change != null && change < -0.05 ? -change : paceKg;
      if (rate > 0 && now > goalWeight) {
        const weeks = Math.ceil((now - goalWeight) / rate);
        eta = `<div class="rx-eta"><span>체지방 ${targetPbf}% 목표 체중</span><b>${kg(goalWeight)}kg</b><small>지금 속도면 약 ${weeks}주 뒤 (${short(addDays(end, weeks * 7))})</small></div>`;
      }
    }
    const ib = latest ? `<div class="rx-inbody"><div class="rx-inbody-head"><b>◆ 인바디 ${short(String(latest.date).slice(0, 10))}</b>${previous ? `<small>지난 측정(${short(String(previous.date).slice(0, 10))}) 대비</small>` : ''}</div><div class="rx-inbody-grid">
      ${[['체중', +latest.weight, previous && +previous.weight, 'kg', -1], ['골격근량', +latest.smm, previous && +previous.smm, 'kg', 1], ['체지방률', pbf, pbfOf(previous), '%', -1]].map(([name, v, p, unit, good]) => v ? `<div><span>${name}</span><b>${kg(v)}<small>${unit}</small></b>${p ? `<em class="${(v - p) * good > 0 ? 'good' : (v - p) * good < 0 ? 'bad' : ''}">${signed(v - p)}</em>` : ''}</div>` : '').join('')}
      </div></div>` : '';
    const stats = now != null ? `<div class="rx-stats"><div><span>7일 평균</span><b>${kg(now)}<small>kg</small></b></div><div><span>일주일 변화</span><b class="${change == null ? '' : change < 0 ? 'down' : 'up'}">${change == null ? '–' : signed(change)}<small>kg</small></b></div><div><span>목표 속도</span><b>${paceKg ? `−${paceKg}` : '–'}<small>kg/주</small></b></div></div>` : '';
    return card('rx-body', '몸의 변화', '체중 추세', `${stats}${weightChart(points, from, end, new Set(inbody.map(r => String(r.date).slice(0, 10))))}${points.filter(p => p.date >= from && p.date <= end).length >= 2 ? '<p class="rx-legend"><i class="line"></i>7일 평균 <i class="dot"></i>그날 체중 <i class="dia"></i>인바디</p>' : ''}${status}${eta}${ib}`);
  }

  // ---- ③ 실제 소모 칼로리 ----
  function tdeeCard(state, w) {
    const end = w.current ? addDays(todayKey(), -1) : addDays(w.start, 6);
    const est = tdeeEstimate(state, end);
    const target = targets(state).kcal;
    if (!est.ready) {
      const pct = Math.round(Math.min(1, est.meals / est.need.meals) * 50 + Math.min(1, est.weights / est.need.weights) * 50);
      return card('rx-tdee', '몸의 변화', '내 실제 소모 칼로리', `<p class="rx-empty">먹은 양과 체중 변화로 실제 하루 소모량을 계산해요. 최근 3주 안에 <b>식사 기록 ${est.need.meals}일</b>, <b>체중 ${est.need.weights}번</b>이 모이면 보여드려요.</p><div class="rx-progress"><i style="width:${pct}%"></i></div><small class="rx-sub">지금 식사 ${est.meals}일 · 체중 ${est.weights}번</small>`);
    }
    // 실제 적자 = 실제 소모 − 실제로 먹은 양. 목표대로 먹으면 얼마나 적자인지도 함께 알려준다.
    const deficit = est.tdee - est.intake;
    const planned = est.tdee - target;
    const plannedText = Math.abs(planned - deficit) >= 100 ? ` 목표(${fmt(target)})대로 먹으면 하루 ${fmt(planned)}kcal 적자예요.` : '';
    const advice = deficit > 1000 ? ['warn', `실제로 하루 약 ${fmt(deficit)}kcal 적자예요. 근육이 빠질 수 있어 +200kcal을 추천해요.`]
      : deficit > 250 ? ['ok', `실제로 하루 약 ${fmt(deficit)}kcal 적자 · 감량하기 좋은 범위예요.${plannedText}`]
      : deficit > -150 ? ['', `실제로는 거의 유지 수준(적자 ${fmt(Math.max(0, deficit))}kcal)이에요.${plannedText || ' 감량하려면 −150~250kcal 줄이거나 걷기를 늘려 보세요.'}`]
      : ['warn', `소모보다 하루 ${fmt(-deficit)}kcal 많이 먹고 있어요.${plannedText}`];
    return card('rx-tdee', '몸의 변화', '내 실제 소모 칼로리', `<div class="rx-tdee-main"><b>${fmt(est.tdee)}</b><small>kcal / 하루</small></div>
      <div class="rx-tdee-row"><div><span>평균 섭취</span><b>${fmt(est.intake)}</b></div><div><span>체중 추세</span><b>${signed(est.slope * 7)}kg/주</b></div><div><span>지금 목표</span><b>${fmt(target)}</b></div></div>
      <p class="rx-note ${advice[0]}">${advice[1]}</p><small class="rx-sub">최근 3주 · 식사 기록 ${est.meals}일 · 체중 ${est.weights}번 기준 추정이에요(기록 안 한 날은 빼고 계산).</small>`);
  }

  // ---- ④ 부위별 운동량 ----
  function partsCard(state, w, prev) {
    const max = 24;
    const rows = PARTS.map(part => {
      const sets = w.parts[part];
      const [lo, hi] = BANDS[part];
      const soccerCovers = part === '하체' && w.soccer > 0;
      const tone = soccerCovers && sets < lo ? 'soccer' : sets < lo ? 'low' : sets > hi ? 'high' : 'ok';
      const tag = { soccer: `⚽ ×${w.soccer}`, low: `${lo - sets}세트 ${w.current ? "남음" : "부족"}`, high: "많음", ok: "적정" }[tone];
      return `<div class="rx-part ${tone}"><span>${part}</span><div class="rx-bar"><i class="band" style="left:${lo / max * 100}%;width:${(hi - lo) / max * 100}%"></i><b style="width:${Math.min(100, sets / max * 100)}%"></b></div><em>${sets}</em><small>${tag}</small></div>`;
    }).join('');
    const dots = w.days.map(d => {
      const mark = liftOn(state, d) ? '✓' : soccerOn(state, d) ? '⚽' : '';
      const cls = liftOn(state, d) ? 'lift' : soccerOn(state, d) ? 'soccer' : d > todayKey() ? 'future' : 'rest';
      return `<div class="rx-day ${cls} ${d === todayKey() ? 'today' : ''}"><i>${mark}</i><small>${wd(d)}</small></div>`;
    }).join('');
    // 진행 중인 주는 지난주의 같은 요일까지와 비교한다.
    let prevVolume = prev?.volume || 0;
    if (w.current && prev) {
      prevVolume = 0;
      prev.days.slice(0, w.past.length).forEach(d => strengthSets(state, d, e => { prevVolume += e.setList.reduce((total, set) => total + (+set.weight || 0) * (+set.reps || 0), 0); }));
    }
    const vChange = prevVolume ? Math.round((w.volume - prevVolume) / prevVolume * 100) : null;
    return card('rx-work', '운동', '부위별 운동량', `<div class="rx-days">${dots}</div>
      <div class="rx-stats"><div><span>근력</span><b>${w.lifts}<small>/${w.goal}회</small></b></div><div><span>축구</span><b>${w.soccer}<small>회</small></b></div><div><span>총 볼륨</span><b>${w.volume >= 10000 ? `${(w.volume / 1000).toFixed(1)}<small>t</small>` : `${fmt(w.volume)}<small>kg</small>`}</b>${vChange != null ? `<em class="${vChange >= 0 ? 'good' : 'bad'}">${vChange >= 0 ? '+' : ''}${vChange}%</em>` : ''}</div></div>
      <div class="rx-parts">${rows}</div><p class="rx-legend"><i class="band"></i>권장 범위(주간 세트) · 축구 주에는 하체를 축구가 대신해요</p>`);
  }

  // ---- ⑤ 성장 기록 ----
  function prCard(state, w) {
    const history = liftHistory(state);
    const end = addDays(w.start, 6);
    const prs = [];
    history.forEach(item => {
      const before = item.sessions.filter(s => s.date < w.start);
      const during = item.sessions.filter(s => s.date >= w.start && s.date <= end);
      if (!before.length || !during.length) return;
      const old = Math.max(...before.map(s => s.v));
      const top = during.reduce((a, b) => (b.v > a.v ? b : a));
      if (top.v > old + 0.01) prs.push({ name: item.name, ...top, gain: top.v - old });
    });
    prs.sort((a, b) => b.gain - a.gain);
    // 최근 8주 가장 자주 한 종목 3개
    const from = addDays(w.start, -49);
    const main = [...history.values()].map(item => ({ ...item, recent: item.sessions.filter(s => s.date >= from && s.date <= end) }))
      .filter(item => item.recent.length >= 2).sort((a, b) => b.recent.length - a.recent.length).slice(0, 3);
    const trendRows = main.map(item => {
      const weekly = Array.from({ length: 8 }, (_, i) => { const s = addDays(from, i * 7); const list = item.recent.filter(x => x.date >= s && x.date < addDays(s, 7)); return list.length ? Math.max(...list.map(x => x.v)) : null; });
      const first = weekly.find(v => v != null), last = [...weekly].reverse().find(v => v != null);
      return `<div class="rx-lift"><div><b>${esc(item.name)}</b><small>추정 1RM ${fmt(last)}kg</small></div>${spark(weekly)}<em class="${last - first >= 0 ? 'good' : 'bad'}">${signed(last - first, 1)}kg</em></div>`;
    }).join('');
    const prList = prs.length ? `<ul class="rx-prs">${prs.slice(0, 5).map(p => `<li><span>🏆</span><div><b>${esc(p.name)}</b><small>${+(Math.round(p.w * 10) / 10)}kg × ${p.r}회 · 추정 1RM ${fmt(p.v)}kg</small></div><em>+${kg(p.gain)}kg</em></li>`).join('')}</ul>`
      : `<p class="rx-empty">${w.lifts ? '이번 주엔 새 기록이 없어요. 주력 종목에서 무게 +2.5kg이나 1회 더 도전해 봐요.' : '운동을 기록하면 최고 기록을 찾아드려요.'}</p>`;
    return card('rx-work', '운동', `성장 기록${prs.length ? ` <span class="rx-count">${prs.length}</span>` : ''}`, `${prList}${trendRows ? `<h4 class="rx-sub-title">주력 종목 8주 추세</h4>${trendRows}` : ''}`);
  }

  // ---- ⑥ 식단 패턴 ----
  function dietCard(state, w) {
    const end = w.current ? addDays(todayKey(), -1) : addDays(w.start, 6);
    const days = range(addDays(end, -27), 28).filter(d => mealsOf(state, d).length);
    const t = targets(state);
    const compare = (label, a, b, nameA, nameB) => {
      if (a.length < 2 || b.length < 2) return '';
      const ka = avg(a.map(d => kcalOf(state, d))), kb = avg(b.map(d => kcalOf(state, d)));
      const pa = avg(a.map(d => proteinOf(state, d))), pb = avg(b.map(d => proteinOf(state, d)));
      const top = Math.max(ka, kb, t.kcal) * 1.1;
      const diff = Math.round(kb - ka);
      return `<div class="rx-compare"><h4>${label}</h4>
        ${[[nameA, ka, pa, a.length], [nameB, kb, pb, b.length]].map(([n, k, p, c]) => `<div class="rx-cmp-row"><span>${n}<small>${c}일</small></span><div class="rx-bar"><i class="goal" style="left:${t.kcal / top * 100}%"></i><b style="width:${k / top * 100}%" class="${k > t.kcal * 1.1 ? 'over' : ''}"></b></div><em>${fmt(k)}<small>kcal · 단백질 ${Math.round(p)}g</small></em></div>`).join('')}
        ${Math.abs(diff) >= 150 ? `<p class="rx-note ${diff > 0 ? 'warn' : ''}">${nameB}${josa(nameB, ['이', '가'])} 평균 ${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))}kcal ${diff > 0 ? '더 먹어요' : '덜 먹어요'}.</p>` : ''}</div>`;
    };
    const lunchDays = days.filter(d => mealsOf(state, d).some(m => m.src === 'lunch'));
    const otherDays = days.filter(d => !lunchDays.includes(d));
    const weekend = days.filter(d => [0, 6].includes(new Date(`${d}T12:00:00`).getDay()));
    const weekday = days.filter(d => !weekend.includes(d));
    // 이번 주 끼니별 단백질·칼로리 비율
    const weekAte = w.ate;
    const share = MEALS.map(m => ({ m, p: avg(weekAte.map(d => sum(mealsOf(state, d).filter(x => x.meal === m), 'protein'))) || 0, k: avg(weekAte.map(d => sum(mealsOf(state, d).filter(x => x.meal === m), 'kcal'))) || 0 }));
    const totalP = share.reduce((a, b) => a + b.p, 0), totalK = share.reduce((a, b) => a + b.k, 0);
    const dinner = share.find(s => s.m === '저녁');
    const breakfast = share.find(s => s.m === '아침');
    const tip = totalP && dinner.p / totalP > 0.45 ? `단백질이 저녁에 ${Math.round(dinner.p / totalP * 100)}% 몰려 있어요. 아침에 20g(그릭요거트·계란 2개)을 옮기면 근육 합성에 더 좋아요.`
      : totalP && breakfast.p < 15 ? `아침 단백질이 ${Math.round(breakfast.p)}g이에요. 20g 이상으로 시작해 보세요.` : '';
    const mealBars = weekAte.length ? `<div class="rx-compare"><h4>끼니별 비율 <small>이번 주 평균</small></h4>
      ${[['단백질', 'p', totalP, 'g'], ['칼로리', 'k', totalK, 'kcal']].map(([label, k, total, unit]) => `<div class="rx-stack-row"><span>${label}<small>${fmt(total)}${unit}</small></span><div class="rx-stack">${share.map((s, i) => (total && s[k] ? `<b class="m${i}" style="width:${s[k] / total * 100}%">${s[k] / total >= 0.14 ? `${Math.round(s[k] / total * 100)}%` : ''}</b>` : '')).join('')}</div></div>`).join('')}
      <p class="rx-legend">${MEALS.map((m, i) => `<i class="m${i}"></i>${m}`).join(' ')}</p>${tip ? `<p class="rx-note">${tip}</p>` : ''}</div>` : '';
    // 급식 날이 곧 평일이면 같은 비교가 두 번 나오므로 평일·주말만 보여준다.
    const sameAsWeekday = lunchDays.length === weekday.length && lunchDays.every(d => weekday.includes(d));
    const comparisons = [sameAsWeekday ? '' : compare('급식 먹은 날 vs 아닌 날', lunchDays, otherDays, '급식 날', '급식 없는 날'), compare(sameAsWeekday ? '평일(급식) vs 주말' : '평일 vs 주말', weekday, weekend, '평일', '주말')].join('');
    const body = `${mealBars}${comparisons || (days.length < 4 ? '<p class="rx-empty">식사를 더 기록하면 평일·주말, 급식 날 비교가 보여요.</p>' : '')}`;
    return card('rx-food', '식단', '식단 패턴', `${w.avgKcal != null ? `<div class="rx-stats"><div><span>평균 섭취</span><b>${fmt(w.avgKcal)}<small>kcal</small></b><em class="${w.avgKcal > w.t.kcal * 1.1 ? 'bad' : 'good'}">목표 ${fmt(w.t.kcal)}</em></div><div><span>단백질</span><b>${Math.round(w.avgProtein)}<small>g</small></b><em class="${w.avgProtein >= w.t.protein * 0.9 ? 'good' : 'bad'}">목표 ${w.t.protein}g</em></div></div>` : ''}${body}<small class="rx-sub">비교는 최근 4주 기록 기준이에요.</small>`);
  }

  // ---- ⑦ 회복 ----
  function recoveryCard(state, w) {
    const sleepBars = w.days.map(d => {
      const log = state.logs?.[d] || {};
      const h = +log.sleep || 0;
      const c = +log.condition || 0;
      return `<div class="rx-sleep ${d > todayKey() ? 'future' : ''}"><i style="height:${Math.min(100, h / 9 * 100)}%" class="${h && h < 6.5 ? 'short' : ''}"></i><em class="c${c}">${c ? ['', '😫', '😕', '🙂', '😊', '🔥'][c] : ''}</em><small>${wd(d)}</small><span>${h ? `${h}h` : ''}</span></div>`;
    }).join('');
    // 최근 4주: 잠을 덜 잔 날의 운동 볼륨·RPE 비교
    const end = addDays(w.start, 6);
    const pairs = range(addDays(end, -27), 28).filter(d => +state.logs?.[d]?.sleep > 0 && liftOn(state, d)).map(d => {
      let volume = 0;
      strengthSets(state, d, e => { volume += e.setList.reduce((total, set) => total + (+set.weight || 0) * (+set.reps || 0), 0); });
      const rpes = workoutsOf(state, d).map(x => +x.rpe).filter(Boolean);
      return { sleep: +state.logs[d].sleep, volume, rpe: avg(rpes) };
    });
    const shortSleep = pairs.filter(p => p.sleep < 6.5), good = pairs.filter(p => p.sleep >= 6.5);
    let insight = '<p class="rx-empty">수면을 적은 날 운동이 쌓이면, 잠이 운동에 주는 영향을 보여드려요.</p>';
    if (shortSleep.length >= 2 && good.length >= 2) {
      const vs = avg(shortSleep.map(p => p.volume)), vg = avg(good.map(p => p.volume));
      const rs = avg(shortSleep.map(p => p.rpe).filter(Boolean)), rg = avg(good.map(p => p.rpe).filter(Boolean));
      const pct = vg ? Math.round((vs - vg) / vg * 100) : 0;
      insight = `<div class="rx-insight"><div><span>6.5시간 이상 잔 날</span><b>${fmt(vg)}kg</b>${rg ? `<small>RPE ${rg.toFixed(1)}</small>` : ''}</div><div><span>덜 잔 날</span><b>${fmt(vs)}kg <em class="${pct < 0 ? 'bad' : 'good'}">${pct > 0 ? '+' : ''}${pct}%</em></b>${rs ? `<small>RPE ${rs.toFixed(1)}</small>` : ''}</div></div>
        <p class="rx-note ${pct <= -8 ? 'warn' : ''}">${pct <= -8 ? `잠이 부족한 날 운동량이 ${-pct}% 줄었어요. 그런 날은 무게를 유지하고 세트를 줄이는 게 좋아요.` : '잠이 조금 부족해도 운동량은 잘 유지하고 있어요.'}</p>`;
    } else if (pairs.length >= 3 && !shortSleep.length) {
      insight = '<p class="rx-note ok">운동한 날은 모두 6.5시간 이상 잤어요. 좋아요!</p>';
    }
    return card('rx-rest', '회복', '수면 · 컨디션', `${w.sleeps.length ? `<div class="rx-stats"><div><span>평균 수면</span><b>${avg(w.sleeps).toFixed(1)}<small>시간</small></b></div><div><span>평균 컨디션</span><b>${w.conds.length ? avg(w.conds).toFixed(1) : '–'}<small>/5</small></b></div></div>` : ''}<div class="rx-sleeps">${sleepBars}</div>${insight}`);
  }

  // ---- ⑧ 다음 주 할 일 ----
  function actionsFor(state, w) {
    const list = [];
    const add = (priority, icon, title, detail, plan) => list.push({ priority, icon, title, detail, plan });
    if (w.lifts < w.expected) add(10, '🏋️', `근력 주 ${w.goal}회 채우기`, `${w.current ? '지금까지' : '이번 주'} ${w.lifts}회. 바쁜 날은 30분짜리 짧은 루틴이라도 해요.`, `근력 운동 주 ${w.goal}회를 꼭 채운다. 시간이 없는 날은 30분 이내의 짧은 루틴(3종목)으로 짠다.`);
    const weak = PARTS.filter(p => ['가슴', '등', '어깨'].includes(p) && w.parts[p] < BANDS[p][0]).sort((a, b) => w.parts[a] - w.parts[b])[0];
    if (weak && w.lifts && (!w.current || w.past.length >= 6)) add(8, '💪', `${weak} 세트 +${BANDS[weak][0] - w.parts[weak]}`, `이번 주 ${weak} ${w.parts[weak]}세트 · 주 10세트 이상이 근성장에 좋아요.`, `${weak} 주간 세트를 10세트 이상으로 늘린다(이번 주 ${w.parts[weak]}세트였다).`);
    if (w.ate.length >= 3 && w.proteinOk / w.ate.length < 0.6) {
      const gap = Math.max(10, Math.round((w.t.protein - w.avgProtein) / 5) * 5);
      add(9, '🥚', `단백질 하루 +${gap}g`, `평균 ${Math.round(w.avgProtein)}g · 아침에 그릭요거트·계란, 간식으로 단백질 음료를 더해요.`, null);
    }
    if (w.avgKcal != null && w.avgKcal > w.t.kcal * 1.1) add(9, '🍽️', '저녁·간식 양 줄이기', `평균 ${fmt(w.avgKcal)}kcal로 목표보다 ${fmt(w.avgKcal - w.t.kcal)}kcal 많아요.`, null);
    const est = tdeeEstimate(state, w.current ? addDays(todayKey(), -1) : addDays(w.start, 6));
    if (est.ready && est.tdee - w.t.kcal > 1000) add(9, '⚠️', '조금 더 먹기 (+200kcal)', `실제 소모 약 ${fmt(est.tdee)}kcal · 적자가 너무 커서 근육이 빠질 수 있어요.`, null);
    if (w.sleeps.length >= 3 && avg(w.sleeps) < 6.5) add(7, '😴', '수면 30분 늘리기', `평균 ${avg(w.sleeps).toFixed(1)}시간 · 잠이 부족하면 근력과 식욕 조절이 모두 떨어져요.`, '수면이 부족하니 강도는 RPE 8 이하로 유지하고 세트 수를 과하게 늘리지 않는다.');
    if (!list.length && w.lifts >= w.goal) add(5, '📈', '주력 종목 무게 +2.5kg', '목표를 잘 지켰어요. 이제 점진적 과부하로 한 단계 올려요.', '목표 횟수를 채운 주력 종목은 무게를 +2.5kg(하체 +5kg) 올린다.');
    const coach = state.profile?.weeklyCoach;
    (coach?.nextActions || []).slice(0, 2).forEach(text => add(4, '🤖', String(text).slice(0, 40), 'AI 주간 리포트의 제안이에요.', String(text)));
    return list.sort((a, b) => b.priority - a.priority).slice(0, 3);
  }

  function actionsCard(state, w) {
    const focus = state.profile?.planFocus || [];
    const items = actionsFor(state, w);
    if (!items.length) return card('rx-next', '다음 주', '할 일 3가지', '<p class="rx-empty">기록이 쌓이면 다음 주에 바꿀 점을 골라 드려요.</p>');
    return card('rx-next', '다음 주', '할 일 3가지', `<ol class="rx-actions">${items.map((item, i) => {
      const on = item.plan && focus.some(f => f.text === item.plan);
      return `<li><span class="rx-action-no">${i + 1}</span><div><b>${item.icon} ${esc(item.title)}</b><small>${esc(item.detail)}</small></div>${item.plan ? `<button type="button" class="${on ? 'on' : ''}" data-rx-focus="${esc(item.plan)}">${on ? '반영됨 ✓' : '계획에 반영'}</button>` : ''}</li>`;
    }).join('')}</ol><small class="rx-sub">'계획에 반영'을 누르면 다음 AI 주간 계획에 넣어요(2주 동안).</small>`);
  }

  // ---- 월간 ----
  function monthView(state) {
    const now = todayKey();
    const key = monthKey || now.slice(0, 7);
    const [yy, mm] = key.split('-').map(Number);
    const first = `${key}-01`;
    const last = dateKey(new Date(yy, mm, 0));
    const days = range(first, between(first, last) + 1).filter(d => d <= now);
    const t = targets(state);
    const liftDays = days.filter(d => liftOn(state, d));
    const soccerDays = days.filter(d => soccerOn(state, d));
    let volume = 0, sets = 0;
    const exCount = new Map();
    days.forEach(d => strengthSets(state, d, e => {
      sets += e.setList.length;
      volume += e.setList.reduce((total, set) => total + (+set.weight || 0) * (+set.reps || 0), 0);
      exCount.set(e.name, (exCount.get(e.name) || 0) + e.setList.length);
    }));
    const ate = days.filter(d => d < now && mealsOf(state, d).length);
    const avgK = ate.length ? avg(ate.map(d => kcalOf(state, d))) : null;
    const avgP = ate.length ? avg(ate.map(d => proteinOf(state, d))) : null;
    const kcalOk = ate.filter(d => Math.abs(kcalOf(state, d) - t.kcal) <= t.kcal * 0.1).length;
    const water = days.filter(d => +state.logs?.[d]?.water >= 8).length;
    const checkins = days.filter(d => +state.logs?.[d]?.weight && +state.logs?.[d]?.sleep).length;
    const points = weightPoints(state);
    const wStart = trendAt(points, addDays(first, 6)) ?? points.find(p => p.date >= first)?.w;
    const wEnd = trendAt(points, days.at(-1) || first);
    const history = liftHistory(state);
    let prCount = 0;
    const prNames = [];
    history.forEach(item => {
      let best = 0;
      item.sessions.forEach(s => {
        if (s.date >= first && s.date <= last && best && s.v > best + 0.01) { prCount++; if (!prNames.includes(item.name)) prNames.push(item.name); }
        best = Math.max(best, s.v);
      });
    });
    const dayFreq = [0, 0, 0, 0, 0, 0, 0];
    liftDays.forEach(d => { dayFreq[new Date(`${d}T12:00:00`).getDay()]++; });
    const favDay = Math.max(...dayFreq) ? WEEKDAY[dayFreq.indexOf(Math.max(...dayFreq))] : null;
    const topEx = [...exCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const weeks = [];
    for (let s = mondayOf(first); s <= (days.at(-1) || first); s = addDays(s, 7)) weeks.push(weekStats(state, s));
    const inbody = inbodyList(state).filter(r => String(r.date).slice(0, 7) === key);
    const isNow = key === now.slice(0, 7);
    const prevKey = dateKey(new Date(yy, mm - 2, 1)).slice(0, 7);
    const nextKey = dateKey(new Date(yy, mm, 1)).slice(0, 7);
    return `<section class="rx-card rx-month">
      <div class="rx-weeknav"><button type="button" data-rx-month="${prevKey}" aria-label="지난달">‹</button><b>${yy}년 ${mm}월 <small>${isNow ? '진행 중' : '요약'}</small></b><button type="button" data-rx-month="${nextKey}" aria-label="다음 달" ${isNow ? 'disabled' : ''}>›</button></div>
      <div class="rx-wrap">
        <div class="t work"><span>운동한 날</span><b>${liftDays.length}<small>일</small></b><small>${soccerDays.length ? `⚽ 축구 ${soccerDays.length}번` : `주 평균 ${(liftDays.length / Math.max(1, days.length / 7)).toFixed(1)}회`}</small></div>
        <div class="t work"><span>들어 올린 무게</span><b>${volume >= 10000 ? `${(volume / 1000).toFixed(1)}<small>t</small>` : `${fmt(volume)}<small>kg</small>`}</b><small>${sets}세트</small></div>
        <div class="t body"><span>체중 변화</span><b>${wStart != null && wEnd != null ? signed(wEnd - wStart) : '–'}<small>kg</small></b><small>${wEnd != null ? `7일 평균 ${kg(wEnd)}kg` : '체중 기록 없음'}</small></div>
        <div class="t pr"><span>새 기록</span><b>${prCount}<small>번</small></b><small>${prNames.slice(0, 2).map(esc).join(', ') || '다음 달엔 꼭!'}</small></div>
        <div class="t food"><span>평균 섭취</span><b>${avgK ? fmt(avgK) : '–'}<small>kcal</small></b><small>${ate.length ? `목표 맞춘 날 ${kcalOk}/${ate.length}일` : '식사 기록 없음'}</small></div>
        <div class="t food"><span>평균 단백질</span><b>${avgP ? Math.round(avgP) : '–'}<small>g</small></b><small>목표 ${t.protein}g</small></div>
      </div>
      <div class="rx-month-weeks"><h4>주간 점수</h4><div>${weeks.map(w => `<div><i style="height:${w.score ?? 0}%" class="${(w.score ?? 0) >= 60 ? 'good' : ''}"></i><b>${w.score ?? '–'}</b><small>${short(w.start)}</small></div>`).join('')}</div></div>
      <ul class="rx-facts">
        ${favDay ? `<li><span>📅</span><p>가장 꾸준한 요일은 <b>${favDay}요일</b> (${Math.max(...dayFreq)}번)</p></li>` : ''}
        ${topEx.length ? `<li><span>🏋️</span><p>가장 많이 한 종목 <b>${topEx.map(([n, c]) => `${esc(n)} ${c}세트`).join(' · ')}</b></p></li>` : ''}
        <li><span>💧</span><p>물 2L 마신 날 <b>${water}일</b> · 체크인 <b>${checkins}일</b></p></li>
        ${inbody.length ? `<li><span>◆</span><p>인바디 ${inbody.length}번 측정 · 마지막 골격근량 <b>${inbody.at(-1).smm ? `${kg(+inbody.at(-1).smm)}kg` : '–'}</b>, 체지방률 <b>${pbfOf(inbody.at(-1)) ? `${kg(pbfOf(inbody.at(-1)))}%` : '–'}</b></p></li>` : ''}
      </ul>
    </section>`;
  }

  // ---- 탭 · 화면 배치 ----
  function install() {
    const report = $('[data-view="report"] .content') || $('[data-view="report"]');
    if (!report || $('#rpTabs')) return Boolean($('#rpTabs'));
    const header = report.querySelector('header');
    const tabs = document.createElement('nav');
    tabs.id = 'rpTabs';
    tabs.className = 'rx-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.innerHTML = [['week', '주간'], ['month', '월간'], ['calendar', '달력']].map(([id, label]) => `<button type="button" role="tab" data-rx-tab="${id}">${label}</button>`).join('');
    if (header) header.after(tabs); else report.prepend(tabs);
    const panes = Object.fromEntries(['week', 'month', 'calendar'].map(id => {
      const pane = document.createElement('div');
      pane.id = `rx-${id}`;
      pane.className = 'rx-pane';
      return [id, pane];
    }));
    tabs.after(panes.week, panes.month, panes.calendar);
    panes.week.innerHTML = '<div id="rxWeek"></div>';
    panes.month.innerHTML = '<div id="rxMonth"></div>';
    // 기존 카드: AI 주간 리포트는 주간 아래, 인바디 상세는 월간 아래, 달력은 달력 탭으로 옮긴다.
    const coachFold = $('#foldCoach');
    if (coachFold) { panes.week.append(coachFold); const title = coachFold.querySelector('summary strong'); if (title) title.textContent = 'AI 주간 리포트 자세히'; }
    const bodyFold = $('#foldBody');
    if (bodyFold) { panes.month.append(bodyFold); const title = bodyFold.querySelector('summary strong'); if (title) title.textContent = '인바디 기록 자세히'; }
    const calendar = $('#calendarArchive');
    if (calendar) panes.calendar.append(calendar);
    [...report.querySelectorAll(':scope > .section-head')].forEach(head => { if (/기록 달력/.test(head.textContent)) head.hidden = true; });
    // 예전 코칭 보드·그래프 묶음은 새 리포트가 대신한다.
    ['#coachBoard', '#foldCharts'].forEach(selector => { const node = $(selector); if (node) node.hidden = true; });

    tabs.addEventListener('click', event => {
      const button = event.target.closest('[data-rx-tab]');
      if (!button) return;
      tab = button.dataset.rxTab;
      try { sessionStorage.setItem('fitlog:reportTab', tab); } catch {}
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    report.addEventListener('click', onClick);
    return true;
  }

  function onClick(event) {
    const week = event.target.closest('[data-rx-week]');
    if (week) {
      const base = weekStart || mondayOf(todayKey());
      const next = addDays(base, 7 * +week.dataset.rxWeek);
      weekStart = next >= mondayOf(todayKey()) ? null : next;
      render();
      return;
    }
    const month = event.target.closest('[data-rx-month]');
    if (month) { monthKey = month.dataset.rxMonth >= todayKey().slice(0, 7) ? null : month.dataset.rxMonth; render(); return; }
    const focus = event.target.closest('[data-rx-focus]');
    if (focus) {
      const state = readState();
      state.profile ||= {};
      const text = focus.dataset.rxFocus;
      const list = (state.profile.planFocus || []).filter(item => Date.now() - Date.parse(item.at) < 14 * DAY);
      const exists = list.some(item => item.text === text);
      state.profile.planFocus = exists ? list.filter(item => item.text !== text) : [...list, { text, at: new Date().toISOString() }];
      writeState(state);
      showToast(exists ? '계획 반영을 취소했어요.' : '다음 주 계획에 반영할게요. 운동 탭에서 [다시 짜기]를 누르면 바로 적용돼요.');
      render();
    }
  }

  function render() {
    if (!install()) return;
    const state = readState() || {};
    $('#rpTabs').querySelectorAll('[data-rx-tab]').forEach(button => {
      const on = button.dataset.rxTab === tab;
      button.classList.toggle('on', on);
      button.setAttribute('aria-selected', on);
    });
    ['week', 'month', 'calendar'].forEach(id => { $(`#rx-${id}`).hidden = id !== tab; });
    if (tab === 'week') {
      const start = weekStart || mondayOf(todayKey());
      const w = weekStats(state, start);
      const prev = weekStats(state, addDays(start, -7));
      $('#rxWeek').innerHTML = [scoreCard(state, w, prev), weightCard(state, w), tdeeCard(state, w), partsCard(state, w, prev), prCard(state, w), dietCard(state, w), recoveryCard(state, w), actionsCard(state, w)].join('');
    } else if (tab === 'month') {
      $('#rxMonth').innerHTML = monthView(state);
    }
  }

  let pending = null;
  const schedule = () => { clearTimeout(pending); pending = setTimeout(() => { if (location.hash === '#report' || !location.hash) render(); }, 60); };
  render();
  window.addEventListener('fitlog:state-updated', schedule);
  window.addEventListener('storage', event => { if (event.key === 'fitlog:dashboard:v3') schedule(); });
  window.addEventListener('hashchange', () => { if (location.hash === '#report') render(); });
  window.FitLogReport = { render };
})();
