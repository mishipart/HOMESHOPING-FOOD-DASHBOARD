(() => {
  "use strict";

  const CFG = window.HSFM_CONFIG || {};
  const API = String(CFG.adminApiBase || "").replace(/\/$/, "");

  const state = {
    rows: [],
    masterPublic: [],
    pending: [],
    adminMaster: null,
    historyContext: null,
    adminPassword: sessionStorage.getItem("hsfm_admin_password") || "",
    activeTab: "calendar",
    view: "month",
    cursor: new Date(),
    reviewFilter: "pending",
    interests: new Set(JSON.parse(localStorage.getItem("hsfm_interests") || "[]")),
    watchKeywords: JSON.parse(localStorage.getItem("hsfm_watch_keywords") || "[]")
  };

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = v => String(v ?? "").trim();
  const num = v => {
    const n = Number(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const money = v => `${Math.round(num(v) / 10000).toLocaleString("ko-KR")}만원`;
  const cnt = v => Math.round(num(v)).toLocaleString("ko-KR");
  const pad = n => String(n).padStart(2, "0");
  const keyDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parseDate = s => {
    if (!s) return new Date();
    const [y,m,d] = String(s).slice(0,10).split("-").map(Number);
    return new Date(y, (m||1)-1, d||1);
  };
  const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
  const startOfWeek = d => addDays(d, -d.getDay());
  const startOfMonth = d => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = d => new Date(d.getFullYear(), d.getMonth()+1, 0);
  const today = () => new Date();
  const yesterday = () => addDays(today(), -1);

  function normalize(v){
    return clean(v).toLowerCase()
      .replace(/\[[^\]]*\]|\([^)]*\)/g," ")
      .replace(/[^\p{L}\p{N}]+/gu," ")
      .replace(/\s+/g," ").trim();
  }

  function getProductName(r){
    return clean(r.standard_product_name || r.normalized_title || r.raw_title || "미분류");
  }
  function getRawTitle(r){ return clean(r.raw_title || r.normalized_title || r.standard_product_name || ""); }
  function getPlatform(r){ return clean(r.platform_name || r.platform || r.channel || "미확인"); }
  function getDate(r){ return clean(r.broadcast_date || r.start_datetime || "").slice(0,10); }
  function getHour(r){
    const s = clean(r.start_datetime);
    const m = s.match(/T(\d{2}):/);
    if (m) return Number(m[1]);
    const t = s.match(/(\d{1,2}):(\d{2})/);
    return t ? Number(t[1]) : 0;
  }
  function getTime(r){
    const s = clean(r.start_datetime);
    const m = s.match(/T(\d{2}:\d{2})/);
    return m ? m[1] : (s.match(/(\d{1,2}:\d{2})/)?.[1] || "");
  }
  function sales(r){ return num(r.sales_amt); }
  function salesCount(r){ return num(r.sales_cnt); }
  function performanceOk(r){ return sales(r) > 0 || salesCount(r) > 0 || /confirmed|success|paid|final|validated/i.test(clean(r.performance_status)); }
  function isExcludedRow(r){
    const st = clean(r.review_status).toLowerCase();
    const en = clean(r.enabled).toUpperCase();
    return ["exclude","excluded","제외","비식품","모니터링 제외"].includes(st) || (en === "N" && !/pending|review|확인/.test(st));
  }
  function interestKey(r){ return normalize(getProductName(r)); }
  function isWatched(r){
    const name = normalize(`${getProductName(r)} ${getRawTitle(r)}`);
    return state.interests.has(interestKey(r)) || state.watchKeywords.some(k => name.includes(normalize(k)));
  }

  function parseCSV(text){
    const out=[]; let row=[], field="", q=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(q){
        if(c === '"' && text[i+1] === '"'){ field+='"'; i++; }
        else if(c === '"') q=false;
        else field+=c;
      }else{
        if(c === '"') q=true;
        else if(c === ","){ row.push(field); field=""; }
        else if(c === "\n"){ row.push(field.replace(/\r$/,"")); out.push(row); row=[]; field=""; }
        else field+=c;
      }
    }
    if(field.length||row.length){ row.push(field.replace(/\r$/,"")); out.push(row); }
    if(!out.length) return [];
    const h=out[0].map(x=>clean(x).replace(/^\uFEFF/,""));
    return out.slice(1).filter(r=>r.some(clean)).map(r=>Object.fromEntries(h.map((x,i)=>[x,r[i]??""])));
  }

  async function fetchText(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(`${url} ${r.status}`); return r.text(); }
  async function fetchJsonSafe(url){ try{ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) return null; return r.json(); }catch{return null;} }

  function showStatus(message, type="ok"){
    const el=$("#statusBar"); el.textContent=message; el.className=`status ${type}`;
    setTimeout(()=>el.classList.add("hidden"),5000);
  }

  function saveWatch(){
    localStorage.setItem("hsfm_interests", JSON.stringify([...state.interests]));
    localStorage.setItem("hsfm_watch_keywords", JSON.stringify(state.watchKeywords));
  }

  function findMasterForRow(r){
    const raw=normalize(getRawTitle(r));
    const candidates = state.adminMaster?.rows || state.masterPublic;
    if(!raw || !candidates) return null;
    return candidates.find(m=>{
      const k=normalize(m.match_keyword || m.raw_title || m.normalized_title || "");
      return k && (raw===k || raw.includes(k) || k.includes(raw));
    }) || null;
  }

  function occurrenceRuleForRow(r){
    const rules = state.adminMaster?.occurrence_rules || [];
    const id = clean(r.hsshow_id);
    return id ? rules.find(x => clean(x.hsshow_id) === id) : null;
  }

  function dynamicRuleForRow(r){
    const rules = state.adminMaster?.dynamic_rules || [];
    const raw = normalize(getRawTitle(r));
    const platform = normalize(getPlatform(r));
    return rules.find(x => {
      const p = normalize(x.pattern || "");
      const ch = normalize(x.platform || "");
      return p && raw.includes(p) && (!ch || ch === platform);
    }) || null;
  }

  function overlayRow(r){
    // Priority 1: one specific broadcast occurrence
    const o = occurrenceRuleForRow(r);
    if(o){
      return {
        ...r,
        standard_product_name: o.standard_product_name || r.standard_product_name,
        brand: o.brand || r.brand,
        product_group: o.product_group || r.product_group,
        main_ingredient: o.main_ingredient || r.main_ingredient,
        review_status: o.review_status || "confirmed",
        enabled: o.enabled || "Y",
        occurrence_override: "Y"
      };
    }

    // A variable title must not inherit a global title mapping.
    if(dynamicRuleForRow(r)){
      return {...r, dynamic_title: "Y"};
    }

    // Priority 2: admin/base master by title
    const m=findMasterForRow(r);
    if(!m) return {...r};
    return {
      ...r,
      standard_product_name: m.standard_product_name || r.standard_product_name,
      brand: m.brand || r.brand,
      product_group: m.product_group || r.product_group,
      main_ingredient: m.main_ingredient || r.main_ingredient,
      review_status: m.review_status || r.review_status,
      enabled: m.enabled || r.enabled
    };
  }

  function visibleRows(){
    return state.rows.map(overlayRow).filter(r=>!isExcludedRow(r));
  }

  function firstSeenMap(){
    const map=new Map();
    const rows=[...visibleRows()].sort((a,b)=>getDate(a).localeCompare(getDate(b)));
    for(const r of rows){
      const k=normalize(getProductName(r));
      if(k && !map.has(k)) map.set(k,getDate(r));
    }
    return map;
  }

  function metricsForRows(rows){
    const confirmed=rows.filter(performanceOk);
    const totalSales=confirmed.reduce((s,r)=>s+sales(r),0);
    return {
      broadcasts: rows.length,
      confirmed: confirmed.length,
      sales: totalSales,
      avg: confirmed.length ? totalSales/confirmed.length : 0,
      units: confirmed.reduce((s,r)=>s+salesCount(r),0)
    };
  }

  function hotThreshold(rows){
    const vals=rows.filter(performanceOk).map(sales).sort((a,b)=>a-b);
    if(vals.length<4) return Infinity;
    const p=Math.floor((vals.length-1)*.9);
    return Math.max(vals[p], 50000000);
  }
  function isHot(r, rows){ return performanceOk(r) && sales(r) >= hotThreshold(rows); }
  function isNew(r, firstMap){ return firstMap.get(normalize(getProductName(r))) === getDate(r); }

  function fillSelect(sel, values){
    const el=$(sel), cur=el.value;
    el.innerHTML=`<option value="">전체</option>`+[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko")).map(v=>`<option>${esc(v)}</option>`).join("");
    if([...el.options].some(o=>o.value===cur)) el.value=cur;
  }

  function renderGlobalKpis(){
    const rows=visibleRows();
    const m=metricsForRows(rows);
    const pendingCount=getReviewItems("pending").length;
    const manual=rows.filter(r=>/manual/i.test(clean(r.performance_source))).length;
    $("#globalKpis").innerHTML=[
      ["전체 방송",`${cnt(m.broadcasts)}회`,"식품 방송"],
      ["확인된 매출",money(m.sales),"매출액 합계"],
      ["평균 매출",money(m.avg),"실적 보유 방송 기준"],
      ["상품 확인 필요",`${cnt(pendingCount)}건`,"상품 매칭 검토"],
      ["수동 실적 확인",`${cnt(manual)}건`,"자동수집 예외"]
    ].map(([a,b,c])=>`<div class="kpi"><div class="label">${a}</div><div class="value">${b}</div><div class="sub">${c}</div></div>`).join("");
  }

  function filteredCalendarRows(){
    const p=$("#calendarPlatform").value, q=normalize($("#calendarSearch").value);
    return visibleRows().filter(r=>{
      if(p && getPlatform(r)!==p) return false;
      if(q && !normalize(`${getProductName(r)} ${getRawTitle(r)}`).includes(q)) return false;
      if($("#calendarWatchOnly").checked && !isWatched(r)) return false;
      return true;
    });
  }

  function renderCalendar(){
    $$(".segmented [data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
    if(state.view==="month") renderMonth();
    else if(state.view==="week") renderWeek();
    else renderDay();
  }

  function renderMonth(){
    const d=state.cursor, first=startOfMonth(d), gridStart=startOfWeek(first), rows=filteredCalendarRows();
    const firstMap=firstSeenMap(), hotT=hotThreshold(rows);
    $("#periodLabel").textContent=`${d.getFullYear()}년 ${d.getMonth()+1}월`;
    $("#calendarTitle").textContent="월간 캘린더";
    let html=`<div class="month-board">${["일","월","화","수","목","금","토"].map(x=>`<div class="month-head">${x}</div>`).join("")}`;
    for(let i=0;i<42;i++){
      const day=addDays(gridStart,i), k=keyDate(day), same=day.getMonth()===d.getMonth(), dr=rows.filter(r=>getDate(r)===k);
      const m=metricsForRows(dr), hot=dr.filter(r=>performanceOk(r)&&sales(r)>=hotT), newc=dr.filter(r=>isNew(r,firstMap)).length;
      const future=day>today();
      const hotTip=hot.slice(0,5).map(r=>`${getTime(r)} ${getProductName(r)} ${money(sales(r))}`).join("\n");
      html+=`<div class="month-cell ${same?"":"other"} ${k===keyDate(today())?"today":""}" data-open-day="${k}">
        <div class="day-number">${day.getDate()}</div>
        ${hot.length?`<div class="month-hot"><span class="badge hot" title="${esc(hotTip)}">HOT ${hot.length}</span></div>`:""}
        ${dr.length?`<span class="summary-pill count">식품방송 ${dr.length}회</span>`:""}
        ${m.sales?`<span class="summary-pill sales">매출 ${money(m.sales)}</span>`:""}
        ${future&&dr.length?`<span class="summary-pill future">예정 ${dr.length}회</span>`:""}
        ${newc?`<span class="badge new">NEW ${newc}</span>`:""}
      </div>`;
    }
    html+="</div>";
    $("#calendarRoot").innerHTML=html;
    $$("[data-open-day]").forEach(el=>el.onclick=()=>{state.cursor=parseDate(el.dataset.openDay); state.view="day"; renderCalendar();});
  }

  function renderWeek(){
    const start=startOfWeek(state.cursor), days=Array.from({length:7},(_,i)=>addDays(start,i)), rows=filteredCalendarRows(), firstMap=firstSeenMap();
    $("#periodLabel").textContent=`${days[0].getMonth()+1}.${days[0].getDate()} – ${days[6].getMonth()+1}.${days[6].getDate()}`;
    $("#calendarTitle").textContent="주간 캘린더";
    let html=`<div class="week-board"><div class="week-cell week-head"></div>${days.map(d=>`<div class="week-cell week-head">${["일","월","화","수","목","금","토"][d.getDay()]}<br><span class="small">${d.getMonth()+1}/${d.getDate()}</span></div>`).join("")}`;
    for(let h=0;h<24;h++){
      html+=`<div class="week-cell week-hour">${pad(h)}:00</div>`;
      for(const d of days){
        const slot=rows.filter(r=>getDate(r)===keyDate(d)&&getHour(r)===h).sort((a,b)=>clean(a.start_datetime).localeCompare(clean(b.start_datetime)));
        html+=`<div class="week-cell"><div class="week-events">${slot.slice(0,3).map(r=>{
          const badges=`${isHot(r,rows)?'<span class="badge hot">HOT</span>':""}${isNew(r,firstMap)?'<span class="badge new">NEW</span>':""}`;
          return `<button class="event-chip" data-show-id="${esc(r.hsshow_id||"")}"><span class="event-title">${badges}${esc(getTime(r))} ${esc(getProductName(r))}</span><span class="event-meta">${esc(getPlatform(r))}${performanceOk(r)?` · ${money(sales(r))}`:""}</span></button>`;
        }).join("")}${slot.length>3?`<div class="more-chip">+ ${slot.length-3}개 더보기</div>`:""}</div></div>`;
      }
    }
    html+="</div>";
    $("#calendarRoot").innerHTML=html;
  }

  function renderDay(){
    const k=keyDate(state.cursor), rows=filteredCalendarRows().filter(r=>getDate(r)===k).sort((a,b)=>clean(a.start_datetime).localeCompare(clean(b.start_datetime))), firstMap=firstSeenMap();
    $("#periodLabel").textContent=`${state.cursor.getFullYear()}년 ${state.cursor.getMonth()+1}월 ${state.cursor.getDate()}일`;
    $("#calendarTitle").textContent="일간 캘린더";
    const m=metricsForRows(rows);
    $("#calendarRoot").innerHTML=`<div class="review-summary">
      <span class="summary-chip">방송 ${rows.length}회</span><span class="summary-chip">실적 확인 ${m.confirmed}회</span><span class="summary-chip">매출 ${money(m.sales)}</span><span class="summary-chip">관심상품 ${rows.filter(isWatched).length}건</span>
    </div><div class="day-table"><div class="day-row head"><span>관심</span><span>시간</span><span>홈쇼핑사</span><span>상품</span><span>판매량</span><span>매출</span></div>
      ${rows.map(r=>`<div class="day-row"><button class="star ${isWatched(r)?"on":""}" data-star="${esc(interestKey(r))}">★</button><b>${esc(getTime(r))}</b><span>${esc(getPlatform(r))}</span><span>${isHot(r,rows)?'<span class="badge hot">HOT</span>':""}${isNew(r,firstMap)?'<span class="badge new">NEW</span>':""}${esc(getProductName(r))}<div class="small">${esc(getRawTitle(r))}</div></span><span>${cnt(salesCount(r))}</span><span class="money">${performanceOk(r)?money(sales(r)):"-"}</span></div>`).join("")}
    </div>`;
    $$("[data-star]").forEach(b=>b.onclick=()=>{ const k=b.dataset.star; state.interests.has(k)?state.interests.delete(k):state.interests.add(k); saveWatch(); renderDay(); });
  }

  function setPerfRange(kind){
    const t=today(), y=yesterday(); let s,e;
    if(kind==="today") s=e=t;
    else if(kind==="yesterday") s=e=y;
    else if(kind==="7"){ e=t; s=addDays(t,-6); }
    else if(kind==="30"){ e=t; s=addDays(t,-29); }
    else if(kind==="month"){ s=startOfMonth(t); e=t; }
    else { const dates=visibleRows().map(r=>getDate(r)).filter(Boolean).sort(); s=parseDate(dates[0]||keyDate(t)); e=parseDate(dates.at(-1)||keyDate(t)); }
    $("#perfStart").value=keyDate(s); $("#perfEnd").value=keyDate(e);
    $$(".quick-range button").forEach(b=>b.classList.toggle("active",b.dataset.range===kind));
    renderPerformance();
  }

  function perfRows(){
    const s=$("#perfStart").value, e=$("#perfEnd").value, p=$("#perfPlatform").value, g=$("#perfGroup").value, q=normalize($("#perfSearch").value), st=$("#perfStatus").value;
    let rows=visibleRows().filter(r=>{
      const d=getDate(r); if(s&&d<s||e&&d>e) return false;
      if(p&&getPlatform(r)!==p) return false;
      if(g&&clean(r.product_group)!==g) return false;
      if(q&&!normalize(`${getProductName(r)} ${getRawTitle(r)} ${r.brand||""}`).includes(q)) return false;
      if(st==="confirmed"&&!performanceOk(r)) return false;
      if(st==="missing"&&performanceOk(r)) return false;
      return true;
    });
    const firstMap=firstSeenMap();
    if($("#perfHotOnly").checked) rows=rows.filter(r=>isHot(r,rows));
    if($("#perfNewOnly").checked) rows=rows.filter(r=>isNew(r,firstMap));
    return rows;
  }

  function renderPerformance(){
    let rows=perfRows(), m=metricsForRows(rows), confirmed=rows.filter(performanceOk), firstMap=firstSeenMap();
    const prevStart=addDays(parseDate($("#perfStart").value), -(Math.max(1,(parseDate($("#perfEnd").value)-parseDate($("#perfStart").value))/86400000+1)));
    const prevEnd=addDays(parseDate($("#perfStart").value),-1);
    const prev=visibleRows().filter(r=>getDate(r)>=keyDate(prevStart)&&getDate(r)<=keyDate(prevEnd));
    const pm=metricsForRows(prev);
    const growth=pm.sales?((m.sales-pm.sales)/pm.sales*100):null;
    $("#autoBrief").innerHTML=`<div class="eyebrow">AUTO BRIEF</div><h3>선택기간 핵심 요약</h3>
      <div>선택기간 식품방송은 <b>${m.broadcasts}회</b>, 실적 확인은 <b>${m.confirmed}회</b>(${m.broadcasts?Math.round(m.confirmed/m.broadcasts*100):0}%)입니다.</div>
      <div>총매출은 <b>${money(m.sales)}</b>, 방송당 평균매출은 <b>${money(m.avg)}</b>${growth===null?"":`, 직전 동일기간 대비 <b>${growth>=0?"▲":"▼"} ${Math.abs(growth).toFixed(1)}%</b>`}입니다.</div>`;
    $("#perfKpis").innerHTML=[
      ["방송",`${cnt(m.broadcasts)}회`,""],["실적 확인",`${m.broadcasts?Math.round(m.confirmed/m.broadcasts*100):0}%`,`${m.confirmed}/${m.broadcasts}회`],
      ["총 매출",money(m.sales),""],["평균 매출",money(m.avg),""],["총 판매량",cnt(m.units),""],
      ["HOT 방송",`${rows.filter(r=>isHot(r,rows)).length}건`,""],["NEW 방송",`${rows.filter(r=>isNew(r,firstMap)).length}건`,""],["상품수",`${new Set(rows.map(getProductName)).size}개`,""]
    ].map(([a,b,c])=>`<div class="kpi"><div class="label">${a}</div><div class="value">${b}</div><div class="sub">${c}</div></div>`).join("");

    const prod=new Map();
    for(const r of confirmed){ const k=getProductName(r), x=prod.get(k)||{sales:0,count:0}; x.sales+=sales(r); x.count++; prod.set(k,x); }
    const tops=[...prod].sort((a,b)=>b[1].sales-a[1].sales).slice(0,20), max=tops[0]?.[1].sales||1;
    $("#topProductCount").textContent=`${prod.size}개 상품`;
    $("#topProducts").innerHTML=tops.map(([name,x],i)=>`<div class="rank-row"><b>${i+1}</b><div><b>${esc(name)}</b><div class="small">${x.count}회 방송</div><div class="bar"><i style="width:${x.sales/max*100}%"></i></div></div><span class="money">${money(x.sales)}</span></div>`).join("")||'<div class="muted">실적이 없습니다.</div>';

    const hourly=Array.from({length:24},(_,h)=>({h,rows:confirmed.filter(r=>getHour(r)===h)})).map(x=>({...x,s:x.rows.reduce((a,r)=>a+sales(r),0)}));
    const hmax=Math.max(1,...hourly.map(x=>x.s));
    $("#hourlySales").innerHTML=hourly.map(x=>`<div class="hour-row"><b>${pad(x.h)}시</b><div class="bar"><i style="width:${x.s/hmax*100}%"></i></div><span>${x.rows.length}개</span><span class="money">${x.s?money(x.s):"-"}</span><span class="small">평균 ${x.rows.length?money(x.s/x.rows.length):"-"}</span></div>`).join("");

    const hot=confirmed.filter(r=>isHot(r,rows)).sort((a,b)=>sales(b)-sales(a)).slice(0,30);
    $("#hotCount").textContent=`HOT ${hot.length}건`;
    $("#hotList").innerHTML=hot.map(r=>`<div class="list-row"><div><span class="badge hot">HOT</span><b>${esc(getProductName(r))}</b><div class="small">${getDate(r)} ${getTime(r)} · ${esc(getPlatform(r))}</div></div><span class="money">${money(sales(r))}</span></div>`).join("")||'<div class="muted">HOT 실적이 없습니다.</div>';
    const newRows=rows.filter(r=>isNew(r,firstMap)).sort((a,b)=>getDate(b).localeCompare(getDate(a))).slice(0,40);
    $("#newCount").textContent=`NEW ${newRows.length}건`;
    $("#newList").innerHTML=newRows.map(r=>`<div class="list-row"><div><span class="badge new">NEW</span><b>${esc(getProductName(r))}</b><div class="small">${getDate(r)} ${getTime(r)} · ${esc(getPlatform(r))}</div></div><span>${performanceOk(r)?money(sales(r)):"-"}</span></div>`).join("")||'<div class="muted">신규 상품이 없습니다.</div>';

    renderAccordions(rows);
  }

  function renderAccordions(rows){
    const byChannel=new Map();
    rows.forEach(r=>{const k=getPlatform(r); (byChannel.get(k)||byChannel.set(k,[]).get(k)).push(r);});
    $("#channelAccordion").innerHTML=[...byChannel].sort((a,b)=>metricsForRows(b[1]).sales-metricsForRows(a[1]).sales).map(([k,rs])=>accordion(k,rs)).join("");
    const byProd=new Map();
    rows.forEach(r=>{const k=getProductName(r); (byProd.get(k)||byProd.set(k,[]).get(k)).push(r);});
    $("#productAccordion").innerHTML=[...byProd].sort((a,b)=>metricsForRows(b[1]).sales-metricsForRows(a[1]).sales).slice(0,100).map(([k,rs])=>accordion(k,rs)).join("");
    $$(".accordion-head").forEach(b=>b.onclick=()=>b.parentElement.classList.toggle("open"));
  }

  function accordion(name,rs){
    const m=metricsForRows(rs);
    return `<div class="accordion-item"><button class="accordion-head"><b>${esc(name)}</b><span>${rs.length}회</span><span class="money">${money(m.sales)}</span><span>평균 ${money(m.avg)}</span></button><div class="accordion-body">${rs.sort((a,b)=>clean(b.start_datetime).localeCompare(clean(a.start_datetime))).map(r=>`<div class="broadcast-mini"><span>${getDate(r)} ${getTime(r)}</span><span>${esc(getPlatform(r))}</span><span>${esc(getProductName(r))}</span><span>${cnt(salesCount(r))}</span><span class="money">${performanceOk(r)?money(sales(r)):"-"}</span></div>`).join("")}</div></div>`;
  }

  function occurrenceInReviewRange(r){
    const p=$("#reviewPlatform").value, s=$("#reviewStart").value, e=$("#reviewEnd").value;
    const d=getDate(r);
    if(p && getPlatform(r)!==p) return false;
    if(s && d<s) return false;
    if(e && d>e) return false;
    return true;
  }

  function reviewOccurrences(rows){
    return (rows || []).filter(occurrenceInReviewRange);
  }

  function buildOccurrenceMap(){
    const map=new Map();
    for(const r of state.rows){
      const raw=getRawTitle(r), k=normalize(raw); if(!k) continue;
      const x=map.get(k)||{raw,rows:[]}; x.rows.push(r); map.set(k,x);
    }
    return map;
  }

  function masterRowsForReview(){
    return state.adminMaster?.rows || state.masterPublic || [];
  }

  function masterProductGroups(){
    const groups=new Map();
    for(const m of masterRowsForReview()){
      const std=clean(m.standard_product_name||m.match_keyword||"미분류");
      const g=groups.get(std)||{standard_product_name:std,aliases:[],master:m};
      g.aliases.push(m);
      groups.set(std,g);
    }
    return groups;
  }

  function occurrencesForAliases(aliases){
    const keys=(aliases||[]).map(a=>normalize(a.match_keyword)).filter(Boolean);
    return state.rows.filter(r=>{
      const raw=normalize(getRawTitle(r));
      return keys.some(k=>raw===k || raw.includes(k) || k.includes(raw));
    });
  }

  function getReviewItems(filter){
    if(filter==="audit"){
      return (state.adminMaster?.audit || []).map(x=>({kind:"audit",audit:x}));
    }

    const occurrence=buildOccurrenceMap(), out=[];
    const groups=masterProductGroups();

    if(filter==="pending" || filter==="all"){
      for(const x of occurrence.values()){
        const sample=x.rows.at(-1), m=findMasterForRow(sample);
        const dynamic=!!dynamicRuleForRow(sample);
        const excluded=m&&isExcludedRow(m);
        const confirmed=m&&(/confirmed/i.test(clean(m.review_status))||clean(m.standard_product_name));
        const overriddenCount=x.rows.filter(r=>occurrenceRuleForRow(r)).length;

        // Dynamic titles remain reviewable until every occurrence in the selected range is overridden.
        if(dynamic){
          const inRange=reviewOccurrences(x.rows);
          const unresolved=inRange.filter(r=>!occurrenceRuleForRow(r));
          if(unresolved.length){
            out.push({kind:"dynamic",raw_title:x.raw,standard_product_name:"",master:null,occurrences:x.rows});
          }
        } else if(!m || (!confirmed&&!excluded)){
          out.push({kind:"pending",raw_title:x.raw,standard_product_name:m?.standard_product_name||"",master:m||null,occurrences:x.rows});
        }
      }
    }

    if(filter==="confirmed" || filter==="excluded" || filter==="all"){
      for(const g of groups.values()){
        const excluded=isExcludedRow(g.master);
        if(filter==="confirmed"&&excluded) continue;
        if(filter==="excluded"&&!excluded) continue;
        g.kind=excluded?"excluded":"confirmed";
        g.occurrences=occurrencesForAliases(g.aliases);
        out.push(g);
      }
    }

    if(filter==="dynamic"){
      const dynRules=state.adminMaster?.dynamic_rules||[];
      for(const dr of dynRules){
        const occurrences=state.rows.filter(r=>{
          const raw=normalize(getRawTitle(r)), p=normalize(dr.pattern), ch=normalize(dr.platform||"");
          return p && raw.includes(p) && (!ch || normalize(getPlatform(r))===ch);
        });
        out.push({kind:"dynamic",raw_title:dr.pattern,standard_product_name:"",master:dr,occurrences});
      }
    }

    return out;
  }

  function reviewFilterMatch(item){
    if(item.kind==="audit"){
      const q=normalize($("#reviewSearch").value);
      if(!q) return true;
      const a=item.audit||{};
      return normalize(`${a.action||""} ${a.subject||""} ${a.detail||""}`).includes(q);
    }

    const q=normalize($("#reviewSearch").value);
    const hay=normalize(`${item.raw_title||""} ${item.standard_product_name||""} ${item.master?.brand||""} ${(item.aliases||[]).map(a=>a.match_keyword).join(" ")}`);
    if(q&&!hay.includes(q)) return false;

    // IMPORTANT V2.8.1: date/platform filter is applied to the occurrences themselves.
    const filtered=reviewOccurrences(item.occurrences);
    const filterActive=!!($("#reviewPlatform").value||$("#reviewStart").value||$("#reviewEnd").value);
    if(filterActive && !filtered.length) return false;
    return true;
  }

  function renderReview(){
    const all=getReviewItems(state.reviewFilter), items=all.filter(reviewFilterMatch);
    const pending=getReviewItems("pending").filter(reviewFilterMatch).length;
    const confirmed=getReviewItems("confirmed").filter(reviewFilterMatch).length;
    const dynamic=getReviewItems("dynamic").filter(reviewFilterMatch).length;
    const excluded=getReviewItems("excluded").filter(reviewFilterMatch).length;

    $("#reviewSummary").innerHTML=`
      <span class="summary-chip clickable ${state.reviewFilter==="pending"?"active":""}" data-summary-filter="pending">미확인 ${pending}건</span>
      <span class="summary-chip clickable ${state.reviewFilter==="confirmed"?"active":""}" data-summary-filter="confirmed">분류완료 ${confirmed}개</span>
      <span class="summary-chip clickable ${state.reviewFilter==="dynamic"?"active":""}" data-summary-filter="dynamic">가변방송 ${dynamic}개</span>
      <span class="summary-chip clickable ${state.reviewFilter==="excluded"?"active":""}" data-summary-filter="excluded">제외 ${excluded}개</span>
      <span class="summary-chip">현재 표시 ${items.length}건</span>`;

    $$("[data-summary-filter]").forEach(b=>b.onclick=()=>setReviewFilter(b.dataset.summaryFilter));

    if(state.reviewFilter==="audit"){
      const audits=items.slice(0,500).map(x=>x.audit);
      $("#reviewList").innerHTML=`<div class="audit-table">
        <div class="audit-row head"><span>일시</span><span>작업</span><span>대상</span><span>내용</span></div>
        ${audits.map(a=>`<div class="audit-row"><span>${esc(a.created_at||"")}</span><b>${esc(a.action||"")}</b><span>${esc(a.subject||"")}</span><span>${esc(a.detail||"")}</span></div>`).join("")}
      </div>`;
      return;
    }

    $("#reviewList").innerHTML=items.slice(0,700).map(item=>{
      const allOcc=[...item.occurrences].sort((a,b)=>clean(b.start_datetime).localeCompare(clean(a.start_datetime)));
      const occ=reviewOccurrences(allOcc);
      const displayOcc=occ.length?occ:allOcc;
      const last=displayOcc[0], aliasCount=item.aliases?.length||0;
      const periodLabel=($("#reviewStart").value||$("#reviewEnd").value||$("#reviewPlatform").value)?"선택기간":"전체";
      const badge=item.kind==="pending"?'<span class="badge warn">확인필요</span>':
        item.kind==="dynamic"?'<span class="badge dynamic">가변방송</span>':
        item.kind==="excluded"?'<span class="badge hot">제외</span>':'<span class="badge good">분류완료</span>';

      return `<div class="review-card"><div>
        <h4>${badge}${esc(item.standard_product_name||item.raw_title)}</h4>
        ${item.raw_title&&item.standard_product_name?`<div class="small">원본: ${esc(item.raw_title)}</div>`:""}
        <div class="review-meta">${last?`${periodLabel} 최근 방송 ${getDate(last)} ${getTime(last)} · ${esc(getPlatform(last))}`:"방송 이력 없음"}${displayOcc.length?` · ${periodLabel} 방송 ${displayOcc.length}회`:""}${aliasCount?` · 연결 원본명 ${aliasCount}개`:""}</div>
        ${item.kind==="dynamic"?'<div class="dynamic-note">이 제목은 방송마다 실제 상품이 달라질 수 있어 자동 대표상품으로 묶지 않습니다.</div>':""}
      </div><div class="review-actions">
        ${allOcc.length?`<button class="btn" data-history="${esc(item.standard_product_name||item.raw_title)}" data-kind="${item.kind}">방송이력</button>`:""}
        <button class="btn primary" data-edit-review="${esc(item.standard_product_name||item.raw_title)}" data-kind="${item.kind}">관리</button>
      </div></div>`;
    }).join("")||'<div class="card muted">조건에 맞는 상품이 없습니다.</div>';

    $$("[data-edit-review]").forEach(b=>b.onclick=()=>openProductDialog(b.dataset.editReview,b.dataset.kind));
    $$("[data-history]").forEach(b=>b.onclick=()=>openHistoryDialog(b.dataset.history,b.dataset.kind));
  }

  function setReviewFilter(filter){
    state.reviewFilter=filter;
    $$(".review-state-filter button").forEach(x=>x.classList.toggle("active",x.dataset.reviewFilter===filter));
    renderReview();
  }

  function findReviewItem(name,kind){
    return getReviewItems(kind==="dynamic"?"dynamic":"all").find(x=>(x.standard_product_name||x.raw_title)===name) ||
           getReviewItems("all").find(x=>(x.standard_product_name||x.raw_title)===name);
  }

  function openHistoryDialog(name,kind){
    const item=findReviewItem(name,kind); if(!item) return;
    state.historyContext={name,kind,item};
    $("#historyDialogTitle").textContent=`방송이력 · ${name}`;
    const filtered=reviewOccurrences(item.occurrences);
    const rows=(filtered.length || $("#reviewStart").value || $("#reviewEnd").value || $("#reviewPlatform").value) ? filtered : item.occurrences;
    const groups=new Map();
    rows.forEach(r=>{const d=getDate(r);(groups.get(d)||groups.set(d,[]).get(d)).push(r);});
    const dates=[...groups.keys()].sort((a,b)=>b.localeCompare(a));

    $("#historyDialogSub").textContent=`${dates.length}개 일자 · ${rows.length}회 방송`;
    $("#historyOccurrenceList").classList.add("hidden");
    $("#historyDateList").classList.remove("hidden");
    $("#historyDateList").innerHTML=dates.map(d=>{
      const rs=groups.get(d).sort((a,b)=>clean(a.start_datetime).localeCompare(clean(b.start_datetime)));
      const channels=[...new Set(rs.map(getPlatform))].join(", ");
      return `<button type="button" class="history-date-row" data-history-date="${d}">
        <b>${d}</b><span>${esc(channels)}</span><span>${rs.length}건</span><span>선택 ›</span>
      </button>`;
    }).join("")||'<div class="muted">선택기간 방송이력이 없습니다.</div>';

    $$("[data-history-date]").forEach(b=>b.onclick=()=>renderHistoryDate(b.dataset.historyDate,groups.get(b.dataset.historyDate)));
    $("#historyDialog").showModal();
  }

  function renderHistoryDate(date,rows){
    $("#historyDateList").classList.add("hidden");
    $("#historyOccurrenceList").classList.remove("hidden");
    $("#historyOccurrenceList").innerHTML=`<button type="button" class="btn history-back" id="historyBackBtn">← 일자 목록</button>
      <h4>${date}</h4>
      ${rows.map(r=>{
        const o=occurrenceRuleForRow(r);
        return `<div class="history-occ-row">
          <b>${esc(getTime(r))}</b>
          <span>${esc(getPlatform(r))}</span>
          <span>${esc(getRawTitle(r))}${o?`<div class="small">지정상품: ${esc(o.standard_product_name)}</div>`:""}</span>
          <button type="button" class="btn ${o?"":"primary"}" data-occurrence-edit="${esc(r.hsshow_id||"")}">${o?"수정":"이 방송 분류"}</button>
        </div>`;
      }).join("")}`;
    $("#historyBackBtn").onclick=()=>openHistoryDialog(state.historyContext.name,state.historyContext.kind);
    $$("[data-occurrence-edit]").forEach(b=>b.onclick=()=>openOccurrenceEditor(b.dataset.occurrenceEdit));
  }

  function openOccurrenceEditor(id){
    const r=state.rows.find(x=>clean(x.hsshow_id)===clean(id)); if(!r) return;
    $("#historyDialog").close();
    $("#productDialogTitle").textContent="가변방송 · 이 방송만 분류";
    $("#editRawTitle").value=getRawTitle(r);
    $("#editRawDisplay").value=getRawTitle(r);
    $("#editSourceStandard").value="";
    const o=occurrenceRuleForRow(r)||{};
    $("#editStandardName").value=o.standard_product_name||"";
    $("#editBrand").value=o.brand||""; $("#editGroup").value=o.product_group||""; $("#editIngredient").value=o.main_ingredient||"";
    $("#editAction").value="save_occurrence";
    $("#productForm").dataset.occurrenceId=clean(r.hsshow_id);
    $("#editBroadcastInfo").textContent=`${getDate(r)} ${getTime(r)} · ${getPlatform(r)} · 이 방송 1건에만 적용`;
    $("#aliasPreview").innerHTML="이 저장은 같은 제목의 다른 방송에는 영향을 주지 않습니다.";
    $("#bulkAliasTools").classList.add("hidden");
    renderSimilarSuggestions(getRawTitle(r));
    toggleMergeTarget();
    $("#productDialog").showModal();
  }

  function similarityScore(a,b){
    const A=new Set(normalize(a).split(" ").filter(x=>x.length>1)), B=new Set(normalize(b).split(" ").filter(x=>x.length>1));
    if(!A.size||!B.size) return 0;
    let inter=0; A.forEach(x=>B.has(x)&&inter++);
    return inter/Math.max(A.size,B.size);
  }

  function renderSimilarSuggestions(raw){
    const products=state.adminMaster?.products||[];
    const top=products.map(p=>({name:p.standard_product_name,score:similarityScore(raw,p.standard_product_name)}))
      .filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5);
    $("#similarSuggestions").innerHTML=top.length?`<div class="suggestion-title">유사 기존상품 추천</div><div class="suggestion-buttons">${top.map(x=>`<button type="button" class="suggestion-btn" data-suggest="${esc(x.name)}">${esc(x.name)}</button>`).join("")}</div>`:"";
    $$("[data-suggest]").forEach(b=>b.onclick=()=>{$("#editStandardName").value=b.dataset.suggest;$("#editAction").value="link_existing";});
  }

  async function adminLogin(){
    if(!API) return showStatus("config.js의 adminApiBase가 없습니다.","error");
    $("#adminLoginError").textContent="";
    $("#adminDialog").showModal();
  }

  async function verifyAdmin(password){
    const r=await fetch(`${API}/auth`,{method:"POST",headers:{"X-Admin-Password":password}});
    return r.ok;
  }

  async function loadAdminMaster(){
    if(!state.adminPassword) return;
    const r=await fetch(`${API}/master`,{headers:{"X-Admin-Password":state.adminPassword},cache:"no-store"});
    if(!r.ok) throw new Error(`관리자 마스터 조회 실패 ${r.status}`);
    state.adminMaster=await r.json();
    $("#adminState").textContent=`관리자 모드 · ${state.adminMaster.product_count||0}개 상품`;
    $("#adminState").classList.add("on");
    $("#adminBtn").textContent="관리자 로그아웃";
    renderMasterDatalist();
  }

  function renderMasterDatalist(){
    const names=state.adminMaster?.products?.map(p=>p.standard_product_name)||[];
    $("#masterProductNames").innerHTML=names.map(n=>`<option value="${esc(n)}"></option>`).join("");
  }

  function logoutAdmin(){
    state.adminPassword=""; state.adminMaster=null; sessionStorage.removeItem("hsfm_admin_password");
    $("#adminState").textContent="조회 모드"; $("#adminState").classList.remove("on"); $("#adminBtn").textContent="관리자 로그인";
    renderAll();
  }

  function openProductDialog(name,kind){
    if(!state.adminPassword){ adminLogin(); return; }
    const item=findReviewItem(name,kind); if(!item) return;
    const last=[...item.occurrences].sort((a,b)=>clean(b.start_datetime).localeCompare(clean(a.start_datetime)))[0];
    const m=item.master||item.aliases?.[0]||{};
    delete $("#productForm").dataset.occurrenceId;

    $("#productDialogTitle").textContent=kind==="pending"?"미확인 상품 분류":kind==="dynamic"?"가변형 방송명 관리":"기존 상품 관리";
    $("#editRawTitle").value=item.raw_title||m.match_keyword||"";
    $("#editRawDisplay").value=item.raw_title||m.match_keyword||"(표준 상품 전체)";
    $("#editSourceStandard").value=item.standard_product_name||m.standard_product_name||"";
    $("#editStandardName").value=item.standard_product_name||m.standard_product_name||"";
    $("#editBrand").value=m.brand||""; $("#editGroup").value=m.product_group||""; $("#editIngredient").value=m.main_ingredient||"";
    $("#editAction").value=kind==="pending"?"link_existing":kind==="dynamic"?"mark_dynamic_title":kind==="excluded"?"restore":"update_product";
    $("#editBroadcastInfo").textContent=last?`최근 방송: ${getDate(last)} ${getTime(last)} · ${getPlatform(last)} · 전체 ${item.occurrences.length}회`:"방송 이력 없음";

    const aliases=item.aliases||[];
    $("#aliasPreview").innerHTML=aliases.length?`<b>현재 연결된 원본명 ${aliases.length}개</b>${aliases.map(a=>`<label class="alias-row"><input type="checkbox" class="alias-check" value="${esc(a.match_keyword||"")}"><span>${esc(a.match_keyword||"")}</span><span class="small">${esc(a.admin_action||"")}</span></label>`).join("")}`:"기존 연결 원본명 없음";
    $("#bulkAliasTools").classList.toggle("hidden",aliases.length<1);
    $("#bulkAliasTarget").value="";
    renderSimilarSuggestions(item.raw_title||item.standard_product_name||"");
    $("#mergeTarget").value=""; toggleMergeTarget(); $("#productSaveError").textContent="";
    $("#productDialog").showModal();
  }

  function toggleMergeTarget(){
    const action=$("#editAction").value;
    $("#mergeTargetWrap").classList.toggle("hidden",action!=="merge_product");
    if(action==="mark_dynamic_title"){
      $("#editStandardName").placeholder="가변형 제목은 대표 표준상품명을 지정하지 않습니다.";
    }else{
      $("#editStandardName").placeholder="실제 동일 제품의 대표 이름";
    }
  }

  async function saveProductAdmin(){
    const action=$("#editAction").value, raw=$("#editRawTitle").value, source=$("#editSourceStandard").value, standard=$("#editStandardName").value;
    const body={action,raw_title:raw,match_keyword:raw,standard_product_name:standard,source_standard_product_name:source,brand:$("#editBrand").value,product_group:$("#editGroup").value,main_ingredient:$("#editIngredient").value};

    if(action==="merge_product"){ body.source_standard_product_name=source; body.target_standard_product_name=$("#mergeTarget").value; }
    if(action==="exclude"){ body.scope=source&&!raw?"product":"alias"; }
    if(action==="mark_dynamic_title"){ body.pattern=raw||source; body.platform=""; }
    if(action==="save_occurrence"){
      body.hsshow_id=$("#productForm").dataset.occurrenceId||"";
      const r=state.rows.find(x=>clean(x.hsshow_id)===body.hsshow_id);
      if(r){
        body.broadcast_date=getDate(r);
        body.start_datetime=clean(r.start_datetime);
        body.platform_name=getPlatform(r);
        body.raw_title=getRawTitle(r);
      }
    }

    $("#productSaveError").textContent="";
    try{
      const r=await fetch(`${API}/save`,{method:"POST",headers:{"Content-Type":"application/json","X-Admin-Password":state.adminPassword},body:JSON.stringify(body)});
      const data=await r.json();
      if(!r.ok||!data.ok) throw new Error(data.error||`HTTP ${r.status}`);
      $("#productDialog").close();
      await loadAdminMaster();
      renderAll();
      showStatus("관리자 결정이 HOMESHOPING-MONITOR에 영구 저장되었습니다.");
    }catch(e){ $("#productSaveError").textContent=e.message; }
  }

  async function bulkMoveAliases(){
    const aliases=$$(".alias-check:checked").map(x=>x.value).filter(Boolean);
    const target=clean($("#bulkAliasTarget").value);
    if(!aliases.length) return $("#productSaveError").textContent="이동할 원본명을 선택하세요.";
    if(!target) return $("#productSaveError").textContent="이동 대상 표준상품을 입력하세요.";
    try{
      const r=await fetch(`${API}/save`,{method:"POST",headers:{"Content-Type":"application/json","X-Admin-Password":state.adminPassword},body:JSON.stringify({action:"bulk_move_aliases",aliases,target_standard_product_name:target})});
      const data=await r.json(); if(!r.ok||!data.ok) throw new Error(data.error||`HTTP ${r.status}`);
      $("#productDialog").close(); await loadAdminMaster(); renderAll(); showStatus(`${aliases.length}개 원본명을 '${target}' 상품으로 이동했습니다.`);
    }catch(e){ $("#productSaveError").textContent=e.message; }
  }

  function renderWatch(){
    $("#watchKeywords").innerHTML=state.watchKeywords.map(k=>`<span class="chip">${esc(k)}<button data-rm-watch="${esc(k)}">✕</button></span>`).join("")||'<span class="muted">등록된 키워드가 없습니다.</span>';
    $$("[data-rm-watch]").forEach(b=>b.onclick=()=>{state.watchKeywords=state.watchKeywords.filter(k=>k!==b.dataset.rmWatch);saveWatch();renderWatch();});
    const matched=visibleRows().filter(isWatched), byProd=new Map();
    for(const r of matched){ const k=getProductName(r), x=byProd.get(k)||[]; x.push(r); byProd.set(k,x); }
    $("#watchResults").innerHTML=[...byProd].map(([name,rs])=>{const m=metricsForRows(rs);return `<div class="review-card"><div><h4>${esc(name)}</h4><div class="review-meta">방송 ${rs.length}회 · 매출 ${money(m.sales)} · 평균 ${money(m.avg)}</div></div></div>`;}).join("")||'<div class="card muted">관심 키워드와 일치하는 방송이 없습니다.</div>';
  }

  function renderAll(){
    const rows=visibleRows();
    fillSelect("#calendarPlatform",rows.map(getPlatform)); fillSelect("#perfPlatform",rows.map(getPlatform)); fillSelect("#reviewPlatform",state.rows.map(getPlatform)); fillSelect("#perfGroup",rows.map(r=>clean(r.product_group)));
    renderGlobalKpis(); renderCalendar(); renderPerformance(); renderReview(); renderWatch();
  }

  async function loadData(){
    try{
      const [csv,master,pending]=await Promise.all([
        fetchText("../data/food_broadcasts.csv"),
        fetchText("../data/product_master.csv").catch(()=>""), fetchJsonSafe("../reports/pending_products.json")
      ]);
      state.rows=parseCSV(csv); state.masterPublic=parseCSV(master); state.pending=Array.isArray(pending)?pending:(pending?.items||[]);
      const stamps=state.rows.map(r=>clean(r.performance_updated_at||r.last_seen_at||r.start_datetime)).filter(Boolean).sort();
      $("#latestDataAt").textContent=`최근 데이터 갱신: ${stamps.at(-1)||"확인 불가"}`;
      if(state.adminPassword){ try{await loadAdminMaster();}catch{logoutAdmin();} }
      renderAll();
    }catch(e){
      $("#latestDataAt").textContent="데이터 로드 실패";
      showStatus(`데이터를 불러오지 못했습니다: ${e.message}`,"error");
    }
  }

  function bind(){
    $$(".tab").forEach(b=>b.onclick=()=>{state.activeTab=b.dataset.tab; $$(".tab").forEach(x=>x.classList.toggle("active",x===b)); $$(".tab-panel").forEach(p=>p.classList.toggle("active",p.id===`${state.activeTab}Panel`));});
    $$("[data-view]").forEach(b=>b.onclick=()=>{state.view=b.dataset.view;renderCalendar();});
    $("#prevPeriod").onclick=()=>{state.cursor=state.view==="month"?new Date(state.cursor.getFullYear(),state.cursor.getMonth()-1,1):state.view==="week"?addDays(state.cursor,-7):addDays(state.cursor,-1);renderCalendar();};
    $("#nextPeriod").onclick=()=>{state.cursor=state.view==="month"?new Date(state.cursor.getFullYear(),state.cursor.getMonth()+1,1):state.view==="week"?addDays(state.cursor,7):addDays(state.cursor,1);renderCalendar();};
    $("#todayBtn").onclick=()=>{state.cursor=today();renderCalendar();};
    $("#refreshBtn").onclick=loadData;
    ["#calendarPlatform","#calendarSearch","#calendarWatchOnly"].forEach(s=>$(s).addEventListener("input",renderCalendar));
    $$(".quick-range button").forEach(b=>b.onclick=()=>setPerfRange(b.dataset.range));
    ["#perfStart","#perfEnd","#perfPlatform","#perfGroup","#perfSearch","#perfStatus","#perfHotOnly","#perfNewOnly"].forEach(s=>$(s).addEventListener("input",renderPerformance));
    $("#resetPerf").onclick=()=>setPerfRange("yesterday");
    $$(".review-state-filter button").forEach(b=>b.onclick=()=>setReviewFilter(b.dataset.reviewFilter));
    ["#reviewSearch","#reviewPlatform","#reviewStart","#reviewEnd"].forEach(s=>$(s).addEventListener("input",renderReview));
    $("#adminBtn").onclick=()=>state.adminPassword?logoutAdmin():adminLogin();
    $("#adminLoginSubmit").onclick=async e=>{e.preventDefault();const pw=$("#adminPasswordInput").value;try{if(!await verifyAdmin(pw)) throw new Error("관리자 비밀번호가 올바르지 않습니다.");state.adminPassword=pw;sessionStorage.setItem("hsfm_admin_password",pw);await loadAdminMaster();$("#adminDialog").close();renderAll();showStatus("관리자 모드로 로그인했습니다.");}catch(err){$("#adminLoginError").textContent=err.message;}};
    $("#editAction").onchange=toggleMergeTarget;
    $("#productSaveBtn").onclick=e=>{e.preventDefault();saveProductAdmin();};
    $("#bulkAliasMoveBtn").onclick=bulkMoveAliases;
    $("#historyCloseBtn").onclick=()=>$("#historyDialog").close();
    $("#addWatchKeyword").onclick=()=>{const k=clean($("#watchKeyword").value);if(!k)return;if(!state.watchKeywords.includes(k))state.watchKeywords.push(k);$("#watchKeyword").value="";saveWatch();renderWatch();};
  }

  bind();
  setPerfRange("yesterday");
  loadData();
})();
