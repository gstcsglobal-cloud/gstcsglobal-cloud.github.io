function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}


const hnorm = (s) =>
  String(s ?? "").replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, " ").replace(/[\s.·()[\]{}/\\_-]/g, "").toLowerCase();


/* ---------- 순수 변환부 ----------
   시트를 실제로 읽고 쓰는 것과 분리해 둔다. 여기가 조용히 틀리는 자리이고,
   분리해 두어야 tests/t-mirror.mjs가 이 코드를 **그대로 떼어다** 실 픽스처로 검증할 수 있다
   (t-sync가 sheet-write에 쓰는 방식과 같다). 사본을 만들어 검증하면 사본만 맞을 뿐이다. */
function planSync(
  spec,
  cmap,
  csvText,
) {
  const rows = parseCSV(csvText);

  /* hints는 [["실적코드"],["자재코드","자재명"]] 꼴 — 바깥 AND, 안쪽 OR. */
  const hints = (spec.hints ?? []).map((h) => ([] []).concat(h));
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, spec.scan ?? 6); i++) {
    const h = (rows[i] ?? []).map(hnorm);
    if (hints.every((alts) => alts.some((x) => h.indexOf(hnorm(x)) >= 0))) { hi = i; break; }
  }
  if (hi < 0) throw new Error(`NO_HEADER: 힌트 ${JSON.stringify(spec.hints)}가 모두 있는 행이 없다`);

  /* 헤더 이름 → 열번호. 정규화 후 정확일치. 부분일치는 쓰지 않는다
     ('입사일'이 '재입사일'을, 'no'가 'note'를 잡던 사고가 실제로 있었다). */
  const at = {};
  (rows[hi] ?? []).map(hnorm).forEach((h, i) => { if (h) (at[h] ??= []).push(i); });
  const miss = [];
  for (const c of cmap) {
    c.idx = -1;
    for (const n of c.headers) {
      const hit = at[hnorm(n)];
      if (hit?.length) { c.idx = hit[0]; break; }
    }
    if (c.idx < 0 && !c.optional) miss.push(`${c.col}[${c.headers.join(" / ")}]`);
  }
  /* 못 찾으면 조용히 넘어가지 않는다. 옛 열 번호로 폴백하는 것이 가장 위험하다 —
     에러 없이 틀린 값이 들어가고, 화면은 멀쩡해 보인다. */
  if (miss.length) throw new Error("NO_COL: " + miss.join(", "));

  /* 데이터 행. 전 칸이 빈 행은 구글시트의 빈 격자일 뿐이라 뺀다 —
     이걸 안 빼면 미러가 시트 격자 크기만큼 부풀어 오른다. */
  const data = rows.slice(hi + 1).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  return { hi, cmap, data };
}

/* 한 배치를 DB 행 객체로. 빈 문자열은 null로 눕힌다 — 시트의 빈 칸과 '' 를
   DB에서 구분할 방법이 없고, 구분해봐야 화면이 둘을 똑같이 취급한다. */
function toRows(data, cmap, off) {
  return data.map((r, i) => {
    const o = { src_row: off + i };
    for (const c of cmap) {
      const v = c.idx >= 0 ? String(r[c.idx] ?? "") : "";
      o[c.col] = v === "" ? null : v;
    }
    return o;
  });
}

export { parseCSV, hnorm, planSync, toRows };
