// 카카오 챗봇과 대시보드(report/index.html·hr/index.html)가 "같은 숫자"를 내도록
// 판정 로직을 한 곳에 포팅해 공유한다. 대시보드 쪽 로직이 바뀌면 이 파일도 반드시 같이 고칠 것.
// 순수 JS(타입 없음) — Deno(Edge Function)와 Node(유닛테스트) 양쪽에서 그대로 돌아간다.

export const MS = 86400000;

// report/index.html:595 — 엑셀 WEEKNUM(일~토, 1/1 포함 주=W1)과 동일. 시트 주차 라벨과 일치해야 한다.
export function isoW(d) {
  const sun = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  sun.setUTCDate(sun.getUTCDate() - sun.getUTCDay());
  const jan1 = new Date(Date.UTC(sun.getUTCFullYear(), 0, 1));
  const w = Math.ceil((((sun - jan1) / MS) + jan1.getUTCDay() + 1) / 7);
  return sun.getUTCFullYear() + '-W' + String(w).padStart(2, '0');
}

// report/index.html:586 — '2022. 8. 1' / '2025-07-10' 등 시트에 섞여 쓰이는 날짜 표기를 흡수.
export function pd(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  s = String(s).trim();
  if (!s) return null;
  s = s.replace(/\.\s*/g, '-').replace(/\/-?/g, '-').replace(/-$/, '').replace(/\s/g, '');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

// 날짜 셀 — 구글 시트가 서식에 따라 '2021-06-04' 또는 시리얼 숫자(45123)로 내보낸다.
// cip 파서에만 있던 시리얼 처리를 공용화한 것(이게 없으면 Turn On이 '-'로 나온다).
export function dateCell(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!isNaN(n) && n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  return pd(s);
}

// report/index.html:896 — 퇴사일=마지막 근무일 → 그 달 포함, 다음달 제외
export function activeAt(p, asOf) {
  return !!(p.join && p.join <= asOf && (!p.quit || p.quit >= asOf));
}

// sheet-write/index.ts normKey와 동일 — 시트의 "10908059.0" 같은 표기를 흡수
export function normKey(s) {
  return String(s ?? '').trim().replace(/\.0+$/, '');
}

/* ============================================================
   사이트/고객사 표기 정규화
   대시보드(report/index.html:356~401, assets/core.js:1005~1012)와 **완전히 동일**해야 한다.
   여기가 어긋나면 "F16" 같은 필터가 조용히 0건을 반환한다(실제로 그런 사고가 있었다).
   ============================================================ */
export function nfw(s) {                      // 전각 ASCII → 반각 (ＰＳＭＣ와 PSMC를 같은 키로)
  s = (s == null) ? '' : String(s);
  if (!/[！-～　]/.test(s)) return s;
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
}
export function upk(s) { return nfw(s).toUpperCase(); }

export function normCust(name) {
  if (!name) return '';
  const up = upk(name).trim();
  if (!up) return '';
  let base = '';
  if (up.includes('MICRON')) base = 'MICRON';
  else if (up.includes('TAIWAN-ASIA') || up.includes('ASIA SEMICON')) base = 'TASC';
  else if (up.includes('POWERCHIP')) base = 'POWERCHIP';
  else if (up.includes('WINBOND')) base = 'WINBOND';
  else if (up.includes('TSMC')) base = 'TSMC';
  else if (/삼성디스플레이|SAMSUNG\s*DISPLAY/.test(up)) base = 'SAMSUNG DISPLAY';
  else if (/삼성|SAMSUNG/.test(up)) base = 'SAMSUNG';
  else if (/하이닉스|HYNIX/.test(up)) base = 'SK HYNIX';
  // 한 브랜드가 도시·법인별로 갈라져 들어오는 것들 (SPEC-SYNC: core.js GST.ORG.customer)
  else if (/CHANGXIN|长鑫|長鑫/.test(up)) base = 'CHANGXIN';
  else if (/TIANMA|天马|天馬/.test(up)) base = 'TIANMA';
  else if (up.includes('CSOT')) base = 'CSOT';
  /* SPEC-SYNC: core.js GST.ORG.customer 와 같은 규약.
     예전에는 «첫 단어»를 잘랐는데, 고객사가 50개를 넘자 '주식회사 X' 꼴 네 회사가
     전부 `주식회사` 한 칸에 뭉치고 'Global Foundries' 가 `GLOBAL` 이 됐다.
     서로 다른 고객사가 합쳐지는 것이 가장 나쁜 실패라, 첫 단어가 아니라
     «법인격을 걷어낸 이름 전체»를 쓴다. */
  else base = (up.replace(/\(주\)|（주）|주식회사|유한회사|株式会社|有限公司|股份有限公司/g, ' ')
                 .replace(/\b(CO|LTD|INC|CORP|CORPORATION|COMPANY|LIMITED|GMBH|PTE|PTY|PLC)\b\.?/g, ' ')
                 .replace(/[.,()·]/g, ' ').replace(/\s+/g, ' ').trim()) || up;
  const m = up.match(/\(([A-Z0-9-]+)\)/) || up.match(/\b(F\d{1,2}N?)\b/);
  return m ? base + ' ' + m[1] : base;
}
export function custBase(s) {
  const u = upk(s);
  if (u.includes('PSMC') || u.includes('POWERCHIP')) return 'PSMC';
  if (u.includes('TASC') || u.includes('TAIWAN-ASIA') || u.includes('ASIA SEMI')) return 'TASC';
  if (u.includes('WINBOND')) return 'WINBOND';
  if (u.includes('MICRON') || /\bF1[016]/.test(u)) return 'MICRON';
  return normCust(s);
}
export function fabOf(s) {
  const u = upk(s);
  const m = u.match(/\bF(16N|16S|16|11|10)\b/);
  if (m) return 'F' + m[1];
  if (/TONG\s*L/.test(u)) return 'F16N';   // Tong luo(통뤄) = F16N
  if (/TAINAN/.test(u)) return 'F16S';     // Tainan(타이난) = F16S
  return '';
}
export function siteKey(sv) {
  const up = upk(sv);
  if (!up.trim()) return '';
  if (up.includes('F16N') || /TONG\s*L/.test(up)) return 'MICRON F16N';
  if (up.includes('F16S') || up.includes('TAINAN')) return 'MICRON F16S';
  if (up.includes('F16')) return 'MICRON F16';
  if (up.includes('F11')) return 'MICRON F11';
  if (up.includes('F10')) return 'MICRON F10';
  if (up.includes('PSMC') || up.includes('POWERCHIP')) return 'POWERCHIP';
  if (up.includes('WINBOND')) return 'WINBOND';
  if (up.includes('TSMC')) return 'TSMC';
  if (up.includes('TASC') || up.includes('ASIA SEMI')) return 'TASC';
  return normCust(up);
}
// report/index.html:1031 — 대시보드가 실제로 쓰는 사이트 키. 값 예: F16 · F11 · F16N · PSMC
export function grpKey(x) { return x.fab || x.custB || 'ETC'; }
// 대시보드 SITES(report:1029)에 F16S·F10을 더한 것 — 봇이 생성해도 되는 사이트 어휘의 전부
export const SITE_KEYS = ['F16', 'F11', 'F16N', 'F16S', 'F10', 'PSMC', 'TASC', 'WINBOND'];

/* ---------- CSV (RFC4180 최소 구현 — 따옴표 안의 콤마/개행 처리) ---------- */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

const lc = (s) => String(s ?? '').trim().toLowerCase();
/* 헤더 전용 정규화 — 줄바꿈·공백·마침표·중점·괄호·슬래시·밑줄·하이픈을 지우고
   전각→반각 후 소문자. 설치·CIP 머리글이 'Scrubber⏎S/N' · 'Main Tool⏎Maker'처럼
   줄바꿈을 품고 있어 lc()로는 정확일치가 아예 불가능하다.
   값 정규화(nfw/upk)와는 별개다 — 데이터 값에까지 이 규칙을 쓰면 필터가 깨진다.
   SPEC-SYNC: 정본은 assets/core.js GST.SM.norm — 셋(core.js·hr.js·sheet-write)이 같아야 한다. */
const hnorm = (s) =>
  String(s ?? '').replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ').replace(/[\s.·()[\]{}/\\_-]/g, '').toLowerCase();
// 이름 하나 이상과 정규화 정확일치. 부분일치를 쓰지 않아 '입사일'이 '재입사일'을 잡지 않는다.
const hEq = (...names) => (h) => names.some((n) => hnorm(n) === hnorm(h));

function headerRowOf(rows, hints, maxScan = 8) {
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const h = (rows[i] ?? []).map(lc);
    if (hints.every((m) => h.some(m))) return i;
  }
  throw new Error('NO_HEADER');
}
const colIdx = (header, match) => header.map(lc).findIndex(match);
/* 이름 목록 → 열 번호 맵. 못 찾은 항목은 miss에 담아 돌려준다 —
   조용히 옛 번호로 되돌아가지 않는 것이 이번 개편의 핵심이다. */
function mapCols(headerRow, spec) {
  const H = (headerRow ?? []).map(hnorm), C = {}, miss = [];
  for (const key of Object.keys(spec)) {
    const names = [].concat(spec[key]);
    let idx = -1;
    for (const n of names) { const i = H.indexOf(hnorm(n)); if (i >= 0) { idx = i; break; } }
    C[key] = idx;
    if (idx < 0) miss.push(`${key}[${names.join('/')}]`);
  }
  return { C, miss };
}

/* ---------- 인원명단 (gid 1213453343) ---------- */
export function parseRoster(csvText) {
  const rows = parseCSV(csvText);
  const hIdx = headerRowOf(rows, [(h) => h === 'id', (h) => h.includes('work place')]);
  const header = rows[hIdx].map(lc);
  const ci = {
    id: colIdx(header, (h) => h === 'id'),
    name: colIdx(header, (h) => h.includes('name') && h.includes('영문')),
    dept: colIdx(header, (h) => h.startsWith('dept')),
    wp: colIdx(header, (h) => h === 'work place'),
    role: colIdx(header, (h) => h.includes('position role')),
    join: colIdx(header, (h) => h.startsWith('date of entry')),
    quit: colIdx(header, (h) => h.startsWith('resignation')),
    org: colIdx(header, (h) => h.includes('조직도')),
    posKo: colIdx(header, (h) => h === '직급'),
    onsite: colIdx(header, (h) => h.includes('현장')),
  };
  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[ci.id]) continue;
    const id = normKey(r[ci.id]);
    if (!id) continue;
    const wp = (r[ci.wp] ?? '').trim();
    const org = (r[ci.org] ?? '').trim();
    const join = pd(r[ci.join]);
    // 대시보드(report:790)와 동일: 입사일 없는 행과 조직도상 Chiller 인원은 전 지표에서 제외
    if (!join || /CHILLER/i.test(org)) continue;
    out.push({
      id,
      name: (r[ci.name] ?? '').trim(),
      dept: (r[ci.dept] ?? '').trim(),
      site: siteKey(wp),        // 표시용 정규화 표기 (예: MICRON F16N)
      fab: fabOf(wp),           // 필터 키 1순위 (예: F16N)
      custB: custBase(wp),      // 필터 키 2순위 (예: MICRON)
      role: (r[ci.role] ?? '').trim(),
      join,
      quit: pd(r[ci.quit]),
      posKo: (r[ci.posKo] ?? '').trim(),
      onsite: (r[ci.onsite] ?? '').trim() === 'O',
    });
  }
  return out;
}

/* ---------- 교육현황 (gid 0) ----------
   열을 번호로 박아두면 시트 머리글이 조금만 바뀌어도 통째로 죽는다.
   실제로 B열 '교육과정'→'Site', 8열이 '법인 교육과정'으로 바뀌면서 NO_HEADER로 전부 0행이 됐다.
   → 머리글 문자열로 위치를 찾고, 못 찾은 것만 옛 고정 위치로 폴백한다.
   대시보드(hr/index.html eduMap · report/index.html eduMap)와 같은 규칙이다. */
/* 교육현황 컬럼 해석.
   SPEC-SYNC — hr/index.html · report/index.html 에 같은 규약의 사본이 있다. 정본은 hr/index.html.
   2026-08 시트 개편 후 이 시트는 «사번 + 과정별 완료일»만 갖는다:
     r0            법인 교육과정(병합) · 본사 교육과정(병합)
     r1            Basic · Veteran · Scrubber Lv.2 · Scrubber Lv.3
     r2 ← 헤더행    No · Site · 인원 · 사원번호 · 교육완료일 ×4
   인적사항(입사일·직급·직무·퇴사)은 인원명단이 원장이다 — 여기서 찾지 않는다.
   이수여부·시작일·교육시간 열도 없어졌다 → 완료일이 있으면 이수로 본다. */
export function eduMap(rows) {
  const nm = (v) => String(v == null ? '' : v).replace(/[\s.·()]/g, '').toLowerCase();
  // 헤더행은 «인원 + 사원번호»로 찾는다. 예전에는 '교육과정'을 같이 요구했는데, 개편 후 그 말은
  // 밴드 행(r0)에 있고 '인원'은 r2에 있어 한 행에 둘 다 있는 행이 없다 → null 을 반환하며
  // 교육 답변이 통째로 죽었다.
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const h = (rows[i] ?? []).map(nm);
    if (h.some((x) => x.includes('인원')) && h.some((x) => x.includes('사원번호') || x === '사번')) { hi = i; break; }
  }
  if (hi < 0) return null;
  const R0 = Math.max(0, hi - 2), R1 = Math.min(rows.length, hi + 3); // 밴드는 헤더 «위»에도 «아래»에도 있다
  const H = (rows[hi] ?? []).map(nm);
  // 못 찾으면 -1. 옛 열 번호로 폴백하지 않는다 — 개편 후 4열은 Basic 완료일이라
  // 폴백이 살아 있으면 «완료일을 입사일로» 읽는다.
  const find = (pred) => H.findIndex((x) => x && pred(x));
  const c = {
    site: find((x) => x === 'site' || x === '교육과정'),
    name: find((x) => x.includes('인원')),
    id:   find((x) => x.includes('사원번호') || x === '사번'),
  };
  const G = [];
  for (let i = R0; i < R1; i++) (rows[i] ?? []).forEach((v, col) => {
    const t = nm(v); if (!t) return;
    const k = /scrubber/.test(t) ? (/lv3|level3/.test(t) ? 'lv3' : /lv2|level2/.test(t) ? 'lv2' : '')
            : /^basic/.test(t) ? 'basic' : /veteran/.test(t) ? 'vet' : '';
    if (k && !G.some((g) => g.k === k)) G.push({ k, col });
  });
  G.sort((a, b) => a.col - b.col);
  const colIn = (st, en, re) => {
    for (let i = R0; i < R1; i++) { const r = rows[i] ?? [];
      for (let col = st; col < en && col < r.length; col++) { const t = nm(r[col]); if (t && re.test(t)) return col; } }
    return -1;
  };
  const DATE = { basic: 'bdate', vet: 'vdate', lv2: 'lv2', lv3: 'lv3' };
  G.forEach((g, i) => {
    const end = i + 1 < G.length ? G[i + 1].col : Math.max(g.col + 1, (rows[hi] ?? []).length);
    const dt = colIn(g.col, end, /완료일|수료일/);
    c[DATE[g.k]] = dt >= 0 ? dt : g.col;   // 과정당 완료일 1열 — 못 찾으면 밴드 열 자체
  });
  for (const k of ['bdate', 'vdate', 'lv2', 'lv3']) if (c[k] == null) c[k] = -1;
  return { hi, c };
}
export function parseEdu(csvText) {
  const rows = parseCSV(csvText);
  const M = eduMap(rows);
  if (!M) throw new Error('NO_HEADER');
  const c = M.c, gv = (r, i) => String((i >= 0 ? r[i] : '') ?? '').trim();
  const out = [];
  // 데이터 시작을 hi+3으로 고정하지 않는다 — 머리글이 2행이든 3행이든 이름 칸이 빈 행은 자연히 걸러진다
  for (let i = M.hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const id = normKey(gv(r, c.id));
    const name = gv(r, c.name);
    if (!name || /^(인원|name|이수여부)$/i.test(name)) continue;
    if (!id && !name) continue;
    out.push({
      id, name,
      site: gv(r, c.site),
      // 이수여부·비고 열은 시트에서 없어졌다 → 이수 판정은 완료일 유무, 퇴사는 인원명단이 원장.
      bdate: pd(r[c.bdate]),
      vdate: pd(r[c.vdate]),
      lv2date: pd(r[c.lv2]),
      lv3date: pd(r[c.lv3]),
    });
  }
  return out;
}

// report:1082~1091 — 사원번호 우선, ID가 없거나 미매칭이면 이름이 교육시트에서 유일할 때만
// 이름 폴백(동명이인 오귀속 방지). ID 오타로 인한 가짜 미이수를 막는 핵심 로직.
export function buildEduIndex(eduRows) {
  const byId = {}, byName = {}, dup = new Set();
  eduRows.forEach((e) => {
    if (e.id) byId[e.id] = e;
    if (e.name) {
      const k = e.name.trim().toUpperCase();
      if (byName[k]) dup.add(k);
      byName[k] = e;
    }
  });
  return {
    of(person) {
      if (person.id && byId[person.id]) return byId[person.id];
      const k = (person.name || '').trim().toUpperCase();
      return (k && !dup.has(k) && byName[k]) || null;
    },
  };
}

// report:1121~1131 — 이수일<=기준일=done, 상태 '진행중'(미완료)=ing, 그 외는 사유와 함께 미이수
export function clsP(person, eduIndex, dateKey, statusKey, asOf) {
  const e = eduIndex.of(person);
  if (e && e[dateKey] && e[dateKey] <= asOf) return { c: 'done' };
  if (e && String(e[statusKey] || '').trim() === '진행중') return { c: 'ing' };
  if (!e) return { c: 'no', why: '매칭없음' };
  if (e[dateKey]) return { c: 'no', why: '이수 ' + (e[dateKey].getUTCMonth() + 1) + '/' + e[dateKey].getUTCDate() + '(기준일후)' };
  return { c: 'no', why: '이수일없음' };
}

export function tally(people, eduIndex, dateKey, statusKey, asOf) {
  const r = { t: people.length, done: 0, ing: 0, no: 0, noList: [] };
  people.forEach((p) => {
    const c = clsP(p, eduIndex, dateKey, statusKey, asOf);
    if (c.c === 'done') r.done++;
    else if (c.c === 'ing') r.ing++;
    else { r.no++; r.noList.push({ name: p.name, id: p.id, why: c.why }); }
  });
  return r;
}

// LV1(Basic, 재직 6개월 미만) / LV2(Veteran, 6개월 이상) — report:1117~1118과 동일 임계값.
// 사이트 비교는 반드시 grpKey 기준(report:1116) — 원문 Work Place로 비교하면 영원히 0건.
export function eduPlan(roster, eduIndex, asOf, opts = {}) {
  const site = opts.site || '';
  const base = roster.filter((p) => p.onsite && activeAt(p, asOf) && p.join && (!site || grpKey(p) === site));
  const sixP = (p) => ((asOf - p.join) / MS) >= 182;
  return {
    b: tally(base.filter((p) => !sixP(p)), eduIndex, 'bdate', 'basic', asOf),
    v: tally(base.filter(sixP), eduIndex, 'vdate', 'vet', asOf),
  };
}

/* ---------- 설치현황 (gid 891608329) ---------- */
/* 설치현황 — 128열짜리 넓은 시트라 위치 고정이 특히 위험했다(type이 75열째).
   이름으로 찾는다. 주의: 이 시트는 같은 이름이 여러 번 나온다 —
   'Main Tool ID'(17·30) · 'Type'(44·79·96) · 'N2 Purge (slm)'(22·25·49·53).
   그래서 챔버 판정은 'Type'이 아니라 'Scrubber type'으로만 잡는다(Type으로 잡으면
   44열을 물어 전 설비가 SINGLE로 계산된다).
   SPEC-SYNC: assets/core.js GST.SM.SPEC.inst 와 같은 이름을 써야 한다. */
const INSTALL_SPEC = {
  country: 'Country', customer: 'Customer', location: 'Location',
  code: 'Scrubber CODE', sn: 'Scrubber S/N', model: 'Scrubber Model', burner: 'Burner Type',
  fab: 'FAB', floor: 'Floor', bay: 'Bay',
  group1: 'Group_1', group2: 'Group_2', detail1: 'Detail_1', detail2: 'Detail_2',
  fabIn: 'FAB In', turnOn: 'Turn On', warranty: 'Warranty In/Out', type: 'Scrubber type',
};
export function parseInstall(csvText) {
  const rows = parseCSV(csvText);
  const hIdx = headerRowOf(rows, [hEq('Scrubber CODE'), hEq('FAB')]);
  const { C: IC } = mapCols(rows[hIdx], INSTALL_SPEC);
  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const sn = (r[IC.sn] ?? '').trim();
    if (!sn) continue;
    // 중간에 섞인 배너/소계 행을 거르는 안전망 — 실제 S/N에는 숫자가 있고 머리글 문구는 없다
    if (!/\d/.test(sn) || /S\s*\/\s*N/i.test(sn)) continue;
    const g = (k) => (r[IC[k]] ?? '').trim();
    out.push({
      sn,
      code: g('code'),
      country: g('country'),
      customer: g('customer'),
      location: g('location'),
      model: g('model'),
      burner: g('burner'),
      fab: g('fab'),
      floor: g('floor'),
      bay: g('bay'),            // 기둥번호 (예: J-21 · H.5-20 · 暫存區 f9/P6-K)
      group1: g('group1'),
      group2: g('group2'),
      detail1: g('detail1'),
      detail2: g('detail2'),
      turnOn: dateCell(r[IC.turnOn]),
      warranty: g('warranty'),
      chambers: String(r[IC.type] ?? '').toUpperCase().includes('DUAL') ? 2 : 1,
    });
  }
  return out;
}

// S/N 비교 정규화 — 대소문자·공백·하이픈 차이를 흡수한다("dbw 2148" == "DBW-0000")
const snNorm = (s) => upk(s).replace(/[^A-Z0-9]/g, '');
export function snMatch(rowVal, want) {
  const a = snNorm(rowVal), b = snNorm(want);
  return !!b && a.includes(b);
}
export function findEquip(installRows, query) {
  if (!snNorm(query)) return [];
  return installRows.filter((r) => snMatch(r.sn, query) || snMatch(r.code, query));
}

/* ---------- 실적현황 (gid 646668307) — fault/index.html:430~433 컬럼맵 ---------- */
/* 예전에는 헤더를 찾아놓고도(hIdx) 열은 고정 번호로 읽었다. 시트가 밀려도 NO_HEADER 없이
   통과한 뒤 엉뚱한 열을 읽는 가장 위험한 조합이었다 — 이제 찾은 헤더에서 이름으로 해석한다.
   수선실적은 헤더 67개·정규화 후 중복 0이라 평면 매칭으로 충분하다(실측 확인).
   SPEC-SYNC: assets/core.js GST.SM.SPEC.wk 와 같은 이름을 써야 한다. */
const FAULT_SPEC = {
  customer: '고객사', campus: '단지', line: '라인', bay: 'BAY', proc: '공정',
  model: 'MODEL(자사)', rsCode: '실적코드', stage: '작업단계', sn: 'S/N(IN)',
  pf: '유/무상', alarm: '알람유형', phenom: '현상', cause: '원인', action: '조치',
  dStart: '작업시작일', workMin: '작업시간(분)', manMin: '작업공수', workers: '작업자',
};
export function parseFaultRecords(csvText) {
  const rows = parseCSV(csvText);
  const hIdx = headerRowOf(rows, [hEq('실적코드'), hEq('작업단계')]);
  const { C: FC } = mapCols(rows[hIdx], FAULT_SPEC);
  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const g = (k) => (r[FC[k]] ?? '').trim();
    const stage = g('stage');
    const start = pd(r[FC.dStart]);
    // 대시보드(report:924~925)와 동일한 행 게이트 — 작업단계와 작업시작일이 있어야 실적으로 센다
    if (!stage || !start) continue;
    const line = g('line');
    out.push({
      rs: g('rsCode'),
      site: line,
      fab: fabOf(line),
      custB: custBase(line),
      bay: g('bay'),
      model: g('model'),
      stage,
      sn: g('sn'),
      paid: g('pf'),
      alarm: g('alarm'),
      phenom: g('phenom'),
      cause: g('cause'),
      action: g('action'),
      start,
      manhour: parseFloat(r[FC.manMin]) || 0,
    });
  }
  return out;
}

// 작업단계 분류 — 대시보드 정의와 반드시 일치해야 한다.
//   report:954  isFault = (s === 'BM')                ← "고장"은 BM만
//   fault:435   SERVICE_STAGES = [BM,CBM,CM,CRM]      ← 서비스 대응(화이트리스트)
// 예전 블랙리스트 방식은 분류 안 된 단계까지 "고장"에 섞여 건수가 부풀고
// 원인 TOP에 '(미기재)'가 1위로 올라왔다.
export const STAGE_SETS = {
  고장: ['BM'],
  서비스: ['BM', 'CBM', 'CM', 'CRM'],
  점검: ['TBM'],
  설치: ['반입', 'SET-UP', 'SETUP', 'TURN-ON', 'TURNON'],
};
export const isServiceStage = (s) => STAGE_SETS.서비스.includes(String(s || '').trim());
export const isFaultStage = (s) => String(s || '').trim() === 'BM';

export function top3Cause(records) {
  const m = new Map();
  records.forEach((r) => {
    const k = r.cause || '(미기재)';
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cause, n]) => ({ cause, n }));
}

/* ---------- CIP (gid 2123129719=F11 · 1999732389=F16) ---------- */
const normItem = (s) => String(s || '').replace(/\s+/g, ' ').trim();
/* CIP는 점검 항목이 '열'로 늘어나는 시트라, 항목 구간을 숫자로 박아두면 항목이 추가될 때마다
   코드를 고쳐야 했다(F11 13~18 · F16 15~38을 손으로 관리). 구간을 이름으로 유도한다:
   'FAB In' 다음 ~ 'Remark' 직전이 항목 구간이다. 실측으로 기존 값을 정확히 재현하고,
   앞으로 항목이 늘어나면 코드 수정 없이 자동으로 잡힌다.
   헤더 행도 rows[1] 고정 대신 찾는다(F11·F16 모두 0행은 적용일자 띠라 헤더가 아니다). */
export function parseCIP(csvText, site) {
  const rows = parseCSV(csvText);
  if (rows.length < 3) return [];
  let hIdx;
  try { hIdx = headerRowOf(rows, [hEq('Scrubber S/N'), hEq('FAB In')], 6); }
  catch { return []; }                       // 구조가 다른 시트는 조용히 건너뛴다(기존 동작 유지)
  const hdr = rows[hIdx] || [];
  const H = hdr.map(hnorm);
  const snC = H.indexOf(hnorm('Scrubber S/N'));
  const c0 = H.indexOf(hnorm('FAB In')) + 1;
  const rmk = H.indexOf(hnorm('Remark'));
  const c1 = (rmk > c0 ? rmk : hdr.length) - 1;   // Remark가 없으면 헤더 끝까지
  if (snC < 0 || c0 <= 0 || c1 < c0) return [];
  const recs = [];
  for (let c = c0; c <= c1; c++) {
    const item = normItem(hdr[c]);
    if (!item) continue;
    for (let i = hIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const v = String(row[c] || '').trim();
      if (!v) continue;
      const up = v.toUpperCase();
      if (up.startsWith('N/A') || up.startsWith('N.A')) continue;
      if (up.includes('NOT')) { recs.push({ site, item, sn: row[snC], done: null }); continue; }
      const d = dateCell(v);
      if (d) recs.push({ site, item, sn: row[snC], done: d });
    }
  }
  return recs;
}
export function cipProgress(recs) {
  const total = recs.length;
  const done = recs.filter((r) => r.done).length;
  return { total, done, remain: total - done, rate: total ? Math.round((done / total) * 100) : 0 };
}

/* ---------- 휴가현황 (gid 262805841) ---------- */
export function parseLeave(csvText) {
  const rows = parseCSV(csvText);
  const hIdx = headerRowOf(rows, [(h) => h === '사원번호', (h) => h === '휴가시작일']);
  const header = rows[hIdx].map(lc);
  const ci = {
    empId: colIdx(header, (h) => h === '사원번호'),
    name: colIdx(header, (h) => h === '이름'),
    type: colIdx(header, (h) => h === '항목'),
    start: colIdx(header, (h) => h === '휴가시작일'),
    end: colIdx(header, (h) => h === '휴가종료일'),
    amt: colIdx(header, (h) => h === '휴가신청시간'),
    unit: colIdx(header, (h) => h === '비고'),
  };
  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    // empId는 숫자라 normKey 쓰면 안 됨 — trim만
    const empId = String(r[ci.empId] ?? '').trim();
    const name = (r[ci.name] ?? '').trim();
    if (!empId && !name) continue;
    // amt: 휴가신청시간(시간단위) → 비고(天/小時)로 일수 변환
    const amtRaw = parseFloat(r[ci.amt]) || 0;
    const unit = (r[ci.unit] ?? '').trim();  // 비고 컬럼
    const amtDay = unit === '天' ? amtRaw : unit === '小時' ? amtRaw / 8 : amtRaw / 8;
    out.push({
      empId, name,
      type: (r[ci.type] ?? '').trim(),
      start: pd(r[ci.start]),
      end: pd(r[ci.end]),
      amt: Math.round(amtDay * 10) / 10,  // 일수 (소수점 1자리)
    });
  }
  return out;
}

/* ============================================================
   기간 파서 — "26년"·"올해"·"7월"·"지난주"·"W30"을 {from,to,label}로.
   ============================================================ */
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));

export function weekRange(weekNo, now) {
  let d = new Date(now);
  for (let i = 0; i < 400; i++) {
    if (+isoW(d).slice(-2) === weekNo) {
      const sun = new Date(d); sun.setUTCDate(sun.getUTCDate() - sun.getUTCDay());
      sun.setUTCHours(0, 0, 0, 0);
      const sat = new Date(sun); sat.setUTCDate(sat.getUTCDate() + 6);
      sat.setUTCHours(23, 59, 59, 999);  // 토요일 끝까지 포함
      return { from: sun, to: sat, label: 'W' + String(weekNo).padStart(2, '0') };
    }
    d.setUTCDate(d.getUTCDate() - 7);
  }
  return null;
}

export function parsePeriod(text, now = new Date()) {
  const s = String(text || '');
  const Y = now.getUTCFullYear(), M = now.getUTCMonth();

  const wk = s.match(/\bW\s?(\d{1,2})\b/i);
  if (wk) { const r = weekRange(+wk[1], now); if (r) return r; }

  if (/올해|금년|이번\s?해/.test(s)) return { from: utc(Y, 0, 1), to: utc(Y, 11, 31), label: `${Y}년` };
  if (/작년|지난\s?해|전년/.test(s)) return { from: utc(Y - 1, 0, 1), to: utc(Y - 1, 11, 31), label: `${Y - 1}년` };

  const yr = s.match(/(20\d{2}|\d{2})\s*년/);
  if (yr) {
    const y = yr[1].length === 2 ? 2000 + +yr[1] : +yr[1];
    const mo = s.match(/(\d{1,2})\s*월/);
    if (mo) {
      const m = +mo[1] - 1;
      if (m >= 0 && m <= 11) return { from: utc(y, m, 1), to: utc(y, m + 1, 0), label: `${y}년 ${m + 1}월` };
    }
    return { from: utc(y, 0, 1), to: utc(y, 11, 31), label: `${y}년` };
  }

  if (/이번\s?달|금월|당월/.test(s)) return { from: utc(Y, M, 1), to: utc(Y, M + 1, 0), label: `${Y}년 ${M + 1}월` };
  if (/지난\s?달|전월|저번\s?달/.test(s)) {
    const d = utc(Y, M - 1, 1);
    return { from: d, to: utc(d.getUTCFullYear(), d.getUTCMonth() + 1, 0), label: `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월` };
  }
  const mo = s.match(/(\d{1,2})\s*월/);
  if (mo) { const m = +mo[1] - 1; if (m >= 0 && m <= 11) return { from: utc(Y, m, 1), to: utc(Y, m + 1, 0), label: `${Y}년 ${m + 1}월` }; }

  if (/이번\s?주|금주/.test(s)) {
    const sun = new Date(now); sun.setUTCHours(0, 0, 0, 0); sun.setUTCDate(sun.getUTCDate() - sun.getUTCDay());
    const sat = new Date(sun); sat.setUTCDate(sat.getUTCDate() + 6);
    return { from: sun, to: sat, label: '이번주' };
  }
  if (/지난\s?주|저번\s?주|전주/.test(s)) {
    const sun = new Date(now); sun.setUTCHours(0, 0, 0, 0); sun.setUTCDate(sun.getUTCDate() - sun.getUTCDay() - 7);
    const sat = new Date(sun); sat.setUTCDate(sat.getUTCDate() + 6);
    return { from: sun, to: sat, label: '지난주' };
  }
  const recent = s.match(/최근\s*(\d{1,3})\s*(일|주|개월|달)/);
  if (recent) {
    const n = +recent[1], unit = recent[2];
    const to = new Date(now); to.setUTCHours(0, 0, 0, 0);
    const from = new Date(to);
    if (unit === '일') from.setUTCDate(from.getUTCDate() - n + 1);
    else if (unit === '주') from.setUTCDate(from.getUTCDate() - n * 7 + 1);
    else from.setUTCMonth(from.getUTCMonth() - n);
    return { from, to, label: `최근 ${n}${unit}` };
  }
  return null;
}

/* ============================================================
   범용 질의 실행기 — LLM이 만든 "질의스펙"을 데이터에 적용한다.
   숫자는 전부 여기서(결정론적으로) 계산한다 — LLM은 계산에 관여하지 않는다.
   ============================================================ */
const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const tm = (val, want) => !has(want) || upk(val).includes(upk(want));
const inRange = (d, f) => (!f.from || (d && d >= f.from)) && (!f.to || (d && d <= f.to));

export function filterEquipment(rows, f = {}) {
  return rows.filter((r) =>
    (!has(f.sn) || snMatch(r.sn, f.sn) || snMatch(r.code, f.sn)) &&
    (!has(f.site) || fabOf(r.fab) === f.site || custBase(r.customer) === f.site) &&
    (!has(f.floor) || upk(r.floor) === upk(f.floor)) &&
    tm(r.bay, f.bay) && tm(r.model, f.model) && tm(r.warranty, f.warranty) &&
    (!has(f.group) || tm(r.group1, f.group) || tm(r.group2, f.group)) &&
    (!has(f.detail) || tm(r.detail1, f.detail) || tm(r.detail2, f.detail)) &&
    (!has(f.customer) || custBase(r.customer) === custBase(f.customer)) &&
    (!f.from && !f.to ? true : inRange(r.turnOn, f)));
}

export function filterFaults(rows, f = {}) {
  // category("고장"/"서비스"/"점검"/"설치")는 대시보드 정의의 작업단계 집합으로 변환한다.
  const cat = has(f.category) ? STAGE_SETS[String(f.category).trim()] : null;
  return rows.filter((r) =>
    (!has(f.sn) || snMatch(r.sn, f.sn)) &&
    (!has(f.site) || r.fab === f.site || r.custB === f.site) &&
    (!has(f.stage) || upk(r.stage) === upk(f.stage)) &&
    (!cat || cat.includes(r.stage)) &&
    (!has(f.alarm) || tm(r.alarm, f.alarm) || tm(r.phenom, f.alarm)) &&
    tm(r.cause, f.cause) && tm(r.model, f.model) && tm(r.paid, f.paid) && tm(r.bay, f.bay) &&
    inRange(r.start, f));
}

export function filterPeople(rows, f = {}, asOf = new Date()) {
  return rows.filter((p) =>
    (f.includeQuit === true || activeAt(p, asOf)) &&
    (f.onsite === false || p.onsite) &&
    (!has(f.site) || grpKey(p) === f.site) &&
    tm(p.name, f.name) && tm(p.posKo, f.posKo) && tm(p.role, f.role) &&
    (!has(f.empId) || p.id === normKey(f.empId)));
}

export function filterLeave(rows, f = {}) {
  return rows.filter((r) =>
    tm(r.name, f.name) && tm(r.type, f.type) &&
    (!has(f.empId) || r.empId === normKey(f.empId)) &&
    inRange(r.start, f));
}

// 교육 상태로 사람을 거르기 — LV 미지정 시 재직 6개월 기준으로 각자 해당 레벨을 판정
export function filterPeopleByEdu(people, eduIndex, asOf, level, status) {
  const sixP = (p) => ((asOf - p.join) / MS) >= 182;
  let list = people;
  if (level === 'LV1') list = list.filter((p) => !sixP(p));
  else if (level === 'LV2') list = list.filter(sixP);
  if (!has(status)) return list;
  return list.filter((p) => {
    const useVet = level === 'LV2' || (!has(level) && sixP(p));
    const c = clsP(p, eduIndex, useVet ? 'vdate' : 'bdate', useVet ? 'vet' : 'basic', asOf);
    if (status === '미이수') return c.c === 'no';
    if (status === '진행중') return c.c === 'ing';
    if (status === '이수완료') return c.c === 'done';
    return true;
  });
}

export function groupCount(rows, keyFn, limit = 10) {
  const m = new Map();
  rows.forEach((r) => { const k = String(keyFn(r) ?? '').trim() || '(미지정)'; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key, n]) => ({ key, n }));
}

export function groupAccessor(dataset, by) {
  const month = (d) => (d ? d.toISOString().slice(0, 7) : '');
  const table = {
    equipment: {
      site: (r) => fabOf(r.fab), model: (r) => r.model, floor: (r) => r.floor, bay: (r) => r.bay,
      group: (r) => r.group1, detail: (r) => r.detail1, customer: (r) => r.customer,
      warranty: (r) => r.warranty, month: (r) => month(r.turnOn),
    },
    faults: {
      site: (r) => r.fab || r.custB, cause: (r) => r.cause, model: (r) => r.model,
      stage: (r) => r.stage, sn: (r) => r.sn, alarm: (r) => r.alarm, month: (r) => month(r.start),
    },
    people: { site: grpKey, posKo: (r) => r.posKo, role: (r) => r.role, month: (r) => month(r.join) },
    leave: { name: (r) => r.name, type: (r) => r.type, month: (r) => month(r.start) },
  };
  return (table[dataset] || {})[by] || null;
}

/* ============================================================
   DB 요약본(JSONB) 직렬화 — Date는 JSON을 왕복하면 문자열이 되므로 되살려야 한다.
   ============================================================ */
export const DATE_FIELDS = {
  roster: ['join', 'quit'],
  edu: ['bdate', 'vdate', 'lv2date', 'lv3date'],
  equipment: ['turnOn'],
  faults: ['start'],
  leave: ['start', 'end'],
};
export function reviveDates(rows, key) {
  const fields = DATE_FIELDS[key] || [];
  if (!fields.length || !Array.isArray(rows)) return rows;
  return rows.map((r) => {
    const o = { ...r };
    for (const f of fields) o[f] = o[f] ? new Date(o[f]) : null;
    return o;
  });
}