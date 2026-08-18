/* QBR 양식 PPT 내보내기 — 양식(.pptx)을 그대로 열어 차트 캐시·표 셀·주차 텍스트만 교체한다.
   마스터·배경·서식·차트 스타일은 원본 바이트 그대로 유지되므로 양식과 완전히 동일한 파일이 나온다.
   순수 함수 모듈: 브라우저(window.QBRPPT)와 node(module.exports) 양쪽에서 동작 — 회귀 테스트용. */
(function(root){
'use strict';
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const unesc=s=>String(s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');

// ---- 차트 캐시 패치 ---------------------------------------------------------
// pts: null/undefined 값은 빈 포인트로 건너뛴다(캐시에 미기재)
function buildPts(vals){
  let out='<c:ptCount val="'+vals.length+'"/>';
  vals.forEach((v,i)=>{ if(v==null||v==='')return;
    out+='<c:pt idx="'+i+'"><c:v>'+esc(v)+'</c:v></c:pt>'; });
  return out;
}
// cache 블록(numCache|strCache) 내부의 ptCount+pt들만 교체 — formatCode 등은 보존
function swapCache(cacheXml,vals){
  const inner=buildPts(vals);
  return cacheXml.replace(/<c:ptCount[^>]*\/>[\s\S]*?(?=<\/c:(num|str)Cache>)/,inner)
                 .replace(/(<c:(num|str)Cache>)(?![\s\S]*<c:ptCount)/,'$1'+inner); // ptCount가 없던 경우
}
// <c:cat>/<c:val> 블록에서 첫 캐시를 찾아 교체
function swapIn(block,vals){
  const m=block.match(/<c:(num|str)Cache>[\s\S]*?<\/c:\1Cache>/);
  if(!m)return block;
  return block.replace(m[0],swapCache(m[0],vals));
}
// <c:cat> 내부를 문자열 참조(strRef)로 통째 교체 — 주간 W## 라벨을 날짜축 차트에 넣을 때
function catToStr(catBlock,cats){
  const f=(catBlock.match(/<c:f>([\s\S]*?)<\/c:f>/)||[])[1]||'';
  return '<c:cat><c:strRef><c:f>'+f+'</c:f><c:strCache>'+buildPts(cats)+'</c:strCache></c:strRef></c:cat>';
}
// 날짜축(dateAx) → 카테고리축(catAx): 태그 개명 + 날짜 전용 자식 제거 (strCache 카테고리와 함께 사용)
function dateAxToCatAx(chartXml){
  return chartXml.replace(/<c:dateAx>([\s\S]*?)<\/c:dateAx>/g,(m,inner)=>{
    inner=inner.replace(/<c:(baseTimeUnit|majorTimeUnit|minorTimeUnit|majorUnit|minorUnit)[^>]*\/>/g,'');
    return '<c:catAx>'+inner+'</c:catAx>';
  });
}
// 축 고정 해제 — 양식에 박제된 min/max가 새 데이터 범위를 자르지 않도록 자동 스케일로
function autoAxes(chartXml){
  return chartXml.replace(/<c:(catAx|valAx|dateAx)>[\s\S]*?<\/c:\1>/g,ax=>
    ax.replace(/<c:max val="[^"]*"\/>/g,'').replace(/<c:min val="[^"]*"\/>/g,''));
}
/* chartXml 패치: cats = 카테고리 배열, series = {시리즈명: 값배열}, opts={rename:{구명:새명}, catAsStr:true}
   - 각 <c:ser>의 <c:tx>…<c:v>이름</c:v>으로 시리즈를 식별해 해당 값만 교체
   - cat 캐시 타입(num/str)은 양식 것을 따르고, catAsStr이면 strRef로 강제 전환(축도 catAx로) */
function patchChart(chartXml,cats,series,opts){
  opts=opts||{};
  let out=chartXml.replace(/<c:ser>[\s\S]*?<\/c:ser>/g,ser=>{
    const nm=ser.match(/<c:tx>[\s\S]*?<c:v>([\s\S]*?)<\/c:v>/);
    const name=nm?unesc(nm[1]).trim():'';
    const vals=series[name];
    if(!vals)return ser;                                  // 매핑 없는 시리즈는 그대로
    let s2=ser;
    const cat=s2.match(/<c:cat>[\s\S]*?<\/c:cat>/);
    if(cat&&cats)s2=s2.replace(cat[0],opts.catAsStr?catToStr(cat[0],cats):swapIn(cat[0],cats));
    const val=s2.match(/<c:val>[\s\S]*?<\/c:val>/);
    if(val)s2=s2.replace(val[0],swapIn(val[0],vals));
    if(opts.rename&&opts.rename[name])
      s2=s2.replace(/(<c:tx>[\s\S]*?<c:v>)[\s\S]*?(<\/c:v>)/,'$1'+esc(opts.rename[name])+'$2');
    return s2;
  });
  if(opts.catAsStr)out=dateAxToCatAx(out);
  return autoAxes(out);
}
// 라벨 기준 표 행 숫자 치환 — 행의 첫 텍스트(라벨)는 두고 이후 텍스트만 순서대로 교체 (병합/속성 무관)
function setRowNums(slideXml,signature,rows){
  const tbls=slideXml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g)||[];
  const target=tbls.find(tb=>tb.indexOf(signature)>=0);
  if(!target)return slideXml;
  let out=target;
  Object.keys(rows).forEach(lbl=>{
    const trs=out.match(/<a:tr[\s\S]*?<\/a:tr>/g)||[];
    const tr=trs.find(r=>r.indexOf(lbl)>=0); if(!tr)return;
    const vals=rows[lbl]; let k=-1;
    const ntr=tr.replace(/<a:t>[\s\S]*?<\/a:t>/g,m=>{k++;
      if(k===0)return m;                       // 행 라벨 유지
      const v=vals[k-1]; return v==null?m:'<a:t>'+esc(v)+'</a:t>';});
    out=out.replace(tr,ntr);
  });
  return slideXml.replace(target,out);
}
/* 입사·퇴사(라인별) 다이버징 스택 재구성 — 양식 chart2용:
   기존 막대 시리즈 1개를 원형(proto)으로 사이트별 시리즈 N개를 생성하고, 꺾은선(TO)은 제거.
   sers=[{name,color(6자리 hex),values(퇴사는 음수, 0은 null)}] */
function rebuildIo(chartXml,cats,sers){
  let out=chartXml.replace(/<c:lineChart>[\s\S]*?<\/c:lineChart>/,'');   // 축은 barChart와 공유 — 제거 안전
  const barM=out.match(/<c:barChart>[\s\S]*?<\/c:barChart>/);
  if(!barM)return out;
  const bar=barM[0];
  const protoM=bar.match(/<c:ser>[\s\S]*?<\/c:ser>/);
  if(!protoM)return out;
  const proto=protoM[0];
  const mk=(s,i)=>{
    let x=proto
      .replace(/<c:idx val="\d+"\/>/,'<c:idx val="'+i+'"/>')
      .replace(/<c:order val="\d+"\/>/,'<c:order val="'+i+'"/>')
      .replace(/(<c:tx>[\s\S]*?<c:v>)[\s\S]*?(<\/c:v>)/,'$1'+esc(s.name)+'$2');
    const fill='<c:spPr><a:solidFill><a:srgbClr val="'+s.color+'"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>';
    if(/<c:ser>[\s\S]*?<c:spPr>/.test(x)&&x.indexOf('<c:spPr>')<x.indexOf('<c:cat>'))
      x=x.replace(/<c:spPr>[\s\S]*?<\/c:spPr>/,fill);
    else x=x.replace(/<\/c:tx>/,'</c:tx>'+fill);
    const cat=x.match(/<c:cat>[\s\S]*?<\/c:cat>/);
    if(cat)x=x.replace(cat[0],catToStr(cat[0],cats));
    const val=x.match(/<c:val>[\s\S]*?<\/c:val>/);
    if(val)x=x.replace(val[0],swapIn(val[0],s.values));
    return x;
  };
  const newBar=bar.replace(proto,sers.map(mk).join(''));
  out=out.replace(bar,newBar);
  return autoAxes(dateAxToCatAx(out));
}

// ---- 표 셀 패치 -------------------------------------------------------------
// 슬라이드 XML에서 signature 문자열을 포함한 <a:tbl>을 찾아 [행][열] 첫 텍스트런을 교체.
// edits: [{r,c,v}] (r,c는 0-기준 · 표 서식/병합/스타일은 그대로)
function patchTable(slideXml,signature,edits){
  const tbls=slideXml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g)||[];
  const target=tbls.find(tb=>tb.indexOf(signature)>=0);
  if(!target)return slideXml;
  const rows=target.match(/<a:tr[\s\S]*?<\/a:tr>/g)||[];
  let out=target;
  edits.forEach(e=>{
    const row=rows[e.r]; if(!row)return;
    const cells=row.match(/<a:tc[ >][\s\S]*?<\/a:tc>/g)||[];
    const cell=cells[e.c]; if(!cell)return;
    let newCell, replaced=false;
    if(/<a:t>[\s\S]*?<\/a:t>/.test(cell)){
      let first=true;
      newCell=cell.replace(/<a:t>[\s\S]*?<\/a:t>/g,mm=>{ // 첫 런에 값, 나머지 런은 비움(서식 유지)
        if(first){first=false;return '<a:t>'+esc(e.v)+'</a:t>';}
        return '<a:t></a:t>';});
      replaced=true;
    }else{ // 빈 셀: 단락에 런 삽입 (엔드태그 직전)
      newCell=cell.replace(/(<a:p>)([\s\S]*?)(<\/a:p>)/,(mm,a,b,c)=>a+b+'<a:r><a:t>'+esc(e.v)+'</a:t></a:r>'+c);
      replaced=newCell!==cell;
    }
    if(replaced){
      const newRow=row.replace(cell,newCell);
      out=out.replace(row,newRow);
      rows[e.r]=newRow;
    }
  });
  return slideXml.replace(target,out);
}

// ---- 텍스트 치환 (주차 라벨 등) ---------------------------------------------
function patchText(slideXml,re,repl){ return slideXml.replace(re,repl); }

/* 교육 표 머리 행의 2·3번째 칸 글자를 갈아끼운다. 이름으로 찾지 않고 «머리 행의 자리»로
   잡는다 — 양식의 'Basic' 은 서식 때문에 여러 런으로 갈라져 있어 문자열 검색이 못 미친다. */
function setEduHead(slideXml, heads){
  const tbls=slideXml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g)||[];
  const target=tbls.find(tb=>tb.indexOf('교육과정')>=0);
  if(!target) return slideXml;
  const trs=target.match(/<a:tr[\s\S]*?<\/a:tr>/g)||[];
  if(!trs.length) return slideXml;
  const edits=[];
  for(let c=1;c<=2;c++) if(heads[c-1]) edits.push({r:0,c:c,v:String(heads[c-1])});
  return edits.length ? patchTable(slideXml,'교육과정',edits) : slideXml;
}

/* 오른쪽 위 «법인» 상자. 양식에는 'GST TAIWAN' 이 세 장 모두에 박제돼 있었다 —
   어느 법인을 골라 보고 있든 PPT 는 대만이라고 말했다(사용자가 화면 캡처로 짚은 자리).
   값은 GST.corpLabel(운영단위를 따라간다). data.corp 가 없으면 양식 그대로 둔다 —
   옛 호출부가 이 파일만 새로 배포됐을 때 «빈 상자»가 되지 않게. */
function patchCorp(xml,corp){
  if(!corp) return xml;
  return xml.replace(/<a:t>GST TAIWAN<\/a:t>/g,'<a:t>'+esc(corp)+'</a:t>');
}

/* ---- 메인: build(JSZipRef, tplBuf, data) -> Promise<Blob|Buffer> ------------
data = {
 week:'W31',
 corp:'GST TAIWAN',                                                   // 오른쪽 위 법인 상자 (운영단위 필터를 따라간다)
 charts:{ 'chart1':{cats:[...],series:{...}}, ... 'chart8':{...} },
 eduTable:{h:['Basic (Level 1)','Veteran (Level 2)'], b:{...}, v:{...}},  // 교육과정 표 (h = 머리글 — 잡힌 인원을 따라간다)
 opRows:[[구분, 가동TOT,WI,WO, 챔버TOT,WI,WO, 미가동대,미가동ch, 주재원,현채인, PM], ...],
 top3:[[no,원인,건수,현상,조치] x3],
 notes:[]                                                            // build 가 «못 채운 것»을 여기에 적는다
} */
function build(JSZipRef,tplBuf,data){
  return JSZipRef.loadAsync(tplBuf).then(zip=>{
    const jobs=[];
    // 0) 이미지 교체 (예: 슬라이드1 '인력 현황' 그림 = 입사·퇴사 차트 렌더) — base64 문자열
    if(data.images)Object.keys(data.images).forEach(p=>zip.file(p,data.images[p],{base64:true}));
    // 1) 차트 8개
    Object.keys(data.charts||{}).forEach(cn=>{
      const path='ppt/charts/'+cn+'.xml';
      const f=zip.file(path); if(!f)return;
      jobs.push(f.async('string').then(xml=>{
        const d=data.charts[cn];
        zip.file(path,d.io?rebuildIo(xml,d.cats,d.io):patchChart(xml,d.cats,d.series,{rename:d.rename,catAsStr:d.catAsStr}));
      }));
    });
    // 2) 슬라이드 표·텍스트
    jobs.push(zip.file('ppt/slides/slide1.xml').async('string').then(xml=>{
      xml=patchCorp(xml,data.corp);
      if(data.eduTable){ const e=data.eduTable;
        /* 머리글은 «잡힌 인원»을 따라간다(v96 규약). 국내에는 법인 교육과정이 없어
           숫자는 Scrubber Lv.2·Lv.3 인데, 양식에는 'Basic (Level 1)'·'Veteran (Level 2)'
           가 박혀 있었다 — 화면 표는 이미 Lv.2/Lv.3 로 바뀌는데 PPT 만 안 바뀌어
           둘이 서로 다른 말을 했고, 받아 본 사람은 국내에 법인 과정이 있는 줄 안다. */
        if(e.h && e.h.length>=2) xml=setEduHead(xml, e.h);
        xml=setRowNums(xml,'교육과정',{
          '미이수':[e.b.no,e.v.no],'진행중':[e.b.ing,e.v.ing],
          '이수완료':[e.b.done,e.v.done],'완료율':[e.b.rate,e.v.rate]});
      }
      zip.file('ppt/slides/slide1.xml',xml);
    }));
    jobs.push(zip.file('ppt/slides/slide2.xml').async('string').then(xml=>{
      xml=patchCorp(xml,data.corp);
      if(data.opRows){
        /* ⚠ 예전에는 «양식 행 라벨 ↔ 대시보드 행 라벨»을 대만 전용 정규식 사슬로 맞췄다
           (Micron F16 · Tong luo · PSMC …). 그런데 대시보드의 행 축은 법인(운영단위) 또는
           고객사라 어느 모드에서도 안 맞았고, **못 맞춘 행은 양식에 박힌 대만 표본 숫자가
           그대로 남았다.** 법인 상자에는 'SEC' 라고 적히므로 받아 본 사람은 삼성 실적이
           961대라고 읽는다. TOTAL 만 갱신되니 합계와 위 행들의 합도 안 맞는다.
           → 이름을 맞추려 들지 않는다. **화면 표의 순서 그대로** 양식 행에 채우고
             라벨까지 갈아끼운다(PPT 가 화면과 같은 말을 한다). 남는 양식 행은 비운다 —
             옛 숫자를 내보내느니 빈 칸이 낫다. 넘치는 행수는 notes 로 알린다. */
        const isTot=v=>/TOTAL|합계/i.test(String(v||'').replace(/\s+/g,''));
        const body=data.opRows.filter(r=>!isTot(r[0]));
        const tot =data.opRows.find(r=>isTot(r[0]));
        const rows=xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g)||[];
        const tb=rows.find(tb0=>tb0.indexOf('가동 장비 대수')>=0);
        if(tb){
          const trs=tb.match(/<a:tr[\s\S]*?<\/a:tr>/g)||[];
          const cols=((trs[2]||'').match(/<a:tc[ >]/g)||[]).length||12;
          let totIdx=-1;
          for(let r=2;r<trs.length;r++){
            const lbl=unesc((trs[r].match(/<a:t>([\s\S]*?)<\/a:t>/)||[])[1]||'');
            if(isTot(lbl)) totIdx=r;
          }
          const slots=[];
          for(let r=2;r<trs.length;r++) if(r!==totIdx) slots.push(r);
          const edits=[];
          const put=(r,src)=>{ for(let c=0;c<cols;c++) edits.push({r:r,c:c,v:src[c]==null?'':String(src[c])}); };
          const blank=r=>{ for(let c=0;c<cols;c++) edits.push({r:r,c:c,v:''}); };
          slots.forEach((r,i)=>{ if(i<body.length) put(r,body[i]); else blank(r); });
          if(totIdx>=0){ if(tot) put(totIdx,tot); else blank(totIdx); }
          if(body.length>slots.length && data.notes)
            data.notes.push('가동현황 표: 양식 행이 '+slots.length+'개뿐이라 '+(body.length-slots.length)+'개 행이 빠졌습니다');
          xml=patchTable(xml,'가동 장비 대수',edits);
        }
      }
      zip.file('ppt/slides/slide2.xml',xml);
    }));
    jobs.push(zip.file('ppt/slides/slide3.xml').async('string').then(xml=>{
      xml=patchCorp(xml,data.corp);
      if(data.week)xml=patchText(xml,/TOP\s*3\s*\(W\d+\)/,'TOP 3 ('+data.week+')');
      // 슬롯 제목: 'Alarm & All By Pass'로 통일 — (Micron)/(Micron 外) 꼬리 제거 (단위는 기존 [월/단위]·[주/단위] 라벨)
      xml=xml.replace('By Pass(Micron)','By Pass');
      { const i=xml.indexOf('<a:t>外</a:t>');
        if(i>=0){ const head=xml.slice(0,i);
          const tail=xml.slice(i).replace('<a:t>外</a:t>','<a:t></a:t>').replace('<a:t>)</a:t>','<a:t></a:t>');
          xml=head+tail; } }
      xml=xml.replace('By Pass(Micron ','By Pass');
      if(data.top3&&data.top3.length){
        const edits=[];
        data.top3.slice(0,3).forEach((row,i)=>{
          row.forEach((v,c)=>edits.push({r:i+1,c,v})); });
        xml=patchTable(xml,'주요 현상',edits);
      }
      zip.file('ppt/slides/slide3.xml',xml);
    }));
    return Promise.all(jobs).then(()=>{
      const isNode=typeof window==='undefined';
      return zip.generateAsync({type:isNode?'nodebuffer':'blob',
        mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        compression:'DEFLATE'});
    });
  });
}

// Excel 날짜 시리얼 (1899-12-30 기준) — 월말 카테고리용
function excelSerial(d){ return Math.round((d.getTime()-Date.UTC(1899,11,30))/86400000); }

const API={build,patchChart,patchTable,excelSerial};
if(typeof module!=='undefined'&&module.exports)module.exports=API;
else root.QBRPPT=API;
})(typeof window!=='undefined'?window:globalThis);
