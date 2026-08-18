/* t-region — 국내/해외가 들어와도 지표가 «조용히 0» 이 되지 않는지.
 *
 * 왜 이 파일이 있나. 주간현황(report)에는 대만 전용 목록이 네 군데 박혀 있었다:
 *   QBR_SITE(인원 허용목록) · SITES(구분 팔레트) · 설치 FAB 정규식 · OROWS(가동현황 행)
 * 국내(SEC·SDC) 자료가 들어오자 그 목록에 없는 값이 통째로 탈락해, **에러 하나 없이**
 * 국내 필터에서 재직 인원·공수·TO·가동현황이 전부 0/'-' 이 됐다. 화면은 정상으로 보였다.
 * 그래서 «어떤 목록에도 없는 새 사이트»를 넣어 보고, 그것이 살아남는지 여기서 못 박는다.
 *
 * 실데이터를 쓰지 않는다(공개 저장소) — 규칙만 검사하는 합성 행이다.
 *   실행: node t-region.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const el = () => ({ style:{}, appendChild(){}, insertBefore(){}, remove(){}, removeAttribute(){},
  setAttribute(){}, addEventListener(){}, classList:{add(){},remove(){},toggle(){}},
  querySelector:()=>null, querySelectorAll:()=>[], insertAdjacentHTML(){}, insertAdjacentElement(){},
  parentNode:{insertBefore(){}}, firstElementChild:null, textContent:'', innerHTML:'' });
global.document = { createElement:el, getElementById:()=>null, querySelector:()=>null,
  querySelectorAll:()=>[], body:el(), documentElement:el(), addEventListener(){},
  head:el(), readyState:'complete' };
global.window = { addEventListener(){}, location:{href:'',search:''}, self:{}, top:{},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, matchMedia:()=>({matches:false,addEventListener(){}}) };
global.window.self = global.window.top = global.window;
global.localStorage = global.window.localStorage;
global.location = global.window.location;
try { new Function(fs.readFileSync(ROOT+'/assets/core.js','utf8'))(); } catch(e){ console.log('core.js 로드 경고:', e.message); }
const GST = global.window.GST || global.GST;

let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.log('  ❌ '+m);} };

const RPT = fs.readFileSync(ROOT+'/report/index.html','utf8');

/* [1] 대만 전용 하드코딩이 되살아나지 않았는지 — 소스 자체를 본다.
   규칙이 아니라 «목록»으로 돌아가는 순간 같은 사고가 재발하므로, 목록 리터럴을 금지어로 둔다. */
console.log('[1] 대만 전용 목록이 판정에 다시 쓰이지 않는지');
ok(!/QBR_SITE\s*=\s*new Set/.test(RPT), 'QBR_SITE 허용목록이 되살아났다 — 국내 인원이 통째로 빠진다');
ok(!/const SITES\s*=\s*\['F16'/.test(RPT), 'SITES 고정 6키가 되살아났다 — 스택 차트에서 국내가 사라진다');
ok(!/\/F1\[016\]\|PSMC\|TASC\|WINBOND\/\.test\(GST\.upk\(String\(r\[CI\.fab\]/.test(RPT),
   '설치 FAB 대만 정규식이 되살아났다 — 국내 설비가 TO 산식에서 빠진다');
/* ⚠ «어떻게 생겼나»가 아니라 «무엇에서 나오나»를 본다. 예전에는 IIFE 꼴(`=(function()`)
   을 요구했는데, 그건 지켜야 할 규칙이 아니라 그때의 생김새였다 — 행 목록을 고치자마자
   붉게 떴다. 지켜야 할 것은 하나다: 행 목록이 «설비 자료에서» 나오고 낱말을 박아 두지 않는다. */
ok(!/const OROWS\s*=\s*\[\s*['"]/.test(RPT),
   'OROWS 가 다시 고정 목록이다 — 목록에 없는 값은 합계에서 조용히 사라진다');
ok(/fINST\.forEach\(r=>\{ if\(!_isIn\(r\)\)return;[\s\S]{0,120}w\[k\]=/.test(RPT),
   'OROWS 의 행 목록이 «설비가 실제로 있는 값»에서 만들어진다');
ok(/corpLabel\(\)/.test(RPT) && !/:'Taiwan'\)/.test(RPT), "법인 표기 기본값이 다시 'Taiwan' 이다");

/* [2] qbrOk — 허용목록이 아니라 제외목록. 새 사이트는 통과, TSMC·미기재는 탈락. */
console.log('[2] 운영지표 분모(qbrOk) 규칙');
const QBR_EX=/TSMC/;
const qbrOk=p=>{ const s=String(p.site||'').trim(); return !!s && !QBR_EX.test(GST.upk(s)); };
[['MICRON F16',true],['MICRON F11',true],['POWERCHIP',true],['WINBOND',true],
 ['P1',true],['A3',true],['청주',true],['라인장',true],   // ← 국내. 옛 규칙은 전부 탈락시켰다
 ['TSMC',false],['',false],['   ',false]
].forEach(([s,want])=>ok(qbrOk({site:s})===want, 'qbrOk("'+s+'") 기대 '+want));

/* [3] instQ — FAB 값이 있으면 통과. 대만은 옛 규칙과 결과가 같아야 한다(무변경 증명). */
console.log('[3] 설치 사이트 판정(instQ)');
const instQ=(fab,cust)=>String(fab||'').trim()?true
  :/PSMC|POWERCHIP|TASC|ASIA|WINBOND/.test(GST.upk(String(cust||'')));
[['F16','MICRON',true],['F11','MICRON',true],['F16N','MICRON',true],
 ['P1','PSMC',true],['FAB-4B','TASC',true],['WINBOND','WINBOND(GX)',true],   // 대만 — 전부 통과
 ['P3-D','삼성전자(주)',true],['A3','삼성전자(주)',true],['15A','삼성디스플레이(주)',true],  // 국내
 ['','삼성전자(주)',false],['','PSMC',true]
].forEach(([f,c,want])=>ok(instQ(f,c)===want, 'instQ(fab="'+f+'", cust="'+c+'") 기대 '+want));

/* [4] SITES — 목록 밖 인원이 '기타'로 반드시 들어가야 한다.
   스택 막대라, 빠진 사람은 «합계가 줄어드는» 형태로 조용히 사라진다. */
console.log('[4] 구분 목록이 인원을 하나도 버리지 않는지');
const SITE_ORD=['F16','F11','F16N','F16S','PSMC','TASC','WINBOND'], SITE_MAX=11;
const _grpRaw=x=>x.fab||x.custB||'ETC';
function build(rows){
  const cnt={}; rows.forEach(x=>{const k=_grpRaw(x); if(k)cnt[k]=(cnt[k]||0)+1;});
  const rank=k=>k==='ETC'?98:(SITE_ORD.indexOf(k)<0?50:SITE_ORD.indexOf(k));
  const keys=Object.keys(cnt).sort((a,b)=>(rank(a)-rank(b))||(cnt[b]-cnt[a])||(a<b?-1:1));
  const SITES=keys.length>SITE_MAX?keys.slice(0,SITE_MAX).concat(['기타']):keys;
  const set=new Set(SITES);
  return {SITES, grp:x=>{const k=_grpRaw(x);return set.has(k)?k:(set.has('기타')?'기타':k);}};
}
// 20종 소속 × 여러 명 — SITE_MAX 를 넘겨 '기타' 경로를 반드시 타게 만든다
const many=[];
for(let i=0;i<20;i++) for(let j=0;j<=i;j++) many.push({fab:'',custB:'SITE'+i});
{
  const {SITES,grp}=build(many);
  ok(SITES.length===SITE_MAX+1, '목록이 '+(SITE_MAX+1)+'개로 잘려야 한다: '+SITES.length);
  ok(SITES[SITES.length-1]==='기타', '마지막 칸이 기타가 아니다');
  const sum=SITES.reduce((a,s)=>a+many.filter(x=>grp(x)===s).length,0);
  ok(sum===many.length, '스택 합계 '+sum+' ≠ 인원 '+many.length+' — 목록 밖 인원이 사라졌다');
}
{
  // 대만만 있을 때는 옛 목록과 같은 순서로 서야 한다(표기 무변경)
  const tw=[{fab:'F16'},{fab:'F16'},{fab:'F11'},{fab:'F16N'},{fab:'',custB:'PSMC'},
            {fab:'',custB:'TASC'},{fab:'',custB:'WINBOND'}];
  const {SITES}=build(tw);
  ok(SITES.join(',')==='F16,F11,F16N,PSMC,TASC,WINBOND',
     '대만 순서가 바뀌었다: '+SITES.join(','));
  ok(SITES.indexOf('기타')<0, '대만만 있을 때 기타가 생겼다');
}
{
  // ETC(근무지 미기재)는 항상 맨 뒤 — 국내에서 가장 큰 덩어리라 앞에 서면 표가 이상해진다
  const mix=[{fab:''},{fab:''},{fab:''},{fab:'F16'},{fab:'',custB:'A3'}];
  const {SITES}=build(mix);
  ok(SITES[SITES.length-1]==='ETC', 'ETC 가 맨 뒤가 아니다: '+SITES.join(','));
}

/* [5] 구분·국가 판정 — GST.ORG 가 국내 어휘를 실제로 가르는지 */
console.log('[5] GST.ORG 구분·국가');
ok(GST.ORG.region('SEC Scrubber')==='국내', 'SEC → 국내');
ok(GST.ORG.region('SDC Scrubber')==='국내', 'SDC → 국내');
ok(GST.ORG.region('GST TAIWAN SCRUBBER')==='해외', 'GST TAIWAN → 해외');
ok(GST.ORG.region('KOREA')==='국내', 'KOREA → 국내');
// 실측 운영단위 — '해외 기타' 는 «해외» 글자로 잡혔는데 '국내기타' 만 안 잡혀 미상이 됐다
ok(GST.ORG.region('국내기타 SCRUBBER')==='국내', '국내기타 SCRUBBER → 국내');
ok(GST.ORG.region('해외 기타 SCRUBBER')==='해외', '해외 기타 SCRUBBER → 해외');
ok(GST.ORG.region('GST HEFEI SCRUBBER')==='해외', 'GST HEFEI → 해외');
ok(GST.ORG.region('SEC Scrubber')==='국내', 'SEC Scrubber → 국내');
ok(GST.ORG.region('')==='', '빈 값은 모름 — 국내로 치면 합계가 조용히 틀어진다');
ok(GST.ORG.country('F16')==='TAIWAN', 'F16 → TAIWAN');
ok(GST.ORG.country('F10A')==='SINGAPORE', 'F10A → SINGAPORE');
ok(GST.ORG.country('청주')==='KOREA', '청주 → KOREA');
/* region 과 country 는 «같은 국내 어휘»를 봐야 한다 (v99).
   예전에는 region 만 ^SK·화성·평택·기흥·탕정·천안을 알고 country 는 몰랐다. 그래서 같은 값이
   «구분=국내 · 국가=미상» 으로 갈렸고, 설치현황의 「설치 국가」 카드에서 SK·삼성 설비가
   통째로 국가 미상으로 떨어졌다. 한쪽만 고치면 다시 갈라지므로 여기서 대칭을 못 박는다. */
['SK Scrubber','PSEC','KSEC','화성','평택','기흥','탕정','천안','청주','이천','국내기타 SCRUBBER']
  .forEach(v=>ok(GST.ORG.region(v)==='국내' && GST.ORG.country(v)==='KOREA',
                 `region↔country 대칭: ${v}`));
// 「Country」 열의 법인명은 국가로 되돌아와야 한다 — 안 그러면 카드가 법인을 국가라고 말한다
ok(GST.ORG.country('GST HEFEI SCRUBBER')==='CHINA', 'GST HEFEI → CHINA (법인명이 아니라 국가)');
ok(GST.ORG.country('GST CHINA(XIAN) SCRUBBER')==='CHINA', 'GST XIAN → CHINA');
ok(GST.ORG.country('GST AMERICA SCRUBBER')==='USA', 'GST AMERICA → USA');
// 공유 정규식에 /g 가 붙으면 test() 가 lastIndex 를 들고 다녀 한 번 걸러 false 를 낸다
ok(GST.ORG.country('SK Scrubber')===GST.ORG.country('SK Scrubber'),
   '같은 값을 두 번 물어도 같은 답 (공유 정규식에 /g 가 붙으면 깨진다)');
// 설치현황 페이지도 버전을 선언해야 한다 — 옛 core.js 면 국가가 조용히 미상이 된다
ok(/GST\.needVer\s*&&\s*GST\.needVer\(/.test(fs.readFileSync(ROOT+'/scrubber/index.html','utf8')),
   'scrubber 페이지가 needVer 를 부르지 않는다');
// 인원 다수결: 중문명·Dept 가 있으면 해외, 없고 사번이 20xx 면 국내
ok(GST.ORG.emp({cn:'',dept:'',id:'20240101',wp:'P1'})==='국내', '국내 인원 판정');
ok(GST.ORG.emp({cn:'王',dept:'CS',id:'1120001',wp:'F16'})==='해외', '대만 인원 판정');

/* [6] core.js 버전 가드 — 구버전이 «조용한 0» 이 아니라 배너로 드러나는지 */
console.log('[6] core.js 버전 가드');
ok(typeof GST.VER==='number' && GST.VER>=89, 'GST.VER 가 없거나 낮다: '+GST.VER);
ok(typeof GST.needVer==='function', 'GST.needVer 가 없다');
ok(GST.needVer(GST.VER)===true, '같은 버전은 통과해야 한다');
ok(GST.needVer(GST.VER+1)===false, '더 높은 요구 버전은 실패로 알려야 한다');
[['report','report/index.html'],['hr','hr/index.html']].forEach(([n,f])=>
  ok(/GST\.needVer\s*&&\s*GST\.needVer\(/.test(fs.readFileSync(ROOT+'/'+f,'utf8')),
     n+' 페이지가 needVer 를 부르지 않는다'));

/* [7] CP949 CSV — 엑셀의 「CSV (쉼표로 분리)」는 UTF-8 이 아니다.
   UTF-8 로 읽으면 한글 머리글이 전부 U+FFFD 가 되고, 화면에는 «헤더 행 자체를 찾지 못함»
   이라고만 떠서 «열 이름이 틀렸나»를 의심하게 된다. 업로드가 스스로 되읽어야 한다. */
console.log('[7] CP949 CSV 자동 인식');
{
  const cp949 = Buffer.from([0xbd,0xc7,0xc0,0xfb,0xc4,0xda,0xb5,0xe5,0x2c,   // '실적코드,'
                             0xc0,0xdb,0xbe,0xf7,0xb4,0xdc,0xb0,0xe8]);      // '작업단계'
  const asUtf = new TextDecoder('utf-8').decode(cp949);
  ok(asUtf.indexOf('�')>=0, 'CP949 를 UTF-8 로 읽으면 깨져야 한다(전제)');
  let asKr=''; try{ asKr=new TextDecoder('euc-kr').decode(cp949); }catch(e){}
  ok(asKr==='실적코드,작업단계', 'euc-kr 로 되읽으면 머리글이 살아나야 한다: "'+asKr+'"');
  // 되읽은 머리글이 실제로 수선실적 헤더로 인식되는지 — 되살리기만 하고 못 쓰면 소용없다
  ok(GST.SM.headerRow([asKr.split(',')], GST.SM.SPEC.wk.hints, GST.SM.SPEC.wk.scan)===0,
     '되읽은 머리글이 헤더행으로 안 잡힌다');
  const UP = fs.readFileSync(ROOT+'/upload/index.html','utf8');
  ok(/arrayBuffer\(\)/.test(UP) && /TextDecoder\('euc-kr'\)|'euc-kr'/.test(UP),
     '업로드 화면에 CP949 되읽기가 없다 — 엑셀 저장 CSV 가 통째로 막힌다');
  ok(/function peek\(/.test(UP), '헤더 못 찾았을 때 파일 내용을 보여주는 peek 가 없다');
}

/* [8] dbRows 페이지네이션 — 25만 행에서 조용히 잘리지 않는지.
   PostgREST 의 max-rows 는 프로젝트 설정이라 «5,000 달라고 했는데 1,000만 오는» 것이 기본이다.
   예전 코드는 루프 상한이 200회라 1,000×200 = 200,000행에서 끊겼고, 25만 행을 올리자
   MIRROR_SHORT 200000/257606 으로 화면이 통째로 막혔다. 실제로 돌려서 확인한다. */
console.log('[8] dbRows 페이지네이션 (서버 한 페이지 1,000행 가정)');
{
  const SRC = fs.readFileSync(ROOT+'/assets/core.js','utf8');
  ok(!/for\s*\(\s*let\s+guard\s*=\s*0\s*;\s*guard\s*<\s*200\s*;/.test(SRC),
     '200회 루프 상한이 되살아났다 — 20만 행에서 잘린다');

  // dbRows 를 실제로 돌린다. 서버는 한 번에 1,000행만 준다고 가정한 가짜 클라이언트.
  const WANT = 257606, PAGE = 1000;
  let calls = 0;
  const rowOf = i => { const o = { src_row: i }; return o; };
  GST.db = async () => ({
    from(t){
      const q = {
        _t: t, _from: 0, _to: 0,
        select(){ return q; }, order(){ return q; },
        eq(){ return q; },
        maybeSingle: async () => ({ data:{ rows: WANT, err:null, ms:-1,
                                           synced_at:new Date().toISOString() }, error:null }),
        range(a,b){ q._from=a; q._to=b; return q; },
        then(res){                              // await 되는 순간 응답을 만든다
          calls++;
          const n = Math.min(PAGE, q._to-q._from+1, Math.max(0, WANT-q._from));
          const data = new Array(n);
          for(let i=0;i<n;i++) data[i]=rowOf(q._from+i);
          res({ data, error:null });
        }
      };
      return q;
    }
  });
  try{
    const rows = await GST.dbRows('wk');
    ok(rows.length === WANT+1, '헤더 1행 + 데이터 '+WANT+'행이어야 한다: '+rows.length);
    ok(calls < 400, '왕복이 너무 많다('+calls+'회) — 병렬 수신이 빠졌다');
    console.log('   '+WANT.toLocaleString()+'행 · 왕복 '+calls+'회 · 결과 '+(rows.length-1).toLocaleString()+'행');
  }catch(e){ ok(false, 'dbRows 실패: '+e.message); }
}

/* [9] 고객사 분류 — 사이드바 목록이 뒤죽박죽이던 원인.
   폴백이 «첫 단어»라, 고객사가 50개를 넘자 서로 다른 회사가 한 칸에 뭉치고
   일반명사가 고객사로 떴다. 합쳐지는 쪽이 갈라지는 쪽보다 나쁘다 — 필터가 거짓말을 한다. */
console.log('[9] 고객사 분류');
{
  const cu = s => GST.ORG.customer(s);
  // 법인격이 «앞»에 붙는 한국식 이름 — 예전에는 전부 '주식회사' 한 칸이 됐다
  ok(cu('주식회사 가나') === '가나', "'주식회사 가나' → 가나 : "+cu('주식회사 가나'));
  ok(cu('주식회사 가나') !== cu('주식회사 다라'), '서로 다른 회사가 한 칸에 뭉치면 안 된다');
  ok(cu('(주)마바') === '마바', "'(주)마바' → 마바 : "+cu('(주)마바'));
  // 법인격이 «뒤»에 붙는 영문 이름
  ok(cu('Sample Tech Co., Ltd.') === 'SAMPLE TECH', "뒤 법인격 제거 : "+cu('Sample Tech Co., Ltd.'));
  ok(cu('Sample Systems INC') === 'SAMPLE SYSTEMS', "INC 제거 : "+cu('Sample Systems INC'));
  // 첫 단어가 일반명사여도 뭉개지 않는다
  ok(cu('Global Widgets') === 'GLOBAL WIDGETS', "일반명사 머리 : "+cu('Global Widgets'));
  ok(cu('Semiconductor Alpha Solutions') !== 'SEMICONDUCTOR', '일반명사 한 칸으로 뭉침');
  // 한글·영문 두 이름으로 들어오는 회사는 하나로 (안 합치면 필터가 절반만 잡는다)
  ok(cu('삼성전자(주)') === 'SAMSUNG' && cu('SAMSUNG (CHINA) SEMICONDUCTOR CO.,L') === 'SAMSUNG',
     '삼성 한글·영문 통합: '+cu('삼성전자(주)')+' / '+cu('SAMSUNG (CHINA) SEMICONDUCTOR CO.,L'));
  ok(cu('에스케이하이닉스 (주)') === 'SK HYNIX' && cu('SK Hynix Semiconductor(China)Ltd.') === 'SK HYNIX',
     '하이닉스 통합');
  // 디스플레이는 별개 법인 — 삼성 규칙보다 먼저 봐야 한다
  ok(cu('삼성디스플레이(주)') === 'SAMSUNG DISPLAY', '삼성디스플레이가 SAMSUNG 으로 흡수됨');
  // 대만 4개사는 예전과 같아야 한다(무변경 증명)
  ok(cu('Micron Memory Taiwan Co., Ltd.(F16)') === 'MICRON', 'MICRON 무변경');
  ok(cu('Powerchip Semiconductor Manufacturing') === 'PSMC', 'PSMC 무변경');
  ok(cu('WINBOND(GX)') === 'WINBOND', 'WINBOND 무변경');
  ok(cu('Taiwan-Asia Semiconductor') === 'TASC', 'TASC 무변경');
  /* 브랜드가 도시·법인별로 갈라져 오는 것들 — Customer 축은 브랜드, 도시는 Location 이다.
     합치는 것은 «명시 규칙»으로만 한다. 도시 이름을 자동으로 잘라 합치면
     브랜드가 도시명인 회사(예: 아래 SEUL)를 지워버린다. */
  ok(cu('Changxin Memory Technologies , Inc(') === 'CHANGXIN'
     && cu('Changxin Jidian (Beijing) Memory Te') === 'CHANGXIN'
     && cu('Changxin XinQiao Memory Technologie') === 'CHANGXIN', 'CHANGXIN 3종이 안 합쳐진다');
  ok(cu('Xiamen Tianma Diaplay Technology Co') === 'TIANMA'
     && cu('WUHAN TIANMA MICRO ELECTRONICS') === 'TIANMA'
     && cu('SHANGHAI TIANMA Micro Electronics') === 'TIANMA', 'TIANMA 3종이 안 합쳐진다');
  ok(cu('CSOT') === 'CSOT' && cu('Suzhou CSOT') === 'CSOT', 'CSOT 2종이 안 합쳐진다');
  // 도시 자동 제거를 넣으면 이게 깨진다 — 브랜드 자체가 도시명처럼 생긴 회사
  ok(cu('SEUL PTE. LTD.') === 'SEUL', '도시로 오인해 브랜드를 지웠다: '+cu('SEUL PTE. LTD.'));
  ok(cu('Hangzhou HFC Semiconductor Corp.') === 'HANGZHOU HFC SEMICONDUCTOR',
     '규칙에 없는 고객사는 이름 전체를 그대로 둔다: '+cu('Hangzhou HFC Semiconductor Corp.'));
  // 자사 법인은 고객사가 아니다 — 고르면 «전부 0» 이 되는 값이 목록에 있으면 안 된다
  ok(cu('GST CHINA Co., LTD') === '', "자사 법인이 고객사로 뜬다: "+cu('GST CHINA Co., LTD'));
  ok(cu('GST Taiwan') === '', '자사 법인이 고객사로 뜬다');
  ok(cu('') === '' && cu('   ') === '', '빈 값은 빈 값');
  // 챗봇도 같은 답을 내야 한다(제2원칙) — 소스에 같은 규약이 들어갔는지
  const HR = fs.readFileSync(ROOT+'/supabase/functions/kakao-bot/hr.js','utf8');
  ok(/삼성디스플레이/.test(HR) && /주식회사\|유한회사/.test(HR),
     'kakao-bot/hr.js 의 normCust 가 core.js 와 갈라졌다');
}

console.log('\n'+(fail?'❌':'✅')+' t-region '+pass+'/'+(pass+fail));
process.exit(fail?1:0);
