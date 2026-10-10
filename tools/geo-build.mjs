/* 지도 자료 만들기 (v171) — 통합 관제의 세계·나라 지도.
   원자료(공개 자료 · 실데이터 없음):
     · 세계 나라 경계: world-atlas@2.0.2 countries-50m.json (ISC · Natural Earth 기반)
     · 나라 안 행정구역(도·시·현): Natural Earth 10m admin-1 states/provinces v5.1.2 (public domain)
   출력: assets/geo/world.json · assets/geo/<ISO2>.json — 좌표는 «경도·위도 × 정밀도»의 정수를 앞 점과의 차이로 적는다(파일을 작게).
     실행: node tools/geo-build.mjs <world-atlas countries-50m.json> <ne_10m_admin_1_states_provinces.geojson> <mapshaper 모듈 경로>
   ⚠ 자료를 바꾸면 이 스크립트로 다시 만든다 — 손으로 고치지 않는다(어느 판에서 왔는지 모르게 된다). */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const [,, WORLD, ADM1, MS] = process.argv;
const require = createRequire(import.meta.url);
const mapshaper = require(MS);
const topo = require(path.join(path.dirname(MS), '..', 'topojson-client'));
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'geo');
fs.mkdirSync(OUT, { recursive: true });
const run = async (cmd, input) => { const out = await mapshaper.applyCommands(cmd, input); return JSON.parse(out[Object.keys(out)[0]]); };
/* 고리 하나를 정수 차이 배열로: [x0,y0,dx1,dy1,...] */
function enc(ring, P){ const a=[]; let px=0, py=0; ring.forEach(([x,y],i)=>{ const X=Math.round(x*P), Y=Math.round(y*P); if(i&&X===px&&Y===py) return; a.push(X-px, Y-py); px=X; py=Y; }); return a; }
function polys(g){ return g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[]; }
function encGeom(g, P){ return polys(g).map(poly=>poly.map(r=>enc(r,P))); }
/* 넓이 가중 중심(가장 큰 조각의 무게중심) — 이름표 자리 */
function centroid(g){ let best=null, ba=-1; polys(g).forEach(p=>{ const r=p[0]; let a=0,cx=0,cy=0; for(let i=0,j=r.length-1;i<r.length;j=i++){ const f=r[j][0]*r[i][1]-r[i][0]*r[j][1]; a+=f; cx+=(r[j][0]+r[i][0])*f; cy+=(r[j][1]+r[i][1])*f; }
  if(Math.abs(a)>ba){ ba=Math.abs(a); best=a?[cx/(3*a), cy/(3*a)]:r[0]; } }); return best?[+best[0].toFixed(3), +best[1].toFixed(3)]:null; }

/* 세계 — 50m 을 15% 로 줄이고 0.05° 정밀도 */
const wt = JSON.parse(fs.readFileSync(WORLD, 'utf8'));
const wgj = topo.feature(wt, wt.objects.countries);
const ws = await run('-i in.json -simplify 18% keep-shapes -o out.json format=geojson', { 'in.json': JSON.stringify(wgj) });
const W = { v:1, P:20, src:'world-atlas@2.0.2 countries-50m (Natural Earth)', f: ws.features.filter(f=>f.geometry).map(f=>({ id:String(f.id||''), n:f.properties.name, c:centroid(f.geometry), g:encGeom(f.geometry,20) })) };
fs.writeFileSync(path.join(OUT, 'world.json'), JSON.stringify(W));
console.log('world.json', (fs.statSync(path.join(OUT,'world.json')).size/1024).toFixed(0)+'KB', W.f.length);

/* 나라 안 행정구역 — 운영단위가 있는 나라만. 이름은 네 언어로 */
const A = JSON.parse(fs.readFileSync(ADM1, 'utf8'));
const CC = { KOR:'KR', TWN:'TW', CHN:'CN', JPN:'JP', USA:'US', SGP:'SG' };
const PCT = { KOR:'40%', TWN:'45%', CHN:'10%', JPN:'15%', USA:'10%', SGP:'60%' };   // 나라 지도는 크게 그리므로 해안선을 더 남긴다(v171 · 파일은 여전히 작다)
for (const a3 of Object.keys(CC)) {
  const fc = { type:'FeatureCollection', features: A.features.filter(f=>f.properties.adm0_a3===a3).map(f=>({ type:'Feature', geometry:f.geometry,
    properties:{ en:f.properties.name_en||f.properties.name, ko:f.properties.name_ko||'', zh:f.properties.name_zht||f.properties.name_zh||'', ja:f.properties.name_ja||'', iso:f.properties.iso_3166_2||'' } })) };
  const s = await run('-i in.json -simplify '+PCT[a3]+' keep-shapes -o out.json format=geojson', { 'in.json': JSON.stringify(fc) });
  const P = 200;   // 0.005°
  const D = { v:1, P, cc:CC[a3], src:'Natural Earth 10m admin-1 v5.1.2', f: s.features.filter(f=>f.geometry).map(f=>({ n:{ en:f.properties.en, ko:f.properties.ko, zh:f.properties.zh, ja:f.properties.ja }, iso:f.properties.iso, c:centroid(f.geometry), g:encGeom(f.geometry,P) })) };
  const fp = path.join(OUT, CC[a3]+'.json'); fs.writeFileSync(fp, JSON.stringify(D));
  console.log(CC[a3]+'.json', (fs.statSync(fp).size/1024).toFixed(0)+'KB', D.f.length);
}
