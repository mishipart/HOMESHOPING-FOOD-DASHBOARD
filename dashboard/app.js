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
    watchKeywords: JSON.parse(localStorage.getItem("hsfm_watch_keywords") || "[]"),
    derived: {
      visibleRows: null,
      firstSeen: null,
      occurrenceMap: null,
      masterGroups: null,
      masterMatch: new Map(),
      occurrenceRuleMap: null,
      dynamicRules: null
    }
  };


  // V2.10.0: 기존 분류 유지 + 일반식품 > 축산물 추가
  // - 건강식품: 영양성분(5개 군) / 고시형원료(69개) / 개별인정형원료(직접입력)
  // - 신선식품: 농산물/수산물/축산물 + 식품유형 직접입력
  const CATEGORY_TREE = {
    "일반식품": {
      "과자류, 빵류 또는 떡류": ["과자","캔디류","추잉껌","빵류","떡류"],
      "빙과류": ["아이스크림","저지방아이스크림","아이스밀크","샤베트","비유지방아이스크림""아이스크림믹스","저지방아이스크림믹스","아이스밀크믹스","샤베트믹스","비유지방아이스크림믹스","빙과","식용얼음","어업용얼음"],
      "코코아가공품류 또는 초콜릿류": ["코코아매스","코코아버터","코코아분말","기타코코아가공품","초콜릿","밀크초콜릿","화이트초콜릿","준초콜릿","초콜릿가공품"],
      "당류": ["설탕","기타설탕","당시럽류","올리고당","올리고당가공품","포도당","과당","기타과당","물엿","기타엿","덱스트린","당류가공품"],
      "잼류": ["잼","기타잼"],
      "두부류 또는 묵류": ["두부","유바","가공두부","묵류"],
      "식용유지류": ["콩기름(대두유)","옥수수기름(옥배유)","채종유(유채유 또는 카놀라유)","미강유(현미유)","참기름","추출참깨유","들기름","추출들깨유","홍화유(사플라워유 또는 잇꽃유)","해바라기유","목화씨기름(면실유)","땅콩기름(낙화생유)","올리브유","팜유류","야자유","고추씨기름","기타식물성유지","식용우지","식용돈지","원료우지","원료돈지","어유","기타동물성유지","혼합식용유","향미유","가공유지","쇼트닝","마가린","모조치즈","식물성크림","기타식용유지가공품"],
      "면류": ["생면","숙면","건면","유탕면"],
      "음료류": ["침출차","액상차","고형차","커피","농축과채즙(또는 과채분)","과채주스","과채음료","탄산음료","탄산수","원액두유","가공두유","유산균음료","효모음료","기타발효음료","인삼홍삼음료","혼합음료","음료베이스"],
      "특수영양식품": ["영아전기용조제유","영아후기용조제유","유아기용조제유","성장기용조제유","영아용조제식","영아전기용조제식","영아후기용조제식","유아기용 조제식","성장기용조제식","영유아용이유식","체중조절용조제식품","임산수유부용식품","고령자용 영양조제식품"],
      "특수의료용도식품": ["일반환자용균형영양조제식품","당뇨환자용영양조제식품","신장질환자용영양조제식품","장질환자용단백가수분해영양조제식품","암환자용영양조제식품","고혈압환자용영양조제식품","폐질환자용영양조제식품","간경변환자용영양조제식품","열량및영양공급용식품","연하곤란자용점도조절식품","수분및전해질보충용조제식품","선천성대사질환자용조제식품","영유아용특수조제식품","기타환자용영양조제식품","당뇨환자용식단형식품","신장질환자용식단형식품","암환자용식단형식품","고혈압환자용식단형식품"],
      "장류": ["한식메주","개량메주","한식간장","양조간장","산분해간장","효소분해간장","혼합간장","한식된장","된장","고추장","춘장","청국장","혼합장","기타장류"],
      "조미식품": ["발효식초","희석초산","소스","마요네즈","토마토케첩","복합조미식품","카레(커리)분","카레(커리)","고춧가루","실고추","천연향신료","향신료조제품","천일염","재제소금(재제조소금)","태움용융소금","정제소금","기타소금","가공소금"],
      "절임류 또는 조림류": ["김치","김칫속","절임식품","당절임","조림류"],
      "주류": ["탁주","약주","청주","맥주","과실주","소주","위스키","브랜디","일반증류주","리큐르","기타주류","주정"],
      "농산가공식품류": ["전분","전분가공품","밀가루","영양강화밀가루","땅콩버터","땅콩또는견과류가공품","시리얼류","찐쌀","효소식품","과채가공품","곡류가공품","두류가공품","서류가공품","기타농산가공품"],
      "식육가공품 및 포장육": ["햄","생햄","프레스햄","소시지","발효소시지","혼합소시지","베이컨류","건조저장육류","양념육","분쇄가공육제품","갈비가공품","식육케이싱","식육추출가공품","식육간편조리세트","식육함유가공품","포장육"],
      "알가공품류": ["전란액","난황액","난백액","전란분","난황분","난백분","알가열제품","피란","알함유가공품"],
      "유함유가공품": ["우유","환원유","강화우유","유산균첨가우유","유당분해우유","가공유","산양유","발효유","농후발효유","크림발효유","농후크림발효유","발효버터유","발효유분말","버터유","농축우유","탈지농축우유","가당연유","가당탈지연유","가공연유","유크림","가공유크림","버터","가공버터","버터오일","치즈","가공치즈","전지분유","탈지분유","가당분유","혼합분유","유청","농축유청","유청단백분말","유당","유단백가수분해식품","유함유가공품"],
      "수산가공식품류": ["어육살","연육","어육반제품","어묵","어육소시지","기타어육가공품","젓갈","양념젓갈","액젓","조미액젓","조미건어포","건어포","기타건포류","가공김(조미김 또는 구운김)","한천","기타수산물가공품"],
      "동물성가공식품류": ["기타식육또는기타알","기타동물성가공식품","곤충가공식품","자라분말","자라분말제품","자라유제품","추출가공식품"],
      "벌꿀 및 화분가공품": ["벌집꿀","벌꿀","사양벌집꿀","사양벌꿀","로열젤리","로열젤리제품","가공화분","화분함유제품"],
      "즉석식품류": ["생식제품","생식함유제품","즉석섭취식품","신선편의식품","즉석조리식품","간편조리세트","만두","만두피"],
      "기타식품류": ["효모식품","기타가공품"],
      // V2.10.0: 기존 일반식품 분류는 유지하고 축산물 중분류만 추가 했으나 실제 식품공전 하분류를 개선하여 해당 내용 삭제
    },
    "건강식품": {
      "영양성분": ["비타민", "무기질", "식이섬유", "단백질", "필수지방산"],
      "고시형원료": ["인삼", "홍삼", "엽록소 함유 식물", "클로렐라", "스피루리나", "녹차추출물", "알로에 전잎", "프로폴리스추출물", "코엔자임Q10", "대두이소플라본", "구아바잎 추출물", "바나바잎 추출물", "은행잎 추출물", "밀크씨슬 추출물", "달맞이꽃종자 추출물", "EPA 및 DHA 함유 유지", "감마리놀렌산 함유 유지", "레시틴", "스쿠알렌", "식물스테롤/식물스테롤에스테르", "알콕시글리세롤 함유 상어간유", "옥타코사놀 함유 유지", "매실추출물", "공액리놀레산", "가르시니아캄보지아 추출물", "마리골드꽃추출물", "헤마토코쿠스 추출물", "쏘팔메토 열매 추출물", "포스파티딜세린", "글루코사민", "NAG(N-아세틸글루코사민)", "뮤코다당·단백", "구아검/구아검가수분해물", "글루코만난(곤약, 곤약만난)", "귀리식이섬유", "난소화성말토덱스트린", "대두식이섬유", "목이버섯식이섬유", "밀식이섬유", "보리식이섬유", "아라비아검(아카시아검)", "옥수수겨식이섬유", "이눌린/치커리추출물", "차전자피식이섬유", "폴리덱스트로스", "호로파종자식이섬유", "알로에 겔", "키토산", "키토올리고당", "프락토올리고당", "프로바이오틱스", "홍국", "대두단백", "테아닌", "엠에스엠(MSM)", "폴리감마글루탐산", "히알루론산", "홍경천 추출물", "빌베리 추출물", "마늘", "라피노스", "분말한천", "크레아틴", "유단백가수분해물", "상황버섯추출물", "토마토추출물", "곤약감자추출물", "회화나무열매추출물", "콜레우스포스콜리추출물"],
      "개별인정형원료": []
    },
    "신선식품": {"농산물": [], "수산물": [], "축산물": []}
  };

  const datePickerState = { target:null, selected:"", month:new Date() };

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

  // V2.8.7 HOTFIX: 기존 코드 전반에서 사용하던 norm() 별칭을 명시적으로 정의
  // 이 별칭이 없으면 표준상품 검색/선택 시 ReferenceError가 발생한다.
  const norm = normalize;
  const productNameKey = v => clean(v).toLowerCase().replace(/\s+/g, "");

  function getProductName(r){
    return clean(r.standard_product_name || r.normalized_title || r.raw_title || "미분류");
  }
  function getRawTitle(r){ return clean(r.raw_title_corrected || r.raw_title || r.normalized_title || r.standard_product_name || ""); }
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


  function invalidateDerived(){
    state.derived.visibleRows = null;
    state.derived.firstSeen = null;
    state.derived.occurrenceMap = null;
    state.derived.masterGroups = null;
    state.derived.masterMatch = new Map();
    state.derived.occurrenceRuleMap = null;
    state.derived.dynamicRules = null;
  }

  function debounce(fn, wait=180){
    let timer=0;
    return (...args)=>{
      clearTimeout(timer);
      timer=setTimeout(()=>fn(...args),wait);
    };
  }

  // V2.9.6: 관리자 영구 규칙을 기본/자동등록 행보다 항상 우선한다.
  // 같은 match_keyword가 product_master.csv에 확인필요로 남아 있고
  // product_master_admin.csv에는 confirmed로 저장된 경우, 예전 코드는
  // 배열에서 먼저 만난 확인필요 행을 집어 계속 미확인으로 보일 수 있었다.
  function masterCandidates(){
    const adminRows=Array.isArray(state.adminMaster?.admin_rows) ? state.adminMaster.admin_rows : [];
    const effectiveRows=Array.isArray(state.adminMaster?.rows) ? state.adminMaster.rows : [];
    const publicRows=Array.isArray(state.masterPublic) ? state.masterPublic : [];
    const source=adminRows.length || effectiveRows.length ? [...adminRows,...effectiveRows] : publicRows;

    const seen=new Set();
    const ranked=[...source].sort((a,b)=>masterRulePriority(b)-masterRulePriority(a));
    return ranked.filter(m=>{
      const k=normalize(m.match_keyword || m.raw_title || m.normalized_title || m.standard_product_name || "");
      if(!k) return false;
      const sig=`${k}__${productNameKey(m.standard_product_name||"")}`;
      if(seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  }

  function masterRulePriority(m){
    let score=0;
    const status=clean(m?.review_status||"").toLowerCase();
    const enabled=clean(m?.enabled||"Y").toUpperCase();
    const locked=clean(m?.manual_lock||"").toUpperCase();
    if(locked==="Y") score+=1000;
    if(/confirmed|확정|분류완료/.test(status)) score+=500;
    if(clean(m?.standard_product_name)) score+=100;
    if(enabled!=="N") score+=20;
    if(/pending|미분류|확인필요|review/.test(status)) score-=300;
    if(enabled==="N") score-=500;
    return score;
  }

  function findMasterForRow(r){
    const raw=normalize(getRawTitle(r));
    if(!raw) return null;

    if(state.derived.masterMatch.has(raw)){
      return state.derived.masterMatch.get(raw);
    }

    const matches=masterCandidates().filter(m=>{
      const k=normalize(m.match_keyword || m.raw_title || m.normalized_title || "");
      return k && (raw===k || raw.includes(k) || k.includes(raw));
    });

    matches.sort((a,b)=>{
      const ak=normalize(a.match_keyword || a.raw_title || a.normalized_title || "");
      const bk=normalize(b.match_keyword || b.raw_title || b.normalized_title || "");
      const aExact=raw===ak ? 1 : 0, bExact=raw===bk ? 1 : 0;
      if(aExact!==bExact) return bExact-aExact;
      const ap=masterRulePriority(a), bp=masterRulePriority(b);
      if(ap!==bp) return bp-ap;
      // 더 구체적인(긴) alias를 우선해 짧은 키워드의 오매칭을 줄인다.
      return bk.length-ak.length;
    });

    const hit=matches[0]||null;
    state.derived.masterMatch.set(raw,hit);
    return hit;
  }

  function occurrenceRuleForRow(r){
    const id=clean(r.hsshow_id);
    if(!id) return null;

    if(!state.derived.occurrenceRuleMap){
      state.derived.occurrenceRuleMap=new Map(
        (state.adminMaster?.occurrence_rules||[])
          .map(x=>[clean(x.hsshow_id),x])
          .filter(([k])=>k)
      );
    }

    return state.derived.occurrenceRuleMap.get(id)||null;
  }

  function dynamicRuleForRow(r){
    const raw=normalize(getRawTitle(r));
    const platform=normalize(getPlatform(r));

    if(!state.derived.dynamicRules){
      state.derived.dynamicRules=(state.adminMaster?.dynamic_rules||[])
        .map(x=>({
          row:x,
          pattern:normalize(x.pattern||""),
          platform:normalize(x.platform||"")
        }))
        .filter(x=>x.pattern);
    }

    const hit=state.derived.dynamicRules.find(
      x=>raw.includes(x.pattern)&&(!x.platform||x.platform===platform)
    );
    return hit?.row||null;
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
        category_major: o.category_major || r.category_major,
        category_middle: o.category_middle || r.category_middle,
        category_sub: o.category_sub || r.category_sub,
        manual_lock: o.manual_lock || "Y",
        raw_title_corrected: o.raw_title_corrected || r.raw_title_corrected,
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
      category_major: m.category_major || r.category_major,
      category_middle: m.category_middle || r.category_middle,
      category_sub: m.category_sub || r.category_sub,
      classification_source: m.classification_source || r.classification_source,
      classification_score: m.classification_score || r.classification_score,
      manual_lock: m.manual_lock || r.manual_lock,
      review_status: m.review_status || r.review_status,
      enabled: m.enabled || r.enabled
    };
  }

  function visibleRows(){
    if(state.derived.visibleRows) return state.derived.visibleRows;
    state.derived.visibleRows=state.rows.map(overlayRow).filter(r=>!isExcludedRow(r));
    return state.derived.visibleRows;
  }

  function firstSeenMap(){
    if(state.derived.firstSeen) return state.derived.firstSeen;

    const map=new Map();
    const rows=[...visibleRows()].sort((a,b)=>getDate(a).localeCompare(getDate(b)));
    for(const r of rows){
      const k=normalize(getProductName(r));
      if(k && !map.has(k)) map.set(k,getDate(r));
    }

    state.derived.firstSeen=map;
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
    const s=$("#perfStart").value, e=$("#perfEnd").value, p=$("#perfPlatform").value, major=$("#perfMajor").value, middle=$("#perfMiddle").value, sub=$("#perfSub").value, q=normalize($("#perfSearch").value), st=$("#perfStatus").value;
    let rows=visibleRows().filter(r=>{
      const d=getDate(r); if(s&&d<s||e&&d>e) return false;
      if(p&&getPlatform(r)!==p) return false;
      if(major&&clean(r.category_major)!==major) return false;
      if(middle&&clean(r.category_middle)!==middle) return false;
      if(sub&&clean(r.category_sub)!==sub) return false;
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
    const channelEntries=[...byChannel].sort((a,b)=>metricsForRows(b[1]).sales-metricsForRows(a[1]).sales);
    const channelTarget=$("#channelAccordion");
    if(channelTarget){
      channelTarget.innerHTML=channelEntries.map(([name,rs])=>{
        const m=metricsForRows(rs);
        return `<div class="detail-summary"><b>${esc(name)}</b><span>${rs.length}회</span><span class="money">${money(m.sales)}</span><span>평균 ${money(m.avg)}</span></div>`;
      }).join("")||'<div class="muted detail-empty">해당 기간 홈쇼핑사 실적이 없습니다.</div>';
    }

    const byProd=new Map();
    rows.forEach(r=>{const k=getProductName(r); (byProd.get(k)||byProd.set(k,[]).get(k)).push(r);});
    const productEntries=[...byProd].sort((a,b)=>metricsForRows(b[1]).sales-metricsForRows(a[1]).sales);
    const productTarget=$("#productAccordion");
    if(productTarget){
      productTarget.innerHTML=productEntries.map(([name,rs])=>{
        const m=metricsForRows(rs);
        return `<div class="detail-summary"><b>${esc(name)}</b><span>${rs.length}회</span><span class="money">${money(m.sales)}</span><span>평균 ${money(m.avg)}</span></div>`;
      }).join("")||'<div class="muted detail-empty">해당 기간 상품 실적이 없습니다.</div>';
    }
  }

  function detailBreakdown(name,rs){
    const m=metricsForRows(rs);
    const sorted=[...rs].sort((a,b)=>rowChronoKey(a).localeCompare(rowChronoKey(b)));
    return `<div class="detail-summary"><b>${esc(name)}</b><span>${rs.length}회</span><span class="money">${money(m.sales)}</span><span>평균 ${money(m.avg)}</span></div>
      <div class="detail-broadcast-list">${sorted.map(r=>`<div class="broadcast-mini"><span>${getDate(r)} ${getTime(r)}</span><span>${esc(getPlatform(r))}</span><span>${esc(getProductName(r))}</span><span>${cnt(salesCount(r))}</span><span class="money">${performanceOk(r)?money(sales(r)):"-"}</span></div>`).join("")}</div>`;
  }

  function rowChronoKey(r){
    return `${getDate(r)||"9999-99-99"}T${getTime(r)||"99:99"}`;
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
    if(state.derived.occurrenceMap) return state.derived.occurrenceMap;

    const map=new Map();
    for(const r of state.rows){
      const raw=getRawTitle(r), k=normalize(raw);
      if(!k) continue;
      const x=map.get(k)||{raw,rows:[]};
      x.rows.push(r);
      map.set(k,x);
    }

    state.derived.occurrenceMap=map;
    return map;
  }

  function masterRowsForReview(){
    return state.adminMaster?.rows || state.masterPublic || [];
  }

  function masterProductGroups(){
    if(state.derived.masterGroups) return state.derived.masterGroups;

    const groups=new Map();
    for(const m of masterRowsForReview()){
      const std=clean(m.standard_product_name||m.match_keyword||"미분류");
      const g=groups.get(std)||{standard_product_name:std,aliases:[],master:m};
      g.aliases.push(m);
      groups.set(std,g);
    }

    state.derived.masterGroups=groups;
    return groups;
  }

  function occurrencesForAliases(aliases,standardName=""){
    const keys=(aliases||[]).map(a=>normalize(a.match_keyword)).filter(Boolean);
    const target=productNameKey(standardName);
    const found=new Map();

    // 원본명 alias 매칭
    for(const r of state.rows){
      const raw=normalize(getRawTitle(r));
      if(keys.some(k=>raw===k || raw.includes(k) || k.includes(raw))){
        found.set(clean(r.hsshow_id)||rowChronoKey(r)+raw,r);
      }
    }

    // V2.9.3: 관리자 오버레이 결과의 표준상품명이 같은 방송도 포함.
    // product_master_admin.csv에는 연결되어 있지만 CSV 원본 표준명이 아직 예전 값인 경우를 보완한다.
    if(target){
      for(const r of visibleRows()){
        if(productNameKey(getProductName(r))===target){
          found.set(clean(r.hsshow_id)||rowChronoKey(r)+normalize(getRawTitle(r)),r);
        }
      }
    }
    return [...found.values()];
  }

  function getReviewItems(filter){
    if(filter==="audit"){
      return (state.adminMaster?.audit || []).map(x=>({kind:"audit",audit:x}));
    }

    const occurrence=buildOccurrenceMap(), out=[];
    const groups=masterProductGroups();

    if(filter==="pending" || filter==="auto" || filter==="all"){
      for(const x of occurrence.values()){
        const sample=x.rows.at(-1), m=findMasterForRow(sample);
        const dynamic=!!dynamicRuleForRow(sample);
        const excluded=m&&isExcludedRow(m);
        const confirmed=m&&(/confirmed/i.test(clean(m.review_status))||clean(m.standard_product_name));
        const overriddenCount=x.rows.filter(r=>occurrenceRuleForRow(r)).length;

        // Dynamic titles remain reviewable until every occurrence in the selected range is overridden.
        if(dynamic){
          if(filter!=="auto"){
            const inRange=reviewOccurrences(x.rows);
            const unresolved=inRange.filter(r=>!occurrenceRuleForRow(r));
            if(unresolved.length){
              out.push({kind:"dynamic",raw_title:x.raw,standard_product_name:"",master:null,occurrences:x.rows});
            }
          }
        } else if(!m || (!confirmed&&!excluded)){
          const sampleStatus=clean(sample?.review_status||"");
          const auto=sampleStatus==="자동분류" || clean(sample?.classification_source)==="auto_similarity";
          if(filter==="auto" && !auto) continue;
          if(filter==="pending" && auto) continue;
          out.push({kind:auto?"auto":"pending",raw_title:x.raw,standard_product_name:sample?.standard_product_name||m?.standard_product_name||"",master:m||sample||null,occurrences:x.rows});
        }
      }
    }

    if(filter==="confirmed" || filter==="excluded" || filter==="all"){
      for(const g of groups.values()){
        const excluded=isExcludedRow(g.master);
        if(filter==="confirmed"&&excluded) continue;
        if(filter==="excluded"&&!excluded) continue;
        g.kind=excluded?"excluded":"confirmed";
        g.occurrences=occurrencesForAliases(g.aliases,g.standard_product_name);
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

    // IMPORTANT V2.8.7: date/platform filter is applied to the occurrences themselves.
    const filtered=reviewOccurrences(item.occurrences);
    const filterActive=!!($("#reviewPlatform").value||$("#reviewStart").value||$("#reviewEnd").value);
    if(filterActive && !filtered.length) return false;
    return true;
  }

  function renderReview(){
    const all=getReviewItems(state.reviewFilter), items=all.filter(reviewFilterMatch);
    const pending=getReviewItems("pending").filter(reviewFilterMatch).length;
    const confirmed=getReviewItems("confirmed").filter(reviewFilterMatch).length;
    const auto=getReviewItems("auto").filter(reviewFilterMatch).length;
    const dynamic=getReviewItems("dynamic").filter(reviewFilterMatch).length;
    const excluded=getReviewItems("excluded").filter(reviewFilterMatch).length;

    $("#reviewSummary").innerHTML=`
      <span class="summary-chip clickable ${state.reviewFilter==="pending"?"active":""}" data-summary-filter="pending">미확인 ${pending}건</span>
      <span class="summary-chip clickable ${state.reviewFilter==="confirmed"?"active":""}" data-summary-filter="confirmed">분류완료 ${confirmed}개</span>
      <span class="summary-chip clickable ${state.reviewFilter==="auto"?"active":""}" data-summary-filter="auto">자동분류 ${auto}개</span>
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

    const reviewRangeActive=!!($("#reviewStart").value||$("#reviewEnd").value||$("#reviewPlatform").value);
    const sortedItems=[...items].sort((a,b)=>{
      // V2.9.3: 선택기간이 있으면 방송시간 오름차순, 전체 조회는 최근 방송 우선.
      const ar=reviewOccurrences(a.occurrences||[]); const br=reviewOccurrences(b.occurrences||[]);
      const aKeys=(ar.length?ar:(a.occurrences||[])).map(rowChronoKey).sort();
      const bKeys=(br.length?br:(b.occurrences||[])).map(rowChronoKey).sort();
      const aa=reviewRangeActive?(aKeys[0]||"9999-99-99T99:99"):(aKeys.at(-1)||"");
      const bb=reviewRangeActive?(bKeys[0]||"9999-99-99T99:99"):(bKeys.at(-1)||"");
      const byTime=reviewRangeActive?aa.localeCompare(bb):bb.localeCompare(aa);
      return byTime || clean(a.standard_product_name||a.raw_title).localeCompare(clean(b.standard_product_name||b.raw_title),"ko");
    });
    $("#reviewList").innerHTML=sortedItems.slice(0,700).map(item=>{
      const allOcc=[...(item.occurrences||[])].sort((a,b)=>rowChronoKey(a).localeCompare(rowChronoKey(b)));
      const occ=reviewOccurrences(allOcc);
      const displayOcc=occ.length?occ:allOcc;
      const last=reviewRangeActive?displayOcc[0]:displayOcc.at(-1), aliasCount=item.aliases?.length||0;
      const periodLabel=reviewRangeActive?"선택기간":"전체";
      const badge=item.kind==="pending"?'<span class="badge warn">확인필요</span>':
        item.kind==="auto"?'<span class="badge new">자동분류</span>':
        item.kind==="dynamic"?'<span class="badge dynamic">가변방송</span>':
        item.kind==="excluded"?'<span class="badge hot">제외</span>':'<span class="badge good">분류완료</span>';

      return `<div class="review-card"><div>
        <h4>${badge}${esc(item.standard_product_name||item.raw_title)}</h4>
        ${item.raw_title&&item.standard_product_name?`<div class="small">원본: ${esc(item.raw_title)}</div>`:""}
        <div class="review-meta">${last?`${periodLabel} ${reviewRangeActive?"첫":"최근"} 방송 ${getDate(last)} ${getTime(last)} · ${esc(getPlatform(last))}`:"방송 이력 없음"}${displayOcc.length?` · ${periodLabel} 방송 ${displayOcc.length}회`:""}${aliasCount?` · 연결 원본명 ${aliasCount}개`:""}</div>
        ${item.kind==="dynamic"?'<div class="dynamic-note">이 제목은 방송마다 실제 상품이 달라질 수 있어 자동 대표상품으로 묶지 않습니다.</div>':""}
        ${item.kind==="auto"?`<div class="dynamic-note">자동분류 신뢰도 ${Math.round(num(item.master?.classification_score)*100)}% · 확인 후 영구규칙으로 저장할 수 있습니다.</div>`:""}
      </div><div class="review-actions">
        ${item.kind==="auto"?`<button class="btn good-action" data-confirm-auto="${esc(item.raw_title)}">자동분류 확정</button>`:""}
        ${allOcc.length?`<button class="btn" data-history="${esc(item.standard_product_name||item.raw_title)}" data-kind="${item.kind}">방송이력</button>`:""}
        <button class="btn primary" data-edit-review="${esc(item.standard_product_name||item.raw_title)}" data-kind="${item.kind}">관리</button>
      </div></div>`;
    }).join("")||'<div class="card muted">조건에 맞는 상품이 없습니다.</div>';

    $$("[data-confirm-auto]").forEach(b=>b.onclick=()=>confirmAutoClassification(b.dataset.confirmAuto));
    $$("[data-edit-review]").forEach(b=>b.onclick=()=>openProductDialog(b.dataset.editReview,b.dataset.kind));
    $$("[data-history]").forEach(b=>b.onclick=()=>openHistoryDialog(b.dataset.history,b.dataset.kind));
  }

  function setReviewFilter(filter){
    state.reviewFilter=filter;
    $$(".review-state-filter button").forEach(x=>x.classList.toggle("active",x.dataset.reviewFilter===filter));
    renderReview();
  }

  function findReviewItem(name,kind){
    // V2.9.3: 동일 표준명이 여러 상태에 존재할 때 다른 그룹을 집어오는 문제 방지.
    const exactPool=getReviewItems(kind||"all");
    return exactPool.find(x=>(x.standard_product_name||x.raw_title)===name) ||
           getReviewItems("all").find(x=>x.kind===kind && (x.standard_product_name||x.raw_title)===name) ||
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
          <span class="history-actions"><button type="button" class="btn" data-override-edit="${esc(r.hsshow_id||"")}">실적/원본명 수정</button><button type="button" class="btn ${o?"":"primary"}" data-occurrence-edit="${esc(r.hsshow_id||"")}">${o?"분류 수정":"이 방송 분류"}</button></span>
        </div>`;
      }).join("")}`;
    $("#historyBackBtn").onclick=()=>openHistoryDialog(state.historyContext.name,state.historyContext.kind);
    $$("[data-occurrence-edit]").forEach(b=>b.onclick=()=>openOccurrenceEditor(b.dataset.occurrenceEdit));
    $$("[data-override-edit]").forEach(b=>b.onclick=()=>openOverrideEditor(b.dataset.overrideEdit));
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
    setCategoryValues(o.category_major||r.category_major||"",o.category_middle||r.category_middle||"",o.category_sub||r.category_sub||"");
    if(!(o.category_major||r.category_major) || !(o.category_middle||r.category_middle)) applyCategoryFromProductGroup(); else updateCategoryUiFromCurrent("현재 등록 분류");
    $("#editAction").value="save_occurrence";
    $("#productForm").dataset.occurrenceId=clean(r.hsshow_id);
    $("#productForm").dataset.sourceAliases="[]";
    $("#editBroadcastInfo").textContent=`${getDate(r)} ${getTime(r)} · ${getPlatform(r)} · 이 방송 1건에만 적용`;
    $("#aliasPreview").innerHTML="이 저장은 같은 제목의 다른 방송에는 영향을 주지 않습니다.";
    $("#bulkAliasTools").classList.add("hidden");
    $("#sameSlotWrap")?.classList.remove("hidden");
    if($("#sameSlotWrap")) $("#sameSlotWrap").lastChild.textContent=" 같은 날짜·같은 시간·같은 홈쇼핑사의 방송행 전체를 이 표준상품으로 강제 통일";
    $("#applySameSlot").checked=false;
    renderSimilarSuggestions(getRawTitle(r));
    $("#productDialog").showModal();
    toggleMergeTarget();
  }

  function similarityScore(a,b){
    const A=new Set(normalize(a).split(" ").filter(x=>x.length>1)), B=new Set(normalize(b).split(" ").filter(x=>x.length>1));
    if(!A.size||!B.size) return 0;
    let inter=0; A.forEach(x=>B.has(x)&&inter++);
    return inter/Math.max(A.size,B.size);
  }



  function searchTokens(value){
    return normalize(value)
      .split(" ")
      .map(x=>x.trim())
      .filter(x=>x.length>0);
  }

  function enrichedMasterProduct(product){
    if(!product) return null;

    const target=productNameKey(product.standard_product_name);
    const adminRows=(state.adminMaster?.admin_rows||[]).filter(
      r=>productNameKey(r.standard_product_name)===target
    );
    const effectiveRows=(state.adminMaster?.rows||[]).filter(
      r=>productNameKey(r.standard_product_name)===target
    );

    const pick=(field)=>{
      const fromProduct=clean(product[field]||"");
      if(fromProduct) return fromProduct;

      const adminHit=adminRows.find(r=>clean(r[field]||""));
      if(adminHit) return clean(adminHit[field]||"");

      const effectiveHit=effectiveRows.find(r=>clean(r[field]||""));
      return clean(effectiveHit?.[field]||"");
    };

    return {
      ...product,
      brand:pick("brand"),
      product_group:pick("product_group"),
      main_ingredient:pick("main_ingredient"),
      category_major:pick("category_major"),
      category_middle:pick("category_middle"),
      category_sub:pick("category_sub")
    };
  }

  function masterSearchScore(product, query, rawContext){
    const name=clean(product.standard_product_name||"");
    const brand=clean(product.brand||"");
    const group=clean(product.product_group||"");
    const ingredient=clean(product.main_ingredient||"");

    const q=normalize(query);
    const nameNorm=normalize(name);

    const combined=normalize(
      [name,brand,group,ingredient]
        .filter(Boolean)
        .join(" ")
    );

    const words=[name,brand,group,ingredient]
      .flatMap(v=>clean(v).split(/\s+/))
      .filter(Boolean);

    let score=0;

    if(q){
      if(nameNorm===q){
        score+=1600;
      }else if(nameNorm.startsWith(q)){
        score+=1000;
      }else if(nameNorm.includes(q)){
        score+=800;
      }else if(combined.includes(q)){
        score+=600;
      }

      let bestFuzzy=0;

      for(const word of words){
        bestFuzzy=Math.max(
          bestFuzzy,
          fuzzyRatio(q,word)
        );
      }

      if(bestFuzzy>=0.72){
        score+=Math.round(bestFuzzy*700);
      }

      if(
        !nameNorm.includes(q) &&
        !combined.includes(q) &&
        bestFuzzy<0.72
      ){
        return -1;
      }
    }

    if(rawContext){
      score+=Math.round(
        similarityScore(rawContext,name)*220
      );
    }

    score+=Math.min(
      Number(product.alias_count||0),
      20
    );

    return score;
  }

  function masterSearchResults(query){
    const products=buildAdminSearchProducts();
    const raw=$("#editRawTitle")?.value||"";

    return products
      .map(product=>({
        product,
        score:masterSearchScore(
          product,
          query,
          raw
        )
      }))
      .filter(x=>x.score>0)
      .sort((a,b)=>
        b.score-a.score ||
        clean(a.product.standard_product_name)
          .localeCompare(
            clean(b.product.standard_product_name),
            "ko"
          )
      )
      .slice(0,8);
  }

  function hideMasterSearchDropdown(){
    const box=$("#masterSearchDropdown");
    if(!box) return;
    box.classList.add("hidden");
    box.innerHTML="";
    delete box.dataset.activeIndex;
  }

  function renderMasterSearchDropdown(query,{force=false}={}){
    const action=$("#editAction")?.value||"";
    if(action!=="link_existing"){
      hideMasterSearchDropdown();
      return;
    }

    const box=$("#masterSearchDropdown");
    if(!box) return;

    const q=clean(query||"");
    const results=masterSearchResults(q);

    // product_master_admin.csv에서 관련도 순으로 최대 6개만 표시
    const shown=results.slice(0,6);

    if(!shown.length){
      box.innerHTML=`<div class="master-search-empty">${
        q ? "일치하는 기존 표준상품이 없습니다." : "유사한 기존 표준상품을 찾지 못했습니다."
      }</div>`;
      box.classList.remove("hidden");
      return;
    }

    box.innerHTML=shown.map((x,i)=>{
      const p=x.product;
      const meta=[p.brand,p.product_group,p.main_ingredient].filter(Boolean).join(" · ");
      return `
        <button type="button" class="master-search-item" data-master-name="${esc(p.standard_product_name)}" data-index="${i}">
          <span class="master-search-name">${esc(p.standard_product_name)}</span>
          ${meta?`<span class="master-search-meta">${esc(meta)}</span>`:
            `<span class="master-search-meta">등록된 브랜드/상품군/주원료 정보 없음</span>`}
          <span class="master-search-alias">관리자 연결 ${Number(p.alias_count||0).toLocaleString()}개</span>
        </button>`;
    }).join("");

    box.classList.remove("hidden");
    box.dataset.activeIndex="-1";

    $$("[data-master-name]",box).forEach(btn=>{
      // blur보다 먼저 선택되도록 mousedown 사용
      btn.addEventListener("mousedown",e=>{
        e.preventDefault();
        selectExistingMasterProduct(btn.dataset.masterName);
        hideMasterSearchDropdown();
      });
    });
  }

  function moveMasterSearchSelection(direction){
    const box=$("#masterSearchDropdown");
    if(!box || box.classList.contains("hidden")) return false;

    const items=$$(".master-search-item",box);
    if(!items.length) return false;

    let idx=Number(box.dataset.activeIndex??-1);
    idx=(idx+direction+items.length)%items.length;
    box.dataset.activeIndex=String(idx);

    items.forEach((el,i)=>el.classList.toggle("active",i===idx));
    items[idx].scrollIntoView({block:"nearest"});
    return true;
  }

  function chooseActiveMasterSearchItem(){
    const box=$("#masterSearchDropdown");
    if(!box || box.classList.contains("hidden")) return false;

    const items=$$(".master-search-item",box);
    const idx=Number(box.dataset.activeIndex??-1);
    if(idx<0 || !items[idx]) return false;

    selectExistingMasterProduct(items[idx].dataset.masterName);
    hideMasterSearchDropdown();
    return true;
  }


  function levenshtein(a,b){
    a=normalize(a); b=normalize(b);
    if(a===b) return 0;
    if(!a) return b.length;
    if(!b) return a.length;

    let prev=Array.from({length:b.length+1},(_,i)=>i);

    for(let i=1;i<=a.length;i++){
      const cur=[i];

      for(let j=1;j<=b.length;j++){
        const cost=a[i-1]===b[j-1]?0:1;

        cur[j]=Math.min(
          cur[j-1]+1,
          prev[j]+1,
          prev[j-1]+cost
        );
      }

      prev=cur;
    }

    return prev[b.length];
  }

  function fuzzyRatio(a,b){
    const aa=normalize(a);
    const bb=normalize(b);

    if(!aa || !bb) return 0;

    return 1-(
      levenshtein(aa,bb) /
      Math.max(aa.length,bb.length)
    );
  }

  function buildAdminSearchProducts(){
    const direct=state.adminMaster?.admin_products;

    if(Array.isArray(direct) && direct.length){
      return direct.map(enrichedMasterProduct);
    }

    const rows=state.adminMaster?.admin_rows||[];
    const groups=new Map();

    for(const row of rows){
      const name=clean(row.standard_product_name||"");

      if(!name) continue;
      if(clean(row.enabled||"Y").toUpperCase()==="N") continue;
      if(clean(row.review_status||"").toLowerCase()==="exclude") continue;

      const key=productNameKey(name);
      let group=groups.get(key);

      if(!group){
        group={
          standard_product_name:name,
          brand:"",
          product_group:"",
          main_ingredient:"",
          category_major:"", category_middle:"", category_sub:"",
          alias_count:0,
          aliases:[]
        };
        groups.set(key,group);
      }

      group.alias_count++;
      group.aliases.push(row);

      if(!group.brand && clean(row.brand)){
        group.brand=clean(row.brand);
      }

      if(!group.product_group && clean(row.product_group)){
        group.product_group=clean(row.product_group);
      }

      if(!group.main_ingredient && clean(row.main_ingredient)){ group.main_ingredient=clean(row.main_ingredient); }
      if(!group.category_major && clean(row.category_major)){ group.category_major=clean(row.category_major); }
      if(!group.category_middle && clean(row.category_middle)){ group.category_middle=clean(row.category_middle); }
      if(!group.category_sub && clean(row.category_sub)){ group.category_sub=clean(row.category_sub); }
    }

    return [...groups.values()].map(enrichedMasterProduct);
  }

  function getMasterProductByName(name){
    const target=productNameKey(name);

    if(!target) return null;

    return buildAdminSearchProducts().find(
      p=>productNameKey(p.standard_product_name)===target
    )||null;
  }

  function setMasterMetaLocked(locked){
    ["#editBrand","#editGroup","#editIngredient","#editCategorySubFresh"].forEach(sel=>{
      const el=$(sel); if(!el) return; el.readOnly=!!locked; el.classList.toggle("master-meta-locked",!!locked);
    });
    ["#editCategoryMajor","#editCategoryMiddle","#editCategorySub"].forEach(sel=>{
      const el=$(sel); if(!el) return; el.disabled=!!locked; el.classList.toggle("master-meta-locked",!!locked);
    });
    $("#masterEditTools")?.classList.toggle("hidden",!locked);
  }

  function clearExistingProductSelection(){
    $("#productForm").dataset.selectedMaster="";
    $("#existingProductMeta")?.classList.add("hidden");
    if($("#existingProductMeta")) $("#existingProductMeta").innerHTML="";
    setMasterMetaLocked(false);
  }

  function selectExistingMasterProduct(name,{setAction=true}={}){
    const product=getMasterProductByName(name);
    if(!product){
      clearExistingProductSelection();
      return false;
    }

    $("#editStandardName").value=product.standard_product_name||"";
    $("#editBrand").value=clean(product.brand||"");
    $("#editGroup").value=clean(product.product_group||"");
    $("#editIngredient").value=clean(product.main_ingredient||"");
    setCategoryValues(product.category_major||"",product.category_middle||"",product.category_sub||"");
    updateCategoryUiFromCurrent("기존 표준상품");
    $("#productForm").dataset.selectedMaster=product.standard_product_name||"";
    $("#productSaveError").textContent="";

    if(setAction) $("#editAction").value="link_existing";

    const meta=$("#existingProductMeta");
    if(meta){
      meta.innerHTML=`
        <b>기존 표준상품 선택됨</b>
        <span>표준명: ${esc(product.standard_product_name||"-")}</span>
        <span>브랜드: ${esc(product.brand||"-")}</span>
        <span>상품군: ${esc(product.product_group||"-")}</span>
        <span>주원료: ${esc(product.main_ingredient||"-")}</span>
        <span>분류: ${esc([product.category_major,product.category_middle,product.category_sub].filter(Boolean).join(" > ")||"-")}</span>
        <span>연결 원본명: ${Number(product.alias_count||0).toLocaleString()}개</span>`;
      meta.classList.remove("hidden");
    }

    setMasterMetaLocked(true);
    $("#mergeTargetWrap").classList.add("hidden");
    $("#editStandardName").placeholder="기존 표준상품 검색";
    return true;
  }

  function syncExistingProductSelection(){
    const action=$("#editAction")?.value||"";
    const name=clean($("#editStandardName")?.value||"");

    if(action!=="link_existing"){
      clearExistingProductSelection();
      return;
    }

    if(!name){
      clearExistingProductSelection();
      return;
    }

    if(!selectExistingMasterProduct(name,{setAction:false})){
      clearExistingProductSelection();
    }
  }

  function renderSimilarSuggestions(raw){
    const products=buildAdminSearchProducts();
    const top=products.map(p=>({name:p.standard_product_name,score:similarityScore(raw,p.standard_product_name)}))
      .filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5);
    $("#similarSuggestions").innerHTML=top.length?`<div class="suggestion-title">유사 기존상품 추천</div><div class="suggestion-buttons">${top.map(x=>`<button type="button" class="suggestion-btn" data-suggest="${esc(x.name)}">${esc(x.name)}</button>`).join("")}</div>`:"";
    $$("[data-suggest]").forEach(b=>b.onclick=()=>selectExistingMasterProduct(b.dataset.suggest));
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
    invalidateDerived();
    $("#adminState").textContent=`관리자 모드 · ${state.adminMaster.product_count||0}개 상품`;
    $("#adminState").classList.add("on");
    $("#adminBtn").textContent="관리자 로그아웃";
    renderMasterDatalist();
  }

  function renderMasterDatalist(){
    const names=buildAdminSearchProducts()
      .map(p=>clean(p.standard_product_name))
      .filter(Boolean);
    $("#masterProductNames").innerHTML=names.map(n=>`<option value="${esc(n)}"></option>`).join("");
  }

  function logoutAdmin(){
    state.adminPassword=""; state.adminMaster=null; sessionStorage.removeItem("hsfm_admin_password");
    invalidateDerived();
    $("#adminState").textContent="조회 모드";
    $("#adminState").classList.remove("on");
    $("#adminBtn").textContent="관리자 로그인";
    fillCommonFilters();
    renderGlobalKpis();
    renderActiveTab();
  }

  function openProductDialog(name,kind){
    if(!state.adminPassword){ adminLogin(); return; }
    const item=findReviewItem(name,kind); if(!item) return;
    const last=[...item.occurrences].sort((a,b)=>clean(b.start_datetime).localeCompare(clean(a.start_datetime)))[0];
    const m=item.master||item.aliases?.[0]||{};
    delete $("#productForm").dataset.occurrenceId;
    $("#productForm").dataset.rawOccurrenceId=clean(last?.hsshow_id||"");

    $("#productDialogTitle").textContent=kind==="pending"?"미확인 상품 분류":kind==="auto"?"자동분류 확인":kind==="dynamic"?"가변형 방송명 관리":"기존 상품 관리";
    $("#editRawTitle").value=item.raw_title||m.match_keyword||"";
    $("#editRawDisplay").value=item.raw_title||m.match_keyword||"(표준 상품 전체)";
    $("#editSourceStandard").value=item.standard_product_name||m.standard_product_name||"";
    $("#editStandardName").value=item.standard_product_name||m.standard_product_name||"";
    $("#editBrand").value=m.brand||""; $("#editGroup").value=m.product_group||""; $("#editIngredient").value=m.main_ingredient||"";
    setCategoryValues(m.category_major||last?.category_major||"",m.category_middle||last?.category_middle||"",m.category_sub||last?.category_sub||"");
    $("#editRawDisplay").disabled=true; $("#unlockRawTitleBtn").textContent="원본명 수정"; $("#sameSlotWrap")?.classList.add("hidden");
    $("#editAction").value=(kind==="pending"||kind==="auto")?"link_existing":kind==="dynamic"?"mark_dynamic_title":kind==="excluded"?"restore":"update_product";
    clearExistingProductSelection();
    if((m.category_major||last?.category_major) && (m.category_middle||last?.category_middle)) updateCategoryUiFromCurrent("현재 등록 분류");
    else applyCategoryFromProductGroup();
    $("#editBroadcastInfo").textContent=last?`최근 방송: ${getDate(last)} ${getTime(last)} · ${getPlatform(last)} · 전체 ${item.occurrences.length}회`:"방송 이력 없음";

    const aliases=item.aliases||[];
    $("#productForm").dataset.sourceAliases=JSON.stringify(
      aliases.map(a=>clean(a.match_keyword||"")).filter(Boolean)
    );
    $("#aliasPreview").innerHTML=aliases.length?`<b>현재 연결된 원본명 ${aliases.length}개</b>${aliases.map(a=>`<label class="alias-row"><input type="checkbox" class="alias-check" value="${esc(a.match_keyword||"")}"><span>${esc(a.match_keyword||"")}</span><span class="small">${esc(a.admin_action||"")}</span></label>`).join("")}`:"기존 연결 원본명 없음";
    $("#bulkAliasTools").classList.toggle("hidden",aliases.length<1);
    $("#bulkAliasTarget").value="";
    if($("#unlockMasterMetaBtn")){
      $("#unlockMasterMetaBtn").disabled=false;
      $("#unlockMasterMetaBtn").textContent="정보 수정";
    }
    renderSimilarSuggestions(item.raw_title||item.standard_product_name||"");
    $("#mergeTarget").value="";
    $("#productSaveError").textContent="";
    $("#productDialog").showModal();
    toggleMergeTarget();
  }

  function toggleMergeTarget(){
    const action=$("#editAction").value;
    $("#mergeTargetWrap").classList.toggle("hidden",action!=="merge_product");

    if(action==="mark_dynamic_title"){
      $("#editStandardName").placeholder="가변형 제목은 대표 표준상품명을 지정하지 않습니다.";
    }else if(action==="link_existing"){
      $("#editStandardName").placeholder="기존 표준상품 검색";
    }else{
      $("#editStandardName").placeholder="실제 동일 제품의 대표 이름";
    }

    if(action==="link_existing"){
      const current=clean($("#editStandardName").value||"");
      if(current && getMasterProductByName(current)){
        selectExistingMasterProduct(current,{setAction:false});
      }else{
        clearExistingProductSelection();
        renderMasterSearchDropdown(current,{force:true});
      }
    }else{
      hideMasterSearchDropdown();
      clearExistingProductSelection();
    }
  }

  async function saveProductAdmin(){
    const action=$("#editAction").value, raw=$("#editRawTitle").value, source=$("#editSourceStandard").value, standard=$("#editStandardName").value;
    let sourceAliases=[];
    try{
      sourceAliases=JSON.parse($("#productForm").dataset.sourceAliases||"[]");
    }catch{
      sourceAliases=[];
    }

    if(action==="link_existing"){
      const selectedAdmin=buildAdminSearchProducts().find(
        p=>productNameKey(p.standard_product_name)===productNameKey(standard)
      );
      if(!selectedAdmin){
        $("#productSaveError").textContent=
          "기존 상품으로 연결하려면 product_master_admin.csv에 등록된 표준상품을 검색하여 선택하세요.";
        return;
      }
    }

    const body={
      action,
      raw_title:raw,
      match_keyword:raw,
      standard_product_name:standard,
      source_standard_product_name:source,
      source_aliases:sourceAliases,
      brand:$("#editBrand").value,
      product_group:$("#editGroup").value,
      main_ingredient:$("#editIngredient").value,
      category_major:$("#editCategoryMajor").value,
      category_middle:$("#editCategoryMiddle").value,
      category_sub:categorySubValue(),
      manual_lock:"Y"
    };

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
        body.raw_title_original=clean(r.raw_title_original||r.raw_title||"");
        body.raw_title_corrected=$("#editRawDisplay").disabled?clean(r.raw_title_corrected||""):clean($("#editRawDisplay").value);
        if($("#applySameSlot")?.checked){
          body.action="save_occurrence_batch";
          body.hsshow_ids=state.rows.filter(x=>getDate(x)===getDate(r)&&getTime(x)===getTime(r)&&getPlatform(x)===getPlatform(r)).map(x=>clean(x.hsshow_id)).filter(Boolean);
        }
      }
    }

    $("#productSaveError").textContent="";
    try{
      const r=await fetch(`${API}/save`,{method:"POST",headers:{"Content-Type":"application/json","X-Admin-Password":state.adminPassword},body:JSON.stringify(body)});
      const data=await r.json();
      if(!r.ok||!data.ok) throw new Error(data.error||`HTTP ${r.status}`);

      const rawDisplay=$("#editRawDisplay");
      const rawOccurrenceId=$("#productForm").dataset.rawOccurrenceId||"";
      if(action!=="save_occurrence" && action!=="save_occurrence_batch" && rawOccurrenceId && rawDisplay && !rawDisplay.disabled && clean(rawDisplay.value)!==clean(raw)){
        const rr=await fetch(`${API}/save`,{method:"POST",headers:{"Content-Type":"application/json","X-Admin-Password":state.adminPassword},body:JSON.stringify({action:"save_raw_title_override",hsshow_id:rawOccurrenceId,raw_title_corrected:clean(rawDisplay.value),note:"상품확인 화면 원본명 수동 수정"})});
        const rd=await rr.json(); if(!rr.ok||!rd.ok) throw new Error(rd.error||`원본명 수정 HTTP ${rr.status}`);
        const local=state.rows.find(x=>clean(x.hsshow_id)===clean(rawOccurrenceId));
        if(local){local.raw_title_original=local.raw_title_original||local.raw_title||"";local.raw_title_corrected=clean(rawDisplay.value);}
      }
      // V2.9.5: GitHub/Worker 재조회가 수 초 지연돼도 방금 저장한 규칙을
      // 현재 화면에 즉시 반영한다. 이후 loadAdminMaster()로 서버 상태와 다시 동기화한다.
      if(body.action!=="save_occurrence" && body.action!=="save_occurrence_batch" && body.action!=="exclude" && body.action!=="mark_dynamic_title") {
        state.adminMaster=state.adminMaster||{};
        const optimistic={...body,review_status:"confirmed",enabled:"Y",manual_lock:"Y"};
        const current=Array.isArray(state.adminMaster.admin_rows)?state.adminMaster.admin_rows:[];
        const key=normalize(optimistic.match_keyword||optimistic.raw_title||"");
        state.adminMaster.admin_rows=[optimistic,...current.filter(x=>normalize(x.match_keyword||x.raw_title||"")!==key)];
        invalidateDerived();
      }

      $("#productDialog").close();
      if(state.activeTab==="review") renderReview();
      showStatus("저장 완료 · 최신 분류정보를 동기화하고 있습니다.");

      loadAdminMaster()
        .then(()=>{
          fillCommonFilters();
          renderGlobalKpis();
          if(state.activeTab==="review") renderReview();
          else renderActiveTab();
          showStatus("관리자 결정이 HOMESHOPING-MONITOR에 영구 저장되었습니다.");
        })
        .catch(err=>showStatus(`저장은 완료되었지만 화면 동기화 실패: ${err.message}`,"error"));
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


  function categoryOptions(select,values,value=""){
    const el=typeof select==="string"?$(select):select; if(!el) return;
    el.innerHTML='<option value="">전체</option>'+[...new Set(values.filter(Boolean))].map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if(value && [...el.options].some(o=>o.value===value)) el.value=value;
  }

  function categoryUsesFreeText(major="", middle=""){
    // 기존 직접입력 분류는 그대로 유지.
    // V2.10.0: 일반식품 > 축산물 > 기타도 직접입력으로 사용.
    return major==="신선식품"
      || (major==="건강식품" && middle==="개별인정형원료")
      || (major==="일반식품" && middle==="축산물" && clean($("#editCategorySub")?.value)==="기타");
  }

  function categorySubValue(){
    const major=$("#editCategoryMajor")?.value||"";
    const middle=$("#editCategoryMiddle")?.value||"";
    if(major==="일반식품" && middle==="축산물" && clean($("#editCategorySub")?.value)==="기타"){
      return clean($("#editCategorySubFresh")?.value||"");
    }
    return categoryUsesFreeText(major,middle)
      ? clean($("#editCategorySubFresh")?.value||"")
      : clean($("#editCategorySub")?.value||"");
  }

  function setCategoryValues(major="",middle="",sub=""){
    categoryOptions("#editCategoryMajor",Object.keys(CATEGORY_TREE),major);
    const mids=major?Object.keys(CATEGORY_TREE[major]||{}):[];
    categoryOptions("#editCategoryMiddle",mids,middle);
    const subs=major&&middle?(CATEGORY_TREE[major]?.[middle]||[]):[];
    // 축산물은 '기타' 선택 시에만 직접입력, 나머지 4개는 고정 선택.
    const livestockOther =
      major==="일반식품" &&
      middle==="축산물" &&
      clean(sub)==="기타";
    const freeText =
      major==="신선식품" ||
      (major==="건강식품" && middle==="개별인정형원료") ||
      livestockOther;
    categoryOptions("#editCategorySub",subs,freeText && !livestockOther ? "" : sub);
    $("#editCategorySubSelectWrap")?.classList.remove("hidden");
    $("#editCategorySubFreshWrap")?.classList.toggle("hidden",!freeText);
    const direct=$("#editCategorySubFresh");
    if(direct){
      direct.value=freeText?clean(sub==="기타" ? "" : sub):"";
      direct.placeholder=(major==="일반식품" && middle==="축산물")
        ? "기타 축산물 소분류를 직접 입력"
        : (major==="건강식품" && middle==="개별인정형원료"
          ? "예: 저분자콜라겐펩타이드, 루바브뿌리추출물"
          : "예: 사과, 쌀, 고등어, 한우");
    }
    if($("#editCategorySub")){
      $("#editCategorySub").disabled=!subs.length;
    }
  }

  function groupSearchCandidates(query){
    const q=normalize(query);
    const qc=q.replace(/\s+/g,"");
    if(qc.length<1) return [];

    const found=new Map();
    const add=(label,major="",middle="",sub="",source="")=>{
      const text=clean(label);
      if(!text) return;
      const key=[text,major,middle,sub].map(clean).join("|");
      if(found.has(key)) return;
      const nc=normalize(text).replace(/\s+/g,"");
      const middlec=normalize(middle).replace(/\s+/g,"");
      const subc=normalize(sub).replace(/\s+/g,"");
      let score=0;
      if(nc===qc) score=1000;
      else if(nc.startsWith(qc)) score=850;
      else if(nc.includes(qc)) score=700;
      else if(subc.startsWith(qc)) score=820;
      else if(subc.includes(qc)) score=680;
      else if(middlec.startsWith(qc)) score=620;
      else if(middlec.includes(qc)) score=520;
      if(!score) return;
      found.set(key,{label:text,major:clean(major),middle:clean(middle),sub:clean(sub),source,score});
    };

    // 식품 분류 기준 자체를 검색 대상으로 사용한다.
    for(const [major,middles] of Object.entries(CATEGORY_TREE)){
      for(const [middle,subs] of Object.entries(middles)){
        add(middle,major,middle,"","중분류");
        for(const sub of (subs||[])) add(sub,major,middle,sub,"식품유형");
      }
    }

    // 기존 관리자/마스터 데이터의 상품군도 함께 검색한다.
    const pool=[...(state.adminMaster?.rows||[]),...(state.masterPublic||[]),...(state.rows||[])];
    for(const r of pool){
      const label=clean(r.product_group);
      const major=clean(r.category_major), middle=clean(r.category_middle), sub=clean(r.category_sub);
      if(label) add(label,major,middle,sub,"기존 상품군");
      // 신선식품/개별인정형에서 관리자가 직접 입력한 식품유형도
      // 다음 상품 등록 때 검색어로 재사용한다. 선택 시 기존 상품군은 유지하고 분류만 자동 적용한다.
      if(sub && categoryUsesFreeText(major,middle)) add(sub,major,middle,sub,"학습된 직접입력 분류");
    }

    return [...found.values()]
      .sort((a,b)=>b.score-a.score || a.label.localeCompare(b.label,"ko"))
      .slice(0,10);
  }

  function hideGroupSearchDropdown(){
    const box=$("#groupSearchDropdown");
    if(!box) return;
    box.classList.add("hidden");
    box.innerHTML="";
  }

  function chooseGroupCandidate(candidate){
    if(!candidate) return;
    const currentGroup=clean($("#editGroup").value);
    if(candidate.source!=="학습된 직접입력 분류" || !currentGroup) $("#editGroup").value=candidate.label;
    if(candidate.major&&candidate.middle){
      setCategoryValues(candidate.major,candidate.middle,candidate.sub||"");
      showCategoryAutoSummary({
        major:candidate.major,
        middle:candidate.middle,
        sub:candidate.sub||"",
        source:candidate.source||"부분 검색 자동매칭"
      });
    }else{
      applyCategoryFromProductGroup();
    }
    hideGroupSearchDropdown();
  }

  function renderGroupSearchDropdown(query){
    const box=$("#groupSearchDropdown");
    if(!box) return;
    const q=clean(query);
    if(!q){ hideGroupSearchDropdown(); return; }
    const results=groupSearchCandidates(q);
    if(!results.length){ hideGroupSearchDropdown(); return; }
    box.innerHTML=results.map((x,i)=>`
      <button type="button" class="group-search-item" data-group-index="${i}">
        <span class="group-search-name">${esc(x.label)}</span>
        <span class="group-search-meta">${esc([x.major,x.middle,x.sub].filter(Boolean).join(" › "))}</span>
      </button>`).join("");
    box.classList.remove("hidden");
    $$('[data-group-index]',box).forEach(btn=>{
      btn.addEventListener("mousedown",e=>{
        e.preventDefault();
        chooseGroupCandidate(results[Number(btn.dataset.groupIndex)]);
      });
    });
  }

  function categoryTupleFromGroup(group,ingredient=""){
    const g=normalize(group), ing=normalize(ingredient);
    const compact=v=>normalize(v).replace(/\s+/g,"");
    const gc=compact(group);
    if(!g) return null;

    // 1) 이미 관리자/마스터/방송 데이터에 확정된 같은 기존상품군이 있으면 가장 많이 쓰인 분류를 재사용한다.
    const pool=[...(state.adminMaster?.rows||[]),...(state.masterPublic||[]),...(state.rows||[])];
    const counts=new Map();
    for(const r of pool){
      if(normalize(r.product_group)!==g) continue;
      const major=clean(r.category_major), middle=clean(r.category_middle), sub=clean(r.category_sub);
      if(!major||!middle) continue;
      const key=JSON.stringify([major,middle,sub]);
      counts.set(key,(counts.get(key)||0)+1);
    }
    if(counts.size){
      const [key]=[...counts].sort((a,b)=>b[1]-a[1])[0];
      const [major,middle,sub]=JSON.parse(key);
      return {major,middle,sub,source:"기존 등록상품군"};
    }

    // 1-1) 신선식품/개별인정형에서 과거 직접 입력한 식품유형 자체를 입력해도 분류 재사용.
    // 예: 사과 -> 신선식품 > 농산물 > 사과
    const learned=[];
    for(const r of pool){
      const major=clean(r.category_major), middle=clean(r.category_middle), sub=clean(r.category_sub);
      if(!sub || !categoryUsesFreeText(major,middle)) continue;
      if(compact(sub)===gc || (gc.length>=2 && compact(sub).includes(gc)))
        learned.push({major,middle,sub,source:"학습된 직접입력 분류"});
    }
    const learnedUnique=new Map(learned.map(x=>[[x.major,x.middle,x.sub].join("|"),x]));
    if(learnedUnique.size===1) return [...learnedUnique.values()][0];

    // 2) 식품공전/건강식품 분류표의 중분류·식품유형과 기존상품군명이 직접 일치하는 경우.
    // 특수문자/띄어쓰기 차이(과‧채주스↔과채주스, 기타 식용유지가공품↔기타식용유지가공품)도 동일 취급한다.
    const aliases={
      "과채주스":"과채주스",
      "과채음료":"과채음료",
      "기타식용유지가공품":"기타식용유지가공품",
      "인삼홍삼음료":"인삼홍삼음료"
    };
    for(const [major,middles] of Object.entries(CATEGORY_TREE)){
      for(const [middle,subs] of Object.entries(middles)){
        const mc=compact(middle);
        if(mc===gc){ return {major,middle,sub:"",source:"분류 기준 자동매칭"}; }
        const sub=(subs||[]).find(x=>{
          const xc=compact(x);
          return xc===gc || (aliases[xc] && aliases[gc] && aliases[xc]===aliases[gc]) || (xc.length>2 && gc.includes(xc));
        });
        if(sub) return {major,middle,sub,source:"식품유형 자동매칭"};
      }
    }

    // 2-1) 전체 식품유형을 다 입력하지 않아도, 부분 문자열이 유일하게 한 항목을 가리키면 자동 분류한다.
    // 예: "과채주" -> "과채주스"가 유일하면 즉시 분류. 후보가 여러 개면 자동 확정하지 않고 검색목록만 보여준다.
    if(gc.length>=2){
      const partial=[];
      for(const [major,middles] of Object.entries(CATEGORY_TREE)){
        for(const [middle,subs] of Object.entries(middles)){
          const mc=compact(middle);
          if(mc.includes(gc)) partial.push({major,middle,sub:"",source:"중분류 부분매칭"});
          for(const sub of (subs||[])){
            const sc=compact(sub);
            if(sc.includes(gc)) partial.push({major,middle,sub,source:"식품유형 부분매칭"});
          }
        }
      }
      const unique=new Map(partial.map(x=>[[x.major,x.middle,x.sub].join("|"),x]));
      if(unique.size===1) return [...unique.values()][0];
    }

    // 3) 대표적인 기존 상품군 명칭 보정.
    if(g.includes("건강기능식품") || g.includes("건강식품")){
      const nutrient=CATEGORY_TREE["건강식품"]["영양성분"]||[];
      const functional=CATEGORY_TREE["건강식품"]["고시형원료"]||[];
      const n=nutrient.find(x=>ing && (ing.includes(normalize(x)) || normalize(x).includes(ing)));
      if(n) return {major:"건강식품",middle:"영양성분",sub:n,source:"건강식품 영양성분 자동분류"};
      const f=functional.find(x=>ing && (ing.includes(normalize(x)) || normalize(x).includes(ing)));
      return {major:"건강식품",middle:f?"고시형원료":"",sub:f||"",source:"건강식품 자동분류"};
    }
    if(g.includes("농산")) return {major:"신선식품",middle:"농산물",sub:"",source:"신선식품 자동분류"};
    if(g.includes("수산")) return {major:"신선식품",middle:"수산물",sub:"",source:"신선식품 자동분류"};
    if(g.includes("축산")) return {major:"신선식품",middle:"축산물",sub:"",source:"신선식품 자동분류"};
    return null;
  }

  function showCategoryAutoSummary(tuple){
    const box=$("#categoryAutoSummary"), wrap=$("#manualCategoryWrap");
    if(!box||!wrap) return;
    if(!tuple || !tuple.major || !tuple.middle){
      box.classList.add("hidden");
      wrap.classList.remove("hidden");
      return;
    }
    box.innerHTML=`<div><b>상품군 기준 자동 분류</b><span>${esc(tuple.major)} › ${esc(tuple.middle)}${tuple.sub?` › ${esc(tuple.sub)}`:""}</span><small>${esc(tuple.source||"")}</small></div><button type="button" class="btn" id="categoryManualOverrideBtn">분류 직접 수정</button>`;
    box.classList.remove("hidden");
    wrap.classList.add("hidden");
    $("#categoryManualOverrideBtn").onclick=()=>{ box.classList.add("hidden"); wrap.classList.remove("hidden"); };
  }

  function updateCategoryUiFromCurrent(source="현재 분류"){
    const major=clean($("#editCategoryMajor")?.value), middle=clean($("#editCategoryMiddle")?.value), sub=categorySubValue();
    if(major&&middle) showCategoryAutoSummary({major,middle,sub,source});
    else showCategoryAutoSummary(null);
  }

  function applyCategoryFromProductGroup(){
    const tuple=categoryTupleFromGroup($("#editGroup")?.value||"",$("#editIngredient")?.value||"");
    if(tuple && tuple.major && tuple.middle){
      setCategoryValues(tuple.major,tuple.middle,tuple.sub||"");
      showCategoryAutoSummary(tuple);
      return true;
    }
    showCategoryAutoSummary(null);
    return false;
  }

  function refreshEditCategoryChildren(level){
    const major=$("#editCategoryMajor").value, middle=level==="major"?"":$("#editCategoryMiddle").value;
    setCategoryValues(major,middle,"");
  }

  function refreshLivestockOtherInput(){
    const major=clean($("#editCategoryMajor")?.value);
    const middle=clean($("#editCategoryMiddle")?.value);
    const sub=clean($("#editCategorySub")?.value);
    if(major!=="일반식품" || middle!=="축산물") return;
    const wrap=$("#editCategorySubFreshWrap");
    const direct=$("#editCategorySubFresh");
    if(!wrap || !direct) return;
    const other=sub==="기타";
    wrap.classList.toggle("hidden",!other);
    direct.placeholder="기타 축산물 소분류를 직접 입력";
    if(!other) direct.value="";
  }
  document.addEventListener("change", e=>{
    if(e.target?.id==="editCategorySub"){
      refreshLivestockOtherInput();
    }
  });

  function fillCategoryFilterOptions(){
    const rows=visibleRows();
    const majors=[...new Set([...Object.keys(CATEGORY_TREE),...rows.map(r=>clean(r.category_major)).filter(Boolean)])];
    const keepMajor=$("#perfMajor")?.value||""; categoryOptions("#perfMajor",majors,keepMajor);
    refreshPerfCategoryChildren();
  }
  function refreshPerfCategoryChildren(){
    const rows=visibleRows(), major=$("#perfMajor").value, keepMiddle=$("#perfMiddle")?.value||"", keepSub=$("#perfSub")?.value||"";
    const mids=[...new Set([...(major?Object.keys(CATEGORY_TREE[major]||{}):[]),...rows.filter(r=>!major||clean(r.category_major)===major).map(r=>clean(r.category_middle)).filter(Boolean)])];
    categoryOptions("#perfMiddle",mids,keepMiddle);
    const middle=$("#perfMiddle").value;
    const subs=[...new Set([...(major&&middle?(CATEGORY_TREE[major]?.[middle]||[]):[]),...rows.filter(r=>(!major||clean(r.category_major)===major)&&(!middle||clean(r.category_middle)===middle)).map(r=>clean(r.category_sub)).filter(Boolean)])];
    categoryOptions("#perfSub",subs,keepSub);
    $("#perfSub").disabled=!subs.length;
  }

  async function confirmAutoClassification(raw){
    if(!state.adminPassword){ adminLogin(); return; }
    const item=getReviewItems("auto").find(x=>x.raw_title===raw); if(!item) return;
    const sample=item.occurrences?.[0]||{};
    const body={action:"link_existing",raw_title:raw,match_keyword:raw,standard_product_name:item.standard_product_name||sample.standard_product_name,brand:sample.brand||item.master?.brand||"",product_group:sample.product_group||item.master?.product_group||"",main_ingredient:sample.main_ingredient||item.master?.main_ingredient||"",category_major:sample.category_major||item.master?.category_major||"",category_middle:sample.category_middle||item.master?.category_middle||"",category_sub:sample.category_sub||item.master?.category_sub||"",manual_lock:"Y"};
    try{ const r=await fetch(`${API}/save`,{method:"POST",headers:{"Content-Type":"application/json","X-Admin-Password":state.adminPassword},body:JSON.stringify(body)}); const data=await r.json(); if(!r.ok||!data.ok) throw new Error(data.error||`HTTP ${r.status}`); await loadAdminMaster(); renderReview(); showStatus("자동분류를 영구 규칙으로 확정했습니다."); }catch(e){ showStatus(e.message,"error"); }
  }

  function openOverrideEditor(id){
    if(!state.adminPassword){ adminLogin(); return; }
    const r=state.rows.find(x=>clean(x.hsshow_id)===clean(id)); if(!r) return;
    $("#historyDialog").close(); $("#overrideForm").dataset.hsshowId=clean(id);
    $("#overrideInfo").textContent=`${getDate(r)} ${getTime(r)} · ${getPlatform(r)} · ${getProductName(r)}`;
    $("#overrideSalesCnt").value=clean(r.sales_cnt||""); $("#overrideSalesAmt").value=clean(r.sales_amt||"");
    $("#overrideRawTitle").value=clean(r.raw_title_corrected||""); $("#overrideNote").value=""; $("#overrideError").textContent="";
    $("#overrideDialog").showModal();
  }
  async function saveOverride(){
    const id=$("#overrideForm").dataset.hsshowId||""; if(!id) return;
    const body={action:"save_performance_override",hsshow_id:id,sales_cnt:$("#overrideSalesCnt").value,sales_amt:$("#overrideSalesAmt").value,raw_title_corrected:$("#overrideRawTitle").value,note:$("#overrideNote").value};
    try{
      const r=await fetch(`${API}/save`,{method:"POST",headers:{"Content-Type":"application/json","X-Admin-Password":state.adminPassword},body:JSON.stringify(body)});
      const data=await r.json(); if(!r.ok||!data.ok) throw new Error(data.error||`HTTP ${r.status}`);
      const row=state.rows.find(x=>clean(x.hsshow_id)===clean(id));
      if(row){
        if(clean(body.sales_cnt)!=="") row.sales_cnt=body.sales_cnt;
        if(clean(body.sales_amt)!=="") row.sales_amt=body.sales_amt;
        if(clean(body.raw_title_corrected)!==""){ row.raw_title_original=row.raw_title_original||row.raw_title||""; row.raw_title_corrected=body.raw_title_corrected; }
        row.performance_status="manual"; row.performance_source="manual_override";
      }
      invalidateDerived(); $("#overrideDialog").close(); renderGlobalKpis(); renderActiveTab();
      showStatus("수동 보정값을 저장했습니다. 화면에는 즉시 반영되며 다음 자동수집 이후에도 유지됩니다.");
    }catch(e){ $("#overrideError").textContent=e.message; }
  }

  function setupDateInput(sel,onApply){
    const el=$(sel); if(!el) return;
    el.type="text"; el.placeholder="YYYY-MM-DD";
    const valid=()=>/^\d{4}-\d{2}-\d{2}$/.test(el.value);
    el.addEventListener("change",()=>{ if(valid()) onApply(); });
    el.addEventListener("keydown",e=>{
      if(e.key==="Enter" && valid()){ e.preventDefault(); onApply(); }
      if(e.key==="ArrowDown" && e.altKey){ e.preventDefault(); openDatePicker(el,onApply); }
    });
    let b=el.nextElementSibling;
    if(!b?.classList?.contains("date-picker-open")){
      b=document.createElement("button");
      b.type="button"; b.className="date-picker-open"; b.textContent="▣";
      el.insertAdjacentElement("afterend",b);
    }
    b.type="button";
    b.title="달력에서 날짜 선택";
    b.setAttribute("aria-label","달력에서 날짜 선택");
    b.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); openDatePicker(el,onApply); };
  }
  function openDatePicker(el,onApply){
    datePickerState.target=el; datePickerState.onApply=onApply; datePickerState.selected=el.value||keyDate(today()); datePickerState.month=parseDate(datePickerState.selected); renderDatePicker(); $("#datePickerDialog").showModal();
  }
  function closeDatePicker(){ $("#datePickerDialog").close(); }
  function renderDatePicker(){
    const m=datePickerState.month, y=m.getFullYear(), mo=m.getMonth(); $("#datePickerMonth").textContent=`${y}년 ${mo+1}월`;
    const first=new Date(y,mo,1), start=addDays(first,-first.getDay());
    let html=['일','월','화','수','목','금','토'].map(x=>`<b class="dow">${x}</b>`).join('');
    for(let i=0;i<42;i++){ const d=addDays(start,i), k=keyDate(d), other=d.getMonth()!==mo; html+=`<button type="button" class="date-cell ${other?'other':''} ${k===datePickerState.selected?'selected':''}" data-date-cell="${k}">${d.getDate()}</button>`; }
    $("#datePickerGrid").innerHTML=html; $$("[data-date-cell]").forEach(b=>b.onclick=()=>{datePickerState.selected=b.dataset.dateCell; renderDatePicker();});
  }
  function confirmDatePicker(){ if(datePickerState.target){ datePickerState.target.value=datePickerState.selected; } closeDatePicker(); if(datePickerState.onApply) datePickerState.onApply(); }

  function renderWatch(){
    $("#watchKeywords").innerHTML=state.watchKeywords.map(k=>`<span class="chip">${esc(k)}<button data-rm-watch="${esc(k)}">✕</button></span>`).join("")||'<span class="muted">등록된 키워드가 없습니다.</span>';
    $$("[data-rm-watch]").forEach(b=>b.onclick=()=>{state.watchKeywords=state.watchKeywords.filter(k=>k!==b.dataset.rmWatch);saveWatch();renderWatch();});
    const matched=visibleRows().filter(isWatched), byProd=new Map();
    for(const r of matched){ const k=getProductName(r), x=byProd.get(k)||[]; x.push(r); byProd.set(k,x); }
    $("#watchResults").innerHTML=[...byProd].map(([name,rs])=>{const m=metricsForRows(rs);return `<div class="review-card"><div><h4>${esc(name)}</h4><div class="review-meta">방송 ${rs.length}회 · 매출 ${money(m.sales)} · 평균 ${money(m.avg)}</div></div></div>`;}).join("")||'<div class="card muted">관심 키워드와 일치하는 방송이 없습니다.</div>';
  }

  function fillCommonFilters(){
    const rows=visibleRows();
    fillSelect("#calendarPlatform",rows.map(getPlatform));
    fillSelect("#perfPlatform",rows.map(getPlatform));
    fillSelect("#reviewPlatform",state.rows.map(getPlatform));
    fillCategoryFilterOptions();
  }

  function renderActiveTab(){
    if(state.activeTab==="calendar") renderCalendar();
    else if(state.activeTab==="performance") renderPerformance();
    else if(state.activeTab==="review") renderReview();
    else if(state.activeTab==="watch") renderWatch();
  }

  function renderAll(){
    fillCommonFilters();
    renderGlobalKpis();
    renderActiveTab();
  }

  async function loadData(){
    try{
      const [csv,master,pending]=await Promise.all([
        fetchText("../data/food_broadcasts.csv"),
        fetchText("../data/product_master.csv").catch(()=>""), fetchJsonSafe("../reports/pending_products.json")
      ]);
      state.rows=parseCSV(csv);
      state.masterPublic=parseCSV(master);
      state.pending=Array.isArray(pending)?pending:(pending?.items||[]);
      invalidateDerived();
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
    $$(".tab").forEach(b=>b.onclick=()=>{
      state.activeTab=b.dataset.tab;
      $$(".tab").forEach(x=>x.classList.toggle("active",x===b));
      $$(".tab-panel").forEach(p=>p.classList.toggle("active",p.id===`${state.activeTab}Panel`));
      requestAnimationFrame(renderActiveTab);
    });
    $$("[data-view]").forEach(b=>b.onclick=()=>{state.view=b.dataset.view;renderCalendar();});
    $("#prevPeriod").onclick=()=>{state.cursor=state.view==="month"?new Date(state.cursor.getFullYear(),state.cursor.getMonth()-1,1):state.view==="week"?addDays(state.cursor,-7):addDays(state.cursor,-1);renderCalendar();};
    $("#nextPeriod").onclick=()=>{state.cursor=state.view==="month"?new Date(state.cursor.getFullYear(),state.cursor.getMonth()+1,1):state.view==="week"?addDays(state.cursor,7):addDays(state.cursor,1);renderCalendar();};
    $("#todayBtn").onclick=()=>{state.cursor=today();renderCalendar();};
    $("#refreshBtn").onclick=loadData;
    const debouncedCalendar=debounce(renderCalendar,160);
    ["#calendarPlatform","#calendarWatchOnly"].forEach(s=>$(s).addEventListener("input",renderCalendar));
    $("#calendarSearch").addEventListener("input",debouncedCalendar);
    $$(".quick-range button").forEach(b=>b.onclick=()=>setPerfRange(b.dataset.range));
    const debouncedPerf=debounce(renderPerformance,180);
    ["#perfPlatform","#perfStatus","#perfHotOnly","#perfNewOnly"].forEach(s=>$(s).addEventListener("input",renderPerformance));
    ["#perfMajor","#perfMiddle","#perfSub"].forEach(sel=>$(sel).addEventListener("change",()=>{ if(sel==="#perfMajor") refreshPerfCategoryChildren(); if(sel==="#perfMiddle") refreshPerfCategoryChildren(); renderPerformance(); }));
    $("#perfSearch").addEventListener("input",debouncedPerf);
    const bindSectionToggle=(buttonSel,bodySel)=>{
      const btn=$(buttonSel), body=$(bodySel); if(!btn||!body) return;
      btn.onclick=()=>{
        const open=body.classList.contains("hidden");
        body.classList.toggle("hidden",!open);
        btn.textContent=open?"접기 ▴":"펼치기 ▾";
        btn.setAttribute("aria-expanded",String(open));
      };
    };
    bindSectionToggle("#hotDetailToggle","#hotList");
    bindSectionToggle("#newDetailToggle","#newList");
    bindSectionToggle("#channelDetailToggle","#channelAccordion");
    bindSectionToggle("#productDetailToggle","#productAccordion");
    $("#resetPerf").onclick=()=>setPerfRange("yesterday");
    $$(".review-state-filter button").forEach(b=>b.onclick=()=>setReviewFilter(b.dataset.reviewFilter));
    const debouncedReview=debounce(renderReview,180);
    $("#reviewPlatform").addEventListener("input",renderReview);
    $("#reviewSearch").addEventListener("input",debouncedReview);
    $("#adminBtn").onclick=()=>state.adminPassword?logoutAdmin():adminLogin();
    $("#adminLoginSubmit").onclick=async e=>{e.preventDefault();const pw=$("#adminPasswordInput").value;try{if(!await verifyAdmin(pw)) throw new Error("관리자 비밀번호가 올바르지 않습니다.");state.adminPassword=pw;sessionStorage.setItem("hsfm_admin_password",pw);await loadAdminMaster();$("#adminDialog").close();fillCommonFilters();renderGlobalKpis();renderActiveTab();showStatus("관리자 모드로 로그인했습니다.");}catch(err){$("#adminLoginError").textContent=err.message;}};
    $("#editAction").onchange=toggleMergeTarget;

    const debouncedMasterSearch=debounce(
      ()=>renderMasterSearchDropdown($("#editStandardName").value),
      90
    );

    $("#editStandardName").addEventListener("focus",()=>{
      if($("#editAction").value==="link_existing"){
        renderMasterSearchDropdown($("#editStandardName").value,{force:true});
      }
    });

    $("#editStandardName").addEventListener("input",()=>{
      if($("#editAction").value!=="link_existing") return;

      // 사용자가 기존 선택값을 다시 타이핑하면 이전 자동입력 상태 해제
      const selected=clean($("#productForm").dataset.selectedMaster||"");
      if(selected && productNameKey(selected)!==productNameKey($("#editStandardName").value)){
        clearExistingProductSelection();
      }

      debouncedMasterSearch();
    });

    $("#editStandardName").addEventListener("keydown",e=>{
      if(e.key==="ArrowDown"){
        e.preventDefault();
        if($("#masterSearchDropdown").classList.contains("hidden")){
          renderMasterSearchDropdown($("#editStandardName").value,{force:true});
        }
        moveMasterSearchSelection(1);
      }else if(e.key==="ArrowUp"){
        e.preventDefault();
        moveMasterSearchSelection(-1);
      }else if(e.key==="Enter"){
        if(chooseActiveMasterSearchItem()){
          e.preventDefault();
        }
      }else if(e.key==="Escape"){
        hideMasterSearchDropdown();
      }
    });

    $("#editStandardName").addEventListener("blur",()=>{
      setTimeout(()=>{
        const exact=getMasterProductByName($("#editStandardName").value);
        if(exact && $("#editAction").value==="link_existing"){
          selectExistingMasterProduct(exact.standard_product_name,{setAction:false});
        }
        hideMasterSearchDropdown();
      },120);
    });

    $("#unlockMasterMetaBtn").onclick=()=>{
      setMasterMetaLocked(false);
      $("#masterEditTools").classList.remove("hidden");
      $("#unlockMasterMetaBtn").textContent="정보 수정 중";
      $("#unlockMasterMetaBtn").disabled=true;
    };
    $("#editCategoryMajor").addEventListener("change",()=>{refreshEditCategoryChildren("major"); $("#categoryAutoSummary")?.classList.add("hidden"); $("#manualCategoryWrap")?.classList.remove("hidden");});
    $("#editCategoryMiddle").addEventListener("change",()=>{refreshEditCategoryChildren("middle"); $("#categoryAutoSummary")?.classList.add("hidden"); $("#manualCategoryWrap")?.classList.remove("hidden");});
    const debouncedCategoryFromGroup=debounce(()=>{
      renderGroupSearchDropdown($("#editGroup").value);
      applyCategoryFromProductGroup();
    },100);
    $("#editGroup").addEventListener("focus",()=>renderGroupSearchDropdown($("#editGroup").value));
    $("#editGroup").addEventListener("input",debouncedCategoryFromGroup);
    $("#editGroup").addEventListener("change",()=>{applyCategoryFromProductGroup(); hideGroupSearchDropdown();});
    $("#editGroup").addEventListener("blur",()=>setTimeout(hideGroupSearchDropdown,120));
    $("#editIngredient").addEventListener("change",()=>{ if(!$("#editCategoryMajor").value || !$("#editCategoryMiddle").value) applyCategoryFromProductGroup(); });
    $("#unlockRawTitleBtn").onclick=()=>{
      const el=$("#editRawDisplay"); el.disabled=!el.disabled;
      $("#unlockRawTitleBtn").textContent=el.disabled?"원본명 수정":"수정 취소";
      if(el.disabled) el.value=$("#editRawTitle").value;
    };
    setupDateInput("#perfStart",renderPerformance); setupDateInput("#perfEnd",renderPerformance);
    setupDateInput("#reviewStart",renderReview); setupDateInput("#reviewEnd",renderReview);
    $("#overrideSaveBtn").onclick=e=>{e.preventDefault();saveOverride();};
    $("#datePickerClose").onclick=closeDatePicker; $("#datePickerCancel").onclick=closeDatePicker;
    $("#datePickerConfirm").onclick=confirmDatePicker;
    $("#datePrevMonth").onclick=()=>{datePickerState.month=new Date(datePickerState.month.getFullYear(),datePickerState.month.getMonth()-1,1);renderDatePicker();};
    $("#dateNextMonth").onclick=()=>{datePickerState.month=new Date(datePickerState.month.getFullYear(),datePickerState.month.getMonth()+1,1);renderDatePicker();};
    $("#productSaveBtn").onclick=e=>{e.preventDefault();saveProductAdmin();};
    $("#productDialog").addEventListener("close",()=>{hideMasterSearchDropdown();hideGroupSearchDropdown();});
    $("#bulkAliasMoveBtn").onclick=bulkMoveAliases;
    $("#historyCloseBtn").onclick=()=>$("#historyDialog").close();
    $("#addWatchKeyword").onclick=()=>{const k=clean($("#watchKeyword").value);if(!k)return;if(!state.watchKeywords.includes(k))state.watchKeywords.push(k);$("#watchKeyword").value="";saveWatch();renderWatch();};
  }

  bind();
  setPerfRange("yesterday");
  loadData();
})();
