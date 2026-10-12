import * as Store from './store.js?v=5';

const $ = id => document.getElementById(id);
const main = $('main');
const KST = 'Asia/Seoul';

/* ── 시간·형식 헬퍼 ─────────────────────────────── */
const nowIso = () => new Date().toISOString();
function todayKST(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const f = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${f.year}-${f.month}-${f.day}`;
}
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en', { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const f = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${f.year}-${f.month}-${f.day}T${f.hour === '24' ? '00' : f.hour}:${f.minute}`;
}
function localInputToIso(v) {
  if (!v) return null;
  const d = new Date(`${v}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
const fmtDate = dstr => dstr ? dstr.replaceAll('-', '.') : '—';
const fmtDT = iso => iso ? new Intl.DateTimeFormat('ko-KR', { timeZone: KST, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)) : '—';
function fmtMin(min) {
  if (min == null || !Number.isFinite(min)) return '0분';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`;
}
const PRIORITY_LABEL = { 5: '매우 높음', 4: '높음', 3: '보통', 2: '낮음', 1: '최하' };
const priClass = p => p >= 5 ? 'bad' : p === 4 ? 'warn' : p === 3 ? 'accent' : '';
const uid = prefix => Store.makeId(prefix);

/* ── 앱 상태 ─────────────────────────────────── */
const state = {
  doc: null,
  view: 'plans',
  taskQuery: '', taskStatus: 'all', taskTag: 'all',
  reviewRange: 'all', reviewFrom: null, reviewTo: null,
  pendingNav: null
};

const SORT_NOTE = '정렬 기준: 진행 중 우선 → 마감일 빠른 순(마감 없음 맨 뒤) → 우선순위 높은 순 → 최근 생성 순';

/* ── 동기화 배지 ─────────────────────────────── */
function setSync(mode, label) {
  for (const el of [document.querySelector('.rail .sync-pill'), $('syncPillM')]) {
    if (!el) continue;
    el.dataset.state = mode;
    el.textContent = label;
  }
}

function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  $('toastZone').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 2600);
}

/* ── DOM 유틸 (모든 사용자 텍스트는 textContent만 사용 → XSS 차단) ── */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function iconBtn(svgPath, label, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `icon-btn ${cls}`;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = svgPath; // 고정 아이콘 문자열만 허용
  return b;
}
const ICONS = {
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4l11-11a2.1 2.1 0 00-3-3L5 17l-1 4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 5v2m3 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7m4 4v6m4-6v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  history: '<svg viewBox="0 0 24 24"><path d="M4 5v5h5M4.6 10a8.5 8.5 0 11.9 5.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.8 15.8L20 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5.5 12.5l4 4L18.5 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  log: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 9.5V13l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
};

/* ── 모달 ─────────────────────────────────── */
function openModal(title, buildBody) {
  const root = $('modalRoot'), sheet = $('modalSheet');
  sheet.replaceChildren();
  sheet.append(el('h2', '', title));
  buildBody(sheet);
  root.hidden = false;
  document.body.style.overflow = 'hidden';
  sheet.querySelector('input,select,textarea,button:not([data-close-modal])')?.focus();
}
function closeModal() {
  $('modalRoot').hidden = true;
  $('modalSheet').replaceChildren();
  document.body.style.overflow = '';
}
$('modalRoot').addEventListener('click', e => { if (e.target.hasAttribute('data-close-modal')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modalRoot').hidden) closeModal(); });

function field(label, input) {
  const wrap = el('div', 'field');
  wrap.append(el('label', '', label), input);
  return wrap;
}
function inputEl(attrs = {}) {
  const n = document.createElement('input');
  Object.assign(n, attrs);
  return n;
}
function selectEl(options, value) {
  const s = document.createElement('select');
  for (const [v, t] of options) {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    if (String(v) === String(value)) o.selected = true;
    s.append(o);
  }
  return s;
}

/* ── 데이터 질의 ─────────────────────────────── */
const activeTasks = doc => doc.tasks.filter(t => !t.deleted_at);
const planOf = (doc, id) => doc.plans.find(p => p.id === id);
const taskOf = (doc, id) => doc.tasks.find(t => t.id === id);
const execsOf = (doc, taskId) => doc.executions.filter(e => e.task_id === taskId);

function reviewRangeDates() {
  const today = todayKST();
  if (state.reviewRange === '7d') {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return [todayKST(d), today];
  }
  if (state.reviewRange === 'week') {
    // 주 시작 = 월요일 (계약 week_start='monday', Asia/Seoul)
    const d = new Date(`${today}T12:00:00+09:00`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return [todayKST(d), today];
  }
  if (state.reviewRange === 'month') return [`${today.slice(0, 8)}01`, today];
  if (state.reviewRange === 'custom' && state.reviewFrom && state.reviewTo) return [state.reviewFrom, state.reviewTo];
  return [null, null];
}

// 돌아보기 집계 — 대상: 기간이 겹치는 계획과 그 계획에 딸린 "지우지 않은" 할 일
function aggregate(doc, start, end) {
  const plans = doc.plans.filter(p => !start || (p.period_start <= end && p.period_end >= start));
  const planIds = new Set(plans.map(p => p.id));
  const tasks = activeTasks(doc).filter(t => planIds.has(t.plan_id));
  const taskIds = new Set(tasks.map(t => t.id));
  const today = todayKST();
  const done = tasks.filter(t => t.status === 'done');
  const delayed = tasks.filter(t => t.status !== 'done' && t.due_date && t.due_date < today);
  const blockedIds = new Set(doc.executions.filter(e => taskIds.has(e.task_id) && e.blocker_reason && e.blocker_reason.trim()).map(e => e.task_id));
  const execs = doc.executions.filter(e => taskIds.has(e.task_id));
  const expected = tasks.reduce((s, t) => s + (t.expected_minutes || 0), 0);
  const actual = execs.reduce((s, e) => s + (e.actual_minutes || 0), 0);
  return { plans, tasks, done, delayed, blockedIds, execs, expected, actual, diff: actual - expected };
}

/* ── 변경 연산 (전부 서버 문서에 대한 read→modify→write 트랜잭션) ── */
async function mutate(fn, okMsg) {
  setSync('saving', '저장 중…');
  try {
    const { doc } = await Store.transact(fn);
    state.doc = doc;
    setSync('ok', '동기화됨');
    if (okMsg) toast(okMsg);
    render();
  } catch (err) {
    console.error(err);
    setSync('err', '저장 실패 — 다시 시도');
    toast('저장에 실패했습니다. 네트워크를 확인한 뒤 다시 시도하세요.', true);
  }
}

const addPlan = fields => mutate(doc => {
  const now = nowIso();
  const plan = { id: uid('pl'), status: 'active', current_rev: 0, created_at: now, updated_at: now, ...fields };
  doc.plans.push(plan);
  doc.plan_revisions.push({ id: uid('rev'), plan_id: plan.id, rev_no: 0, edited_at: now, note: '처음 세운 계획', ...fields });
  return plan;
}, '계획을 저장했습니다');

const updatePlan = (planId, fields) => mutate(doc => {
  const plan = planOf(doc, planId);
  if (!plan) return;
  const now = nowIso();
  plan.current_rev += 1;
  Object.assign(plan, fields, { updated_at: now });
  doc.plan_revisions.push({ id: uid('rev'), plan_id: plan.id, rev_no: plan.current_rev, edited_at: now, note: `${plan.current_rev}차 수정`, ...fields });
}, '계획을 고쳤습니다 — 이전 내용은 이력에 남아 있습니다');

const addTask = fields => mutate(doc => {
  const now = nowIso();
  doc.tasks.push({ id: uid('tk'), status: 'todo', tags: [], due_date: null, completed_at: null, deleted_at: null, created_at: now, updated_at: now, ...fields });
}, '할 일을 추가했습니다');

const updateTask = (taskId, fields) => mutate(doc => {
  const t = taskOf(doc, taskId);
  if (!t) return;
  Object.assign(t, fields, { updated_at: nowIso() });
}, '할 일을 고쳤습니다');

// 완료 멱등 — 멱등키 complete:{taskId} + 상태 게이트 + 버튼 잠금
async function setTaskDone(taskId, done) {
  await mutate(doc => {
    const t = taskOf(doc, taskId);
    if (!t || t.deleted_at) return;
    const key = `complete:${taskId}`;
    if (done) {
      if (t.status === 'done') return; // 같은 요청 반복 → 기록 1건 유지
      const now = nowIso();
      t.status = 'done'; t.completed_at = now; t.updated_at = now;
      if (!doc.completions.some(c => c.key === key)) {
        doc.completions.push({ key, task_id: taskId, completed_at: now });
      }
    } else {
      if (t.status !== 'done') return;
      t.status = 'todo'; t.completed_at = null; t.updated_at = nowIso();
      doc.completions = doc.completions.filter(c => c.key !== key);
    }
  }, done ? '완료로 바꿨습니다' : '진행 중으로 되돌렸습니다');
}

const deleteTask = taskId => mutate(doc => {
  const t = taskOf(doc, taskId);
  if (t) t.deleted_at = nowIso();
}, '할 일을 지웠습니다 (기록은 남아 집계에서만 빠집니다)');

const addExecution = fields => mutate(doc => {
  doc.executions.push({ id: uid('ex'), created_at: nowIso(), ...fields });
}, '실행 기록을 남겼습니다 — 원래 계획 값은 그대로입니다');

const addImprovement = (text, start, end) => mutate(doc => {
  doc.improvements.push({ id: uid('im'), text, period_start: start, period_end: end, applied_plan_id: null, created_at: nowIso() });
}, '돌아보기 한 줄을 남겼습니다');

/* ── 지표·계획 규칙 변경 연산 ──────────────── */
const setSettings = fields => mutate(doc => {
  doc.settings = { ...(doc.settings || {}), ...fields };
}, '지표 설정을 저장했습니다');

const addMetricEntry = fields => mutate(doc => {
  doc.metric_entries.push({ id: uid('me'), created_at: nowIso(), ...fields });
}, '지표를 기록했습니다');

// 계획 규칙 변경은 반드시 이 경로로만 — 변경 시각·이유·전후가 rule_changes에 남는다
const changePlanRule = (after, reason, appliesFrom) => mutate(doc => {
  const before = doc.settings?.plan_rule || '';
  doc.rule_changes.push({ id: uid('rc'), changed_at: nowIso(), before, after, reason, applies_from_date: appliesFrom });
  doc.settings = { ...(doc.settings || {}), plan_rule: after };
}, '계획 규칙을 바꿨습니다 — 변경이 이력에 남았습니다');

/* ── 지표 집계 (계약 contracts/pds-schema-v3.json의 규칙을 그대로 구현) ──
   - 빠진 값: 기록 없는 날은 '—'로 표시, 합계·평균의 분모에서 제외
   - 중복 값: 같은 날짜에 두 건 이상이면 created_at이 가장 늦은 한 건만 쓰고 나머지는 집계 제외
   - 튀는 값: 0~1440(하루 분) 밖 값은 이상치로 표시하고 집계에서 제외(입력 시에도 거부)
   - 반올림: 평균은 소수 첫째 자리 반올림으로 표시, 합계는 정수
   - 주 시작: 월요일 (Asia/Seoul, week_start='monday') */
function metricDaily(doc) {
  const byDate = new Map();
  for (const m of [...doc.metric_entries].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const prev = byDate.get(m.date);
    byDate.set(m.date, { entry: m, superseded: (prev?.superseded || 0) + (prev ? 1 : 0) });
  }
  return [...byDate.entries()].map(([date, o]) => ({
    date, value: o.entry.value, note: o.entry.note,
    outlier: !(Number.isFinite(o.entry.value) && o.entry.value >= 0 && o.entry.value <= 1440),
    superseded: o.superseded
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function metricAgg(doc, start, end) {
  const rows = metricDaily(doc).filter(m => (!start || m.date >= start) && (!end || m.date <= end));
  const valid = rows.filter(r => !r.outlier);
  const sum = valid.reduce((s, r) => s + r.value, 0);
  const avg = valid.length ? Math.round((sum / valid.length) * 10) / 10 : null;
  return { rows, sum, avg, n: valid.length };
}

/* ── 뷰: 계획 ─────────────────────────────────── */
function viewPlans() {
  const doc = state.doc;
  const host = el('div');
  const head = el('div', 'view-head');
  const hWrap = el('div');
  hWrap.append(el('h1', '', '계획'), el('div', 'sub', '세운 계획과 수정 이력. 고쳐도 처음 계획은 그대로 남습니다.'));
  const add = el('button', 'btn', null);
  add.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>새 계획</span>';
  add.addEventListener('click', () => planModal(null));
  head.append(hWrap, add);
  host.append(head);

  // 현재 계획 규칙 — 변경은 rule_changes 이력으로 남는다
  const s = doc.settings;
  if (s?.plan_rule) {
    const rc = el('div', 'card rule-card');
    rc.append(el('div', 'metric-q', '현재 계획 규칙'));
    rc.append(el('div', 'rule-now', s.plan_rule));
    const last = doc.rule_changes.at(-1);
    const meta = el('div', 'rule-meta');
    meta.textContent = last
      ? `${fmtDT(last.changed_at)}에 변경 — ${last.reason || ''} (${fmtDate(last.applies_from_date)}부터 적용)`
      : '아직 바꾼 적 없음';
    const chBtn = el('button', 'btn tiny secondary', '규칙 바꾸기');
    chBtn.addEventListener('click', ruleChangeModal);
    meta.append(' ', chBtn);
    rc.append(meta);
    host.append(rc);
  }

  const grid = el('div', 'plan-grid');
  const plans = [...doc.plans].sort((a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at));
  if (!plans.length) grid.append(emptyState('세운 계획이 없습니다. 지금 하는 일 하나를 계획으로 옮겨 보세요.'));
  for (const plan of plans) {
    const card = el('article', 'card plan-card');
    const top = el('div', 'plan-top');
    const left = el('div');
    left.append(el('h3', 'plan-title', plan.title));
    const meta = el('div', 'plan-meta');
    meta.append(
      el('span', 'chip accent', `${fmtDate(plan.period_start)} ~ ${fmtDate(plan.period_end)}`),
      el('span', `chip ${priClass(plan.priority)}`, `우선순위 ${plan.priority}`),
      el('span', 'chip', `예상 ${fmtMin(plan.expected_minutes)}`)
    );
    if (plan.carryover_note) meta.append(el('span', 'chip good', `돌아보기 개선: ${plan.carryover_note.slice(0, 18)}${plan.carryover_note.length > 18 ? '…' : ''}`));
    left.append(meta);
    top.append(left);
    card.append(top);

    const crit = el('div', 'plan-criteria');
    crit.append(el('b', '', '성공 기준'), document.createTextNode(plan.success_criteria));
    card.append(crit);

    const planTasks = activeTasks(doc).filter(t => t.plan_id === plan.id);
    const doneN = planTasks.filter(t => t.status === 'done').length;
    const line = el('div', 'progress-line');
    const track = el('div', 'progress-track');
    const fill = el('div', 'progress-fill');
    fill.style.width = planTasks.length ? `${(doneN / planTasks.length) * 100}%` : '0%';
    track.append(fill);
    line.append(track, el('span', '', `할 일 ${doneN}/${planTasks.length}`));
    card.append(line);

    const revs = doc.plan_revisions.filter(r => r.plan_id === plan.id).length;
    const actions = el('div', 'card-actions');
    const hist = el('button', 'btn tiny secondary', `수정 이력 ${revs}건`);
    hist.addEventListener('click', () => historyModal(plan));
    const edit = el('button', 'btn tiny secondary', '고치기');
    edit.addEventListener('click', () => planModal(plan));
    const addT = el('button', 'btn tiny secondary', '할 일 추가');
    addT.addEventListener('click', () => taskModal(null, plan.id));
    actions.append(edit, hist, addT);
    card.append(actions);
    grid.append(card);
  }
  host.append(grid);
  return host;
}

function historyModal(plan) {
  const doc = state.doc;
  const revs = doc.plan_revisions.filter(r => r.plan_id === plan.id).sort((a, b) => a.rev_no - b.rev_no);
  openModal('수정 이력 — 처음 계획이 그대로 남아 있습니다', sheet => {
    for (const r of revs) {
      const item = el('div', `rev-item${r.rev_no === plan.current_rev ? ' current' : ''}`);
      item.append(el('div', 'rev-no', r.rev_no === 0 ? '처음 세운 계획 (rev 0)' : `${r.rev_no}차 수정 — ${fmtDT(r.edited_at)}`));
      const f = el('dl', 'rev-fields');
      for (const [k, v] of [['제목', r.title], ['기간', `${fmtDate(r.period_start)} ~ ${fmtDate(r.period_end)}`], ['우선순위', String(r.priority)], ['예상 시간', fmtMin(r.expected_minutes)], ['성공 기준', r.success_criteria]]) {
        const row = el('div');
        row.style.display = 'flex'; row.style.gap = '8px';
        row.append(el('dt', '', `${k}:`), el('dd', '', v));
        row.querySelector('dd').style.margin = '0';
        f.append(row);
      }
      item.append(f);
      sheet.append(item);
    }
  });
}

function planModal(plan) {
  openModal(plan ? '계획 고치기' : '새 계획', sheet => {
    const title = inputEl({ value: plan?.title || '', placeholder: '예: T06 과제 완성', required: true });
    const ps = inputEl({ type: 'date', value: plan?.period_start || todayKST(), required: true });
    const pe = inputEl({ type: 'date', value: plan?.period_end || todayKST(), required: true });
    const pri = selectEl([[5, '5 — 매우 높음'], [4, '4 — 높음'], [3, '3 — 보통'], [2, '2 — 낮음'], [1, '1 — 최하']], plan?.priority ?? 3);
    const exp = inputEl({ type: 'number', min: 0, step: 5, value: plan?.expected_minutes ?? 60, required: true });
    const crit = document.createElement('textarea');
    crit.rows = 2; crit.placeholder = '무엇이 보이면 성공인가요?'; crit.value = plan?.success_criteria || '';
    const row1 = el('div', 'field-row'); row1.append(field('시작일 (KST)', ps), field('종료일 (KST)', pe));
    const row2 = el('div', 'field-row'); row2.append(field('우선순위', pri), field('예상 시간(분)', exp));
    sheet.append(field('계획 제목', title), row1, row2, field('성공 기준', crit));
    const acts = el('div', 'form-actions');
    const cancel = el('button', 'btn secondary', '취소'); cancel.addEventListener('click', closeModal);
    const save = el('button', 'btn', plan ? '고치기(이력에 남김)' : '저장');
    save.addEventListener('click', async () => {
      if (!title.value.trim() || !ps.value || !pe.value) return toast('제목과 기간을 입력하세요', true);
      const fields = { title: title.value.trim(), period_start: ps.value, period_end: pe.value, priority: Number(pri.value), expected_minutes: Math.max(0, Number(exp.value) || 0), success_criteria: crit.value.trim() };
      closeModal();
      await (plan ? updatePlan(plan.id, fields) : addPlan(fields));
    });
    acts.append(cancel, save);
    sheet.append(acts);
  });
}

/* ── 뷰: 할 일 ─────────────────────────────────── */
function viewTasks() {
  const doc = state.doc;
  const host = el('div');
  const head = el('div', 'view-head');
  const hWrap = el('div');
  hWrap.append(el('h1', '', '할 일'), el('div', 'sub', SORT_NOTE));
  const add = el('button', 'btn', null);
  add.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>새 할 일</span>';
  add.addEventListener('click', () => taskModal(null));
  head.append(hWrap, add);
  host.append(head);

  const bar = el('div', 'toolbar');
  const sWrap = el('div', 'search-wrap');
  sWrap.innerHTML = ICONS.search;
  const search = inputEl({ className: 'search-input', placeholder: '제목·태그·계획명으로 검색', value: state.taskQuery });
  search.addEventListener('input', () => { state.taskQuery = search.value; refreshTaskList(list); });
  sWrap.append(search);
  bar.append(sWrap);

  const tags = [...new Set(activeTasks(doc).flatMap(t => t.tags))];
  if (state.taskTag !== 'all' && !tags.includes(state.taskTag)) tags.push(state.taskTag);
  const fRow = el('div', 'filter-row');
  for (const [v, label] of [['all', '전체'], ['todo', '진행 중'], ['done', '완료'], ['delayed', '지연'], ['deleted', '삭제됨']]) {
    const c = el('button', `chip selectable${state.taskStatus === v ? ' on' : ''}`, label);
    c.addEventListener('click', () => { state.taskStatus = v; render(); });
    fRow.append(c);
  }
  for (const t of tags) {
    const c = el('button', `chip selectable${state.taskTag === t ? ' on' : ''}`, `#${t}`);
    c.addEventListener('click', () => { state.taskTag = state.taskTag === t ? 'all' : t; render(); });
    fRow.append(c);
  }
  bar.append(fRow);
  host.append(bar);

  const list = el('div', 'task-list');
  host.append(list);
  refreshTaskList(list);
  return host;
}

function refreshTaskList(list) {
  const doc = state.doc;
  list.replaceChildren();
  const q = state.taskQuery.trim().toLowerCase();
  const today = todayKST();
  let tasks = state.taskStatus === 'deleted'
    ? doc.tasks.filter(t => t.deleted_at)
    : activeTasks(doc);
  tasks = tasks.filter(t => {
    const plan = planOf(doc, t.plan_id);
    if (state.taskStatus === 'todo' && t.status !== 'todo') return false;
    if (state.taskStatus === 'done' && t.status !== 'done') return false;
    if (state.taskStatus === 'delayed' && !(t.status !== 'done' && t.due_date && t.due_date < today)) return false;
    if (state.taskTag !== 'all' && !t.tags.includes(state.taskTag)) return false;
    if (q && ![t.title, ...(t.tags || []), plan?.title || ''].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  tasks.sort((a, b) => {
    const s = (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0);
    if (s) return s;
    const da = a.due_date || '9999-12-31', db = b.due_date || '9999-12-31';
    if (da !== db) return da.localeCompare(db);
    if (a.priority !== b.priority) return b.priority - a.priority;
    return b.created_at.localeCompare(a.created_at);
  });

  if (!tasks.length) list.append(emptyState(state.taskStatus === 'deleted' ? '삭제된 할 일이 없습니다' : '조건에 맞는 할 일이 없습니다'));
  for (const t of tasks) {
    const row = el('div', `task-row${t.status === 'done' ? ' done' : ''}${(t.status !== 'done' && t.due_date && t.due_date < today) ? ' delayed' : ''}`);
    const chk = el('button', 'check-btn');
    chk.innerHTML = ICONS.check;
    chk.title = t.status === 'done' ? '진행 중으로 되돌리기' : '완료로 바꾸기';
    chk.setAttribute('aria-label', chk.title);
    chk.addEventListener('click', async () => {
      chk.disabled = true;
      await setTaskDone(t.id, t.status !== 'done'); // 두 번 눌러도 멱등키로 1건만 기록
      chk.disabled = false;
    });
    row.append(chk);

    const body = el('div', 'task-body');
    body.append(el('div', 'task-title', t.title));
    const sub = el('div', 'task-sub');
    const plan = planOf(doc, t.plan_id);
    if (plan) sub.append(el('span', 'task-plan-name', plan.title));
    if (t.due_date) sub.append(el('span', `chip${t.due_date < today && t.status !== 'done' ? ' bad' : ''}`, `마감 ${fmtDate(t.due_date)}`));
    sub.append(el('span', `chip ${priClass(t.priority)}`, `P${t.priority}`), el('span', 'chip', `예상 ${fmtMin(t.expected_minutes)}`));
    for (const tag of t.tags) sub.append(el('span', 'chip accent', `#${tag}`));
    const n = execsOf(doc, t.id).length;
    if (n) sub.append(el('span', 'chip good', `기록 ${n}건`));
    body.append(sub);
    row.append(body);

    const acts = el('div', 'task-actions');
    const rec = iconBtn(ICONS.log, '실행 기록 남기기');
    rec.addEventListener('click', () => execModal(t));
    const edit = iconBtn(ICONS.edit, '고치기');
    edit.addEventListener('click', () => taskModal(t));
    acts.append(rec, edit);
    if (!t.deleted_at) {
      const del = iconBtn(ICONS.trash, '지우기', 'danger');
      del.addEventListener('click', () => {
        if (confirm(`"${t.title}"을(를) 지울까요? 기록은 남고 집계에서만 빠집니다.`)) deleteTask(t.id);
      });
      acts.append(del);
    }
    row.append(acts);
    list.append(row);
  }
}

function taskModal(task, presetPlanId) {
  const doc = state.doc;
  const plans = doc.plans;
  if (!plans.length) return toast('먼저 계획을 만드세요', true);
  openModal(task ? '할 일 고치기' : '새 할 일', sheet => {
    const title = inputEl({ value: task?.title || '', placeholder: '예: 돌아보기 집계 구현' });
    const planSel = selectEl(plans.map(p => [p.id, p.title]), task?.plan_id || presetPlanId || plans[0].id);
    const due = inputEl({ type: 'date', value: task?.due_date || '' });
    const pri = selectEl([[5, '5 — 매우 높음'], [4, '4 — 높음'], [3, '3 — 보통'], [2, '2 — 낮음'], [1, '1 — 최하']], task?.priority ?? 3);
    const exp = inputEl({ type: 'number', min: 0, step: 5, value: task?.expected_minutes ?? 30 });
    const tags = inputEl({ value: (task?.tags || []).join(', '), placeholder: '쉼표로 구분 — 예: 프론트, 검증' });
    const row1 = el('div', 'field-row'); row1.append(field('어느 계획의 일인가요', planSel), field('마감일 (KST)', due));
    const row2 = el('div', 'field-row'); row2.append(field('우선순위', pri), field('예상 시간(분)', exp));
    sheet.append(field('할 일', title), row1, row2, field('태그', tags));
    const acts = el('div', 'form-actions');
    const cancel = el('button', 'btn secondary', '취소'); cancel.addEventListener('click', closeModal);
    const save = el('button', 'btn', '저장');
    save.addEventListener('click', async () => {
      if (!title.value.trim()) return toast('할 일 내용을 입력하세요', true);
      const fields = {
        title: title.value.trim(), plan_id: planSel.value, due_date: due.value || null,
        priority: Number(pri.value), expected_minutes: Math.max(0, Number(exp.value) || 0),
        tags: tags.value.split(',').map(s => s.trim()).filter(Boolean)
      };
      closeModal();
      await (task ? updateTask(task.id, fields) : addTask(fields));
    });
    acts.append(cancel, save);
    sheet.append(acts);
  });
}

/* ── 뷰: 기록 (실제로 한 일) ───────────────────── */
function viewLog() {
  const doc = state.doc;
  const host = el('div');
  const head = el('div', 'view-head');
  const hWrap = el('div');
  hWrap.append(el('h1', '', '실제로 한 일'), el('div', 'sub', '언제 시작해 얼마나 걸렸고 어디서 막혔는지. 계획 값은 덮어쓰지 않습니다.'));
  const add = el('button', 'btn', null);
  add.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>기록 남기기</span>';
  add.addEventListener('click', () => execModal(null));
  head.append(hWrap, add);
  host.append(head);

  // 오늘의 지표 — 5일 기록의 재료. 날짜별 한 건이 집계에 쓰인다(중복은 최신 건만).
  const s = doc.settings;
  const mc = el('div', 'card metric-card');
  if (!s) {
    mc.append(el('div', 'metric-name', '지표 설정이 필요합니다'));
    const b = el('button', 'btn secondary', '지금 설정하기');
    b.addEventListener('click', () => settingsModal(true));
    mc.append(b);
  } else {
    const mh = el('div', 'metric-head');
    const left = el('div');
    left.append(el('div', 'metric-q', s.question || ''), el('div', 'metric-name', `${s.metric_name} (${s.metric_unit})`));
    const setB = el('button', 'btn tiny secondary', '지표 설정');
    setB.addEventListener('click', () => settingsModal(false));
    mh.append(left, setB);
    mc.append(mh);

    const form = el('div', 'metric-form');
    const dateI = inputEl({ type: 'date', value: todayKST() });
    const valI = inputEl({ type: 'number', min: 0, max: 1440, step: 1, placeholder: '0' });
    const noteI = inputEl({ placeholder: '메모 (선택)' });
    const saveB = el('button', 'btn', '기록');
    form.append(field('날짜 (KST)', dateI), field(`값 (${s.metric_unit})`, valI), field('메모', noteI), saveB);
    saveB.addEventListener('click', async () => {
      const v = Number(valI.value);
      if (!dateI.value) return toast('날짜를 고르세요', true);
      if (!Number.isFinite(v) || v < 0) return toast('값을 입력하세요', true);
      if (v > 1440) return toast(`${s.metric_unit} 값이 하루 범위(1440)를 넘습니다 — 이상치는 집계에서 빠집니다`, true);
      await addMetricEntry({ date: dateI.value, value: Math.round(v), note: noteI.value.trim() });
    });
    mc.append(form);

    const recent = metricDaily(doc).slice(-5).reverse();
    if (recent.length) {
      const ul = el('div');
      for (const m of recent) {
        const row = el('div', `metric-entry${m.outlier ? ' outlier' : ''}`);
        row.append(el('span', 'd', fmtDate(m.date)), el('span', 'v', m.outlier ? `${m.value} — 이상치(집계 제외)` : `${m.value}${s.metric_unit}`));
        if (m.note) row.append(el('span', 'n', m.note));
        if (m.superseded) row.append(el('span', 'dup', `이전 ${m.superseded}건 덮어씀`));
        ul.append(row);
      }
      mc.append(ul);
    }
  }
  host.append(mc);

  const list = el('div', 'exec-list');
  const execs = [...doc.executions].sort((a, b) => b.started_at.localeCompare(a.started_at));
  if (!execs.length) list.append(emptyState('실행 기록이 없습니다. 일을 마친 뒤 기록을 남겨 보세요.'));
  for (const ex of execs) {
    const task = taskOf(doc, ex.task_id);
    const row = el('div', 'exec-row');
    row.append(el('div', 'exec-time', `${fmtDT(ex.started_at)}\n~ ${fmtDT(ex.ended_at)}`));
    const card = el('div', 'card exec-card');
    card.append(el('div', 'exec-min', fmtMin(ex.actual_minutes)), el('div', 'task-title', task ? task.title : '(지워진 할 일)'));
    if (ex.blocker_reason && ex.blocker_reason.trim()) {
      const b = el('div', 'exec-blocker');
      b.append(el('b', '', '막혔던 이유'), document.createTextNode(ex.blocker_reason));
      card.append(b);
    }
    row.append(card);
    list.append(row);
  }
  host.append(list);
  return host;
}

function execModal(task) {
  const doc = state.doc;
  const tasks = activeTasks(doc);
  if (!tasks.length) return toast('먼저 할 일을 만드세요', true);
  openModal('실행 기록 남기기', sheet => {
    const taskSel = selectEl(tasks.map(t => [t.id, `${planOf(doc, t.plan_id)?.title || ''} — ${t.title}`]), task?.id || tasks[0].id);
    const nowV = toLocalInput(nowIso());
    const start = inputEl({ type: 'datetime-local', value: nowV });
    const end = inputEl({ type: 'datetime-local', value: nowV });
    const actual = inputEl({ type: 'number', min: 0, step: 1, value: 30 });
    const calc = () => {
      const s = localInputToIso(start.value), e = localInputToIso(end.value);
      if (s && e) actual.value = Math.max(0, Math.round((new Date(e) - new Date(s)) / 60000));
    };
    start.addEventListener('change', calc); end.addEventListener('change', calc);
    const blocker = document.createElement('textarea');
    blocker.rows = 2; blocker.placeholder = '막혔던 이유 (없으면 비워 두세요)';
    const row1 = el('div', 'field-row'); row1.append(field('시작 시각 (KST)', start), field('끝난 시각 (KST)', end));
    sheet.append(field('어느 할 일의 기록인가요', taskSel), row1, field('실제로 걸린 시간(분)', actual), field('막혔던 이유', blocker));
    const acts = el('div', 'form-actions');
    const cancel = el('button', 'btn secondary', '취소'); cancel.addEventListener('click', closeModal);
    const save = el('button', 'btn', '기록 저장');
    save.addEventListener('click', async () => {
      const s = localInputToIso(start.value), e = localInputToIso(end.value);
      if (!s || !e) return toast('시작·끝 시각을 입력하세요', true);
      const fields = { task_id: taskSel.value, started_at: s, ended_at: e, actual_minutes: Math.max(0, Number(actual.value) || 0), blocker_reason: blocker.value };
      closeModal();
      await addExecution(fields);
    });
    acts.append(cancel, save);
    sheet.append(acts);
  });
}

/* ── 뷰: 돌아보기 ─────────────────────────────── */
function viewReview() {
  const doc = state.doc;
  const host = el('div');
  const head = el('div', 'view-head');
  const hWrap = el('div');
  hWrap.append(el('h1', '', '돌아보기'), el('div', 'sub', '숫자를 누르면 그 숫자가 나온 기록으로 갑니다.'));
  head.append(hWrap);
  host.append(head);

  const tabs = el('div', 'range-tabs');
  for (const [v, label] of [['all', '전체'], ['week', '이번 주'], ['7d', '최근 7일'], ['month', '이번 달'], ['custom', '직접 고르기']]) {
    const c = el('button', `chip selectable${state.reviewRange === v ? ' on' : ''}`, label);
    c.addEventListener('click', () => { state.reviewRange = v; render(); });
    tabs.append(c);
  }
  host.append(tabs);

  if (state.reviewRange === 'custom') {
    const row = el('div', 'field-row');
    row.style.marginBottom = '14px';
    const f = inputEl({ type: 'date', value: state.reviewFrom || todayKST() });
    const t = inputEl({ type: 'date', value: state.reviewTo || todayKST() });
    f.addEventListener('change', () => { state.reviewFrom = f.value; render(); });
    t.addEventListener('change', () => { state.reviewTo = t.value; render(); });
    row.append(field('시작', f), field('끝', t));
    host.append(row);
  }

  const [start, end] = reviewRangeDates();
  const a = aggregate(doc, start, end);

  const grid = el('div', 'stat-grid');
  const stat = (label, valueHtml, cls, onClick, hint = '기록 보기 →') => {
    const c = el('button', `card stat-card ${cls}`);
    c.type = 'button';
    c.append(el('span', 'k', label));
    const v = el('span', 'v'); v.innerHTML = valueHtml;
    c.append(v, el('span', 'hint', hint));
    c.addEventListener('click', onClick);
    return c;
  };

  const openTasksDrill = (title, rows) => drillModal(title, rows.map(t => {
    const plan = planOf(doc, t.plan_id);
    return `${t.title} — ${plan ? plan.title : '(계획 없음)'} · ${t.status === 'done' ? '완료' : '진행 중'} · 마감 ${fmtDate(t.due_date)}`;
  }));
  const openPlanDrill = () => drillModal('계획 — 이 숫자가 나온 기록', a.plans.map(p => `${p.title} · ${fmtDate(p.period_start)}~${fmtDate(p.period_end)} · 할 일 ${activeTasks(doc).filter(t => t.plan_id === p.id).length}건`));
  const openBlockedDrill = () => {
    const rows = doc.executions.filter(e => a.blockedIds.has(e.task_id) && e.blocker_reason?.trim())
      .map(e => `${taskOf(doc, e.task_id)?.title || '?'} · ${fmtDT(e.started_at)} — ${e.blocker_reason}`);
    drillModal('막힘 — 이 숫자가 나온 기록', rows);
  };
  const openTimeDrill = () => {
    const rows = a.execs.map(e => `${taskOf(doc, e.task_id)?.title || '?'} · ${fmtDT(e.started_at)} · 실제 ${fmtMin(e.actual_minutes)}`);
    drillModal('예상 vs 실제 — 이 숫자가 나온 기록', [`예상 합계: ${fmtMin(a.expected)} (대상 할 일 ${a.tasks.length}개의 예상 시간)`, `실제 합계: ${fmtMin(a.actual)} (실행 기록 ${a.execs.length}건)`, `차이: 실제 − 예상 = ${a.diff >= 0 ? '+' : ''}${fmtMin(Math.abs(a.diff))}`, '', ...rows]);
  };

  grid.append(
    stat('계획', `${a.plans.length}<small> 개</small>`, 'accent', openPlanDrill),
    stat('할 일 (미삭제)', `${a.tasks.length}<small> 개</small>`, '', () => openTasksDrill('할 일 — 이 숫자가 나온 기록', a.tasks)),
    stat('완료', `${a.done.length}<small> 개</small>`, 'good', () => openTasksDrill('완료 — 이 숫자가 나온 기록', a.done)),
    stat('지연 (마감 지난 미완료)', `${a.delayed.length}<small> 개</small>`, 'bad', () => openTasksDrill('지연 — 이 숫자가 나온 기록', a.delayed)),
    stat('막힘 (이유가 적힌 할 일)', `${a.blockedIds.size}<small> 개</small>`, 'warn', openBlockedDrill),
    stat('예상 vs 실제', `${fmtMin(a.actual)} <small>/ ${fmtMin(a.expected)}</small>`, a.diff > 0 ? 'warn' : 'good', openTimeDrill, `차이 ${a.diff >= 0 ? '+' : '−'}${fmtMin(Math.abs(a.diff))} →`)
  );

  // 지표 합계·평균 — 범위 안의 날짜별 기록을 계약 규칙(빠짐 제외·중복 최신·이상치 제외·소수 첫째 반올림)으로 집계
  const s = doc.settings;
  if (s) {
    const ma = metricAgg(doc, start, end);
    const openMetricDrill = () => {
      const rows = ma.rows.map(m => `${fmtDate(m.date)} — ${m.outlier ? `이상치 ${m.value}(집계 제외)` : `${m.value}${s.metric_unit}`}${m.superseded ? ` · 이전 ${m.superseded}건 덮어씀` : ''}${m.note ? ` · ${m.note}` : ''}`);
      drillModal(`${s.metric_name} — 이 숫자가 나온 기록`, [
        `합계: ${ma.sum}${s.metric_unit} (유효 기록 ${ma.n}일)`, 
        `평균: ${ma.avg ?? '—'}${s.metric_unit} = 합계 ÷ 기록 있는 날 수, 소수 첫째 자리 반올림`,
        `빠진 날은 '—'로 표시하고 분모에서 뺍니다 · 같은 날 중복은 최신 건만 · 0~1440 밖은 이상치로 제외`,
        '', ...rows]);
    };
    grid.append(
      stat(`${s.metric_name} 합계`, `${ma.sum}<small> ${s.metric_unit}</small>`, 'accent', openMetricDrill, `기록 ${ma.n}일 →`),
      stat(`${s.metric_name} 평균`, `${ma.avg ?? '—'}<small> ${s.metric_unit}/일</small>`, 'good', openMetricDrill, '손으로 더해 맞춰 보세요 →')
    );
  }
  host.append(grid);

  const sec = el('div', 'section-label'); sec.textContent = '다음 계획으로 넘길 한 줄';
  host.append(sec);
  const box = el('div', 'card improve-box');
  const ta = document.createElement('textarea');
  ta.placeholder = '돌아보고 고칠 점 한 가지 — 예: 예상 시간을 작게 잡아 매번 초과한다 → 다음 계획은 ×1.3';
  box.append(ta);
  const bRow = el('div', 'form-actions');
  const impBtn = el('button', 'btn secondary', '한 줄 남기기');
  impBtn.addEventListener('click', async () => {
    if (!ta.value.trim()) return toast('한 줄을 적어 주세요', true);
    await addImprovement(ta.value.trim(), start, end);
    toast('남겼습니다 — 아래에서 다음 계획으로 이어갈 수 있습니다');
  });
  bRow.append(impBtn);
  box.append(bRow);
  host.append(box);

  // 계획 규칙 변경 이력 — 언제·왜·무엇에서 무엇으로 바꿨는지
  if (doc.rule_changes.length) {
    const sr = el('div', 'section-label'); sr.textContent = '계획 규칙 변경 이력';
    host.append(sr);
    const rc = el('div', 'card rule-card');
    for (const c of [...doc.rule_changes].sort((a, b) => b.changed_at.localeCompare(a.changed_at))) {
      const item = el('div', 'rule-change-item');
      item.append(el('div', 'at', `${fmtDT(c.changed_at)} 변경 · ${fmtDate(c.applies_from_date)}부터 적용`));
      const arrow = el('div', 'arrow');
      arrow.append(el('s', '', c.before || '(없음)'), document.createTextNode(' → '), el('b', '', c.after));
      item.append(arrow);
      if (c.reason) item.append(el('div', 'reason', `이유: ${c.reason}`));
      rc.append(item);
    }
    host.append(rc);
  }

  const imps = [...doc.improvements].sort((x, y) => y.created_at.localeCompare(x.created_at));
  if (imps.length) {
    const s2 = el('div', 'section-label'); s2.textContent = '남긴 개선 한 줄';
    host.append(s2);
    const card = el('div', 'card');
    for (const im of imps) {
      const row = el('div', 'improve-item');
      row.append(el('div', 'improve-text', im.text));
      const applied = doc.plans.find(p => p.id === im.applied_plan_id);
      if (applied) {
        row.append(el('span', 'chip good', `→ ${applied.title}`));
      } else {
        const btn = el('button', 'btn tiny', '다음 계획으로 넘기기');
        btn.addEventListener('click', () => planFromImprovement(im));
        row.append(btn);
      }
      card.append(row);
    }
    host.append(card);
  }
  return host;
}

function planFromImprovement(im) {
  openModal('이 한 줄을 다음 계획으로', sheet => {
    const title = inputEl({ value: `${im.text}`.slice(0, 60) });
    const ps = inputEl({ type: 'date', value: todayKST() });
    const pe = inputEl({ type: 'date', value: todayKST() });
    const pri = selectEl([[5, '5 — 매우 높음'], [4, '4 — 높음'], [3, '3 — 보통'], [2, '2 — 낮음'], [1, '1 — 최하']], 4);
    const exp = inputEl({ type: 'number', min: 0, step: 5, value: 60 });
    const crit = document.createElement('textarea');
    crit.rows = 2; crit.value = `개선 적용: ${im.text}`;
    const row1 = el('div', 'field-row'); row1.append(field('시작일 (KST)', ps), field('종료일 (KST)', pe));
    const row2 = el('div', 'field-row'); row2.append(field('우선순위', pri), field('예상 시간(분)', exp));
    sheet.append(field('새 계획 제목', title), row1, row2, field('성공 기준', crit));
    const acts = el('div', 'form-actions');
    const cancel = el('button', 'btn secondary', '취소'); cancel.addEventListener('click', closeModal);
    const save = el('button', 'btn', '다음 계획 만들기');
    save.addEventListener('click', async () => {
      if (!title.value.trim() || !ps.value || !pe.value) return toast('제목과 기간을 입력하세요', true);
      closeModal();
      await mutate(doc => {
        const now = nowIso();
        const fields = { title: title.value.trim(), period_start: ps.value, period_end: pe.value, priority: Number(pri.value), expected_minutes: Math.max(0, Number(exp.value) || 0), success_criteria: crit.value.trim(), carryover_note: im.text };
        const plan = { id: uid('pl'), status: 'active', current_rev: 0, created_at: now, updated_at: now, ...fields };
        doc.plans.push(plan);
        doc.plan_revisions.push({ id: uid('rev'), plan_id: plan.id, rev_no: 0, edited_at: now, note: '처음 세운 계획', ...fields });
        const target = doc.improvements.find(i => i.id === im.id);
        if (target) target.applied_plan_id = plan.id;
      }, '다음 계획으로 넘겼습니다');
    });
    acts.append(cancel, save);
    sheet.append(acts);
  });
}

/* ── 지표 설정 / 규칙 변경 / 계정 모달 ───────── */
function settingsModal(required) {
  const s = state.doc?.settings;
  openModal(required ? '지표 설정 — 이 5일에 쓸 기준을 한 번 정합니다' : '지표 설정', sheet => {
    const q = inputEl({ value: s?.question || '', placeholder: '예: 매일 아침 두 시간 블록을 정하면 집중 시간이 늘까?' });
    const mn = inputEl({ value: s?.metric_name || '', placeholder: '예: 집중 시간' });
    const mu = inputEl({ value: s?.metric_unit || '분' });
    const mr = inputEl({ value: s?.metric_rule || '', placeholder: '예: 하루 동안 실제로 몰두해 일한 시간의 합(분)' });
    const pr = inputEl({ value: s?.plan_rule || '', placeholder: '예: 하루에 새로 시작하는 할 일은 3개까지' });
    const ws = selectEl([['monday', '월요일'], ['sunday', '일요일']], s?.week_start || 'monday');
    sheet.append(
      field('이 기간으로 답할 질문 한 문장', q),
      field('지표 이름', mn),
      field('단위', mu),
      field('계산 규칙 — 그 값을 어떻게 재는지', mr),
      field('주 시작 요일', ws)
    );
    if (!s) sheet.append(field('계획 규칙 — 계획을 세울 때 지키는 규칙 (이후 변경은 이력에 남습니다)', pr));
    if (s) {
      const note = el('p', 'rule-meta', '계획 규칙 변경은 계획 탭의 "규칙 바꾸기"에서만 — 변경이력이 남기 위해 따로 둡니다.');
      sheet.append(note);
    }
    const acts = el('div', 'form-actions');
    if (!required) { const cancel = el('button', 'btn secondary', '취소'); cancel.addEventListener('click', closeModal); acts.append(cancel); }
    const save = el('button', 'btn', '저장');
    save.addEventListener('click', async () => {
      const fields = {
        question: q.value.trim(), metric_name: mn.value.trim(), metric_unit: mu.value.trim() || '분',
        metric_rule: mr.value.trim(), week_start: ws.value,
        ...(s ? {} : { plan_rule: pr.value.trim(), locked_at: nowIso() })
      };
      if (!fields.question || !fields.metric_name || (!s && !fields.plan_rule)) return toast('질문·지표·계획 규칙은 비울 수 없습니다', true);
      closeModal();
      await setSettings(fields);
    });
    acts.append(save);
    sheet.append(acts);
  });
}

function ruleChangeModal() {
  const s = state.doc?.settings;
  openModal('계획 규칙 바꾸기 — 변경이 이력에 남습니다', sheet => {
    sheet.append(el('p', 'rule-now', `현재: ${s?.plan_rule || '(없음)'}`));
    const after = document.createElement('textarea'); after.rows = 2; after.placeholder = '새 규칙 — 예: 하루에 새로 시작하는 할 일은 2개까지';
    const reason = document.createElement('textarea'); reason.rows = 2; reason.placeholder = '왜 바꾸나요? — 기록에 그대로 남습니다';
    const apply = inputEl({ type: 'date', value: todayKST() });
    sheet.append(field('새 규칙', after), field('바꾸는 이유', reason), field('적용 시작일 (KST)', apply));
    const acts = el('div', 'form-actions');
    const cancel = el('button', 'btn secondary', '취소'); cancel.addEventListener('click', closeModal);
    const save = el('button', 'btn', '바꾸기(이력에 남김)');
    save.addEventListener('click', async () => {
      if (!after.value.trim()) return toast('새 규칙을 입력하세요', true);
      if (!reason.value.trim()) return toast('바꾸는 이유를 적어 주세요', true);
      closeModal();
      await changePlanRule(after.value.trim(), reason.value.trim(), apply.value || todayKST());
    });
    acts.append(cancel, save);
    sheet.append(acts);
  });
}

function accountModal() {
  const user = Store.currentUser();
  openModal('계정', sheet => {
    const chip = el('div', 'account-chip');
    chip.append(el('span', '', user?.email || ''));
    sheet.append(chip);
    sheet.append(el('p', 'rule-meta', `UID ${user?.uid || '—'} · 이 값이 서버 규칙의 본인 확인에 쓰입니다`));

    const pw1 = inputEl({ type: 'password', placeholder: '새 비밀번호 (6자 이상)', autocomplete: 'new-password', minlength: 6 });
    const pw2 = inputEl({ type: 'password', placeholder: '새 비밀번호 확인', autocomplete: 'new-password' });
    const pwBtn = el('button', 'btn secondary', '비밀번호 바꾸기');
    sheet.append(field('비밀번호 바꾸기 — 바꾸면 지금 세션도 끊기고 다시 로그인합니다', pw1), field('확인', pw2), pwBtn);
    pwBtn.addEventListener('click', async () => {
      if (pw1.value.length < 6) return toast('6자 이상으로 정하세요', true);
      if (pw1.value !== pw2.value) return toast('두 비밀번호가 다릅니다', true);
      pwBtn.disabled = true;
      try {
        const t = await Store.ensureToken();
        await Store.changePassword(t, pw1.value);
        await Store.signOut(); // 이전에 발급된 값들을 무효화 시각으로 끊는다
        location.reload();
      } catch (e) {
        pwBtn.disabled = false;
        toast(e.code === 'TOKEN_EXPIRED' || e.code === 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN'
          ? '오래 전에 로그인했습니다 — 다시 로그인한 뒤 바꿔 주세요' : `바꾸지 못했습니다 (${e.code || e.message})`, true);
      }
    });

    const loBtn = el('button', 'btn secondary', '로그아웃 — 이 기기 세션 끊기');
    loBtn.style.marginTop = '10px';
    loBtn.addEventListener('click', async () => { await Store.signOut(); location.reload(); });
    sheet.append(loBtn);

    const dz = el('div', 'card danger-zone');
    dz.style.marginTop = '18px';
    dz.append(el('div', 'metric-name', '계정 삭제'));
    dz.append(el('p', 'rule-meta', '계정을 지우면 내 자료 문서도 함께 지워집니다. 되돌릴 수 없습니다.'));
    const pwD = inputEl({ type: 'password', placeholder: '확인을 위해 현재 비밀번호 입력', autocomplete: 'current-password' });
    const delBtn = el('button', 'btn danger', '내 계정과 자료를 모두 지우기');
    dz.append(field('현재 비밀번호', pwD), delBtn);
    delBtn.addEventListener('click', async () => {
      if (!pwD.value) return toast('현재 비밀번호를 입력하세요', true);
      delBtn.disabled = true;
      try {
        const user = Store.currentUser();
        const fresh = await Store.signIn(user.email, pwD.value); // 재인증 — 삭제는 최근 로그인이 필요하다
        await Store.deleteMyData();
        await Store.deleteAuthAccount(fresh.idToken);
        Store.clearLocalSession?.();
        location.reload();
      } catch (e) {
        delBtn.disabled = false;
        toast(`지우지 못했습니다 (${e.code || e.message})`, true);
      }
    });
    sheet.append(dz);
  });
}

function drillModal(title, rows) {
  openModal(title, sheet => {
    const list = el('div', 'drill-list');
    if (!rows.length) list.append(emptyState('해당 기록이 없습니다'));
    for (const r of rows) {
      const item = el('div', 'rev-item');
      item.append(el('div', 'rev-fields', r));
      list.append(item);
    }
    sheet.append(list);
  });
}

function emptyState(msg) {
  const e = el('div', 'empty');
  e.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 4h14v16l-4-3-3 3-3-3-4 3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  e.append(el('p', '', msg));
  return e;
}

/* ── 렌더 루프 / 부팅 ─────────────────────────── */
function render() {
  if (!state.doc) return;
  main.replaceChildren();
  const views = { plans: viewPlans, tasks: viewTasks, log: viewLog, review: viewReview };
  main.append(views[state.view]());
  for (const b of document.querySelectorAll('.nav-item')) b.classList.toggle('on', b.dataset.view === state.view);
}

for (const b of document.querySelectorAll('.nav-item')) {
  b.addEventListener('click', () => { state.view = b.dataset.view; render(); });
}

$('fab').addEventListener('click', () => {
  if (state.view === 'tasks') return taskModal(null);
  if (state.view === 'log') return execModal(null);
  if (state.view === 'review') { state.view = 'plans'; render(); }
  planModal(null);
});

const exportData = async () => {
  try {
    const doc = await Store.loadDoc();
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pds-diary-${todayKST().replaceAll('-', '')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('전체 자료를 파일로 보냈습니다');
  } catch { toast('보내기 실패 — 다시 시도하세요', true); }
};
$('exportBtn').addEventListener('click', exportData);
$('exportBtnM').addEventListener('click', exportData);

/* ── 인증 게이트 ─────────────────────────────
   body.locked로 시작한다 → 첫 화면은 항상 로그인.
   세션(저장된 refreshToken)이 살아 있으면 곧바로 앱으로 들어간다. */
const authError = $('authError');
let authMode = 'login';

function setAuthMode(m) {
  authMode = m;
  $('tabLogin').classList.toggle('on', m === 'login');
  $('tabSignup').classList.toggle('on', m === 'signup');
  $('tabLogin').setAttribute('aria-selected', String(m === 'login'));
  $('tabSignup').setAttribute('aria-selected', String(m === 'signup'));
  $('authSubmit').textContent = m === 'login' ? '로그인' : '계정 만들기';
  $('authPassword').setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
  authError.hidden = true;
}
$('tabLogin').addEventListener('click', () => setAuthMode('login'));
$('tabSignup').addEventListener('click', () => setAuthMode('signup'));

function authFail(msg) { authError.textContent = msg; authError.hidden = false; }
const GENERIC_AUTH_FAIL = '이메일 또는 비밀번호가 올바르지 않습니다';
// 로그인 실패 문구는 하나다 — '없는 아이디'와 '비밀번호만 틀림'을 구분해 알려주지 않는다
$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('authEmail').value.trim(), pw = $('authPassword').value;
  if (!email || pw.length < 6) return authFail('이메일과 비밀번호(6자 이상)를 입력하세요');
  const btn = $('authSubmit');
  btn.disabled = true;
  try {
    if (authMode === 'login') await Store.signIn(email, pw);
    else await Store.signUp(email, pw);
    enterApp();
  } catch (err) {
    if (authMode === 'signup' && err.code === 'EMAIL_EXISTS') authFail('이미 가입된 이메일입니다 — 로그인해 주세요');
    else if (String(err.code || '').includes('TOO_MANY_ATTEMPTS')) authFail('시도가 너무 많습니다 — 잠시 뒤 다시 시도하세요');
    else if (authMode === 'signup' && err.code === 'INVALID_EMAIL') authFail('이메일 형식을 확인하세요');
    else authFail(GENERIC_AUTH_FAIL);
  } finally { btn.disabled = false; }
});

function forceLock(note) {
  state.doc = null;
  document.body.classList.add('locked');
  if (note) authFail(note);
}

async function enterApp() {
  document.body.classList.remove('locked');
  authError.hidden = true;
  $('accountEmail').textContent = Store.currentUser()?.email || '';
  setSync('loading', '불러오는 중…');
  await boot();
}

$('logoutBtn').addEventListener('click', async () => {
  await Store.signOut(); // 문서에 무효화 시각을 찍고 로컬 세션 삭제 → 같은 토큰은 이제 거절된다
  location.reload();
});
$('accountBtn').addEventListener('click', accountModal);
$('accountBtnM').addEventListener('click', accountModal);

// 다른 곳에서 로그아웃·비번변경해 이 토큰이 죽으면 다음 서버 호출이 거절된다 → 잠금 화면으로
Store.setSessionLostHandler(() => forceLock('세션이 끊겼습니다 — 다시 로그인하세요'));

async function boot() {
  setSync('loading', '불러오는 중…');
  try {
    let doc = await Store.loadDoc();
    let migrated = false;
    if (!doc) {
      // 첫 로그인 — 6번 과제 공개 자료를 내 계정으로 옮긴다(없으면 빈 문서)
      setSync('saving', '이전 자료를 가져오는 중…');
      try { doc = await Store.migrateLegacy(); migrated = true; }
      catch (e2) { console.warn('이주 실패, 빈 문서로 시작', e2); doc = await Store.createFreshDoc(); }
    }
    state.doc = doc;
    setSync('ok', '동기화됨');
    render();
    if (migrated) toast('6번 과제 자료를 내 계정으로 옮겼습니다');
    if (!state.doc.settings) settingsModal(true); // 1일차 설정이 없으면 먼저 고른다
  } catch (err) {
    console.error(err);
    setSync('err', '연결 실패');
    main.replaceChildren();
    const e = emptyState('저장소에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.');
    const retry = el('button', 'btn', '다시 시도');
    retry.style.marginTop = '14px';
    retry.addEventListener('click', boot);
    e.append(retry);
    main.append(e);
  }
}

// 부팅 — 저장된 세션이 있으면 곧바로 앱, 아니면 locked(로그인 화면) 그대로
(async () => {
  try {
    const user = await Store.restoreSession();
    if (user) await enterApp();
  } catch (e) {
    console.warn('세션 복원 실패', e);
    Store.clearLocalSession();
  }
})();
