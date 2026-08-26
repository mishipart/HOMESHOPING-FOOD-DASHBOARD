(() => {
  "use strict";
  const VERSION = "2.9.2";
  const FOOD_TYPES = {
  "과자류, 빵류 또는 떡류": [
    "과자",
    "캔디류",
    "추잉껌",
    "빵류",
    "떡류"
  ],
  "빙과류": [
    "빙과",
    "식용얼음",
    "어업용얼음"
  ],
  "코코아가공품류 또는 초콜릿류": [
    "코코아매스",
    "코코아버터",
    "코코아분말",
    "기타코코아가공품",
    "초콜릿",
    "밀크초콜릿",
    "화이트초콜릿",
    "준초콜릿",
    "초콜릿가공품"
  ],
  "당류": [
    "설탕",
    "기타설탕",
    "당시럽류",
    "올리고당",
    "올리고당가공품",
    "포도당",
    "과당",
    "기타과당",
    "물엿",
    "기타엿",
    "덱스트린",
    "당류가공품"
  ],
  "잼류": [
    "잼",
    "기타잼"
  ],
  "두부류 또는 묵류": [
    "두부",
    "유바",
    "가공두부",
    "묵류"
  ],
  "식용유지류": [
    "콩기름(대두유)",
    "옥수수기름(옥배유)",
    "채종유(유채유 또는 카놀라유)",
    "미강유(현미유)",
    "참기름",
    "추출참깨유",
    "들기름",
    "추출들깨유",
    "홍화유(사플라워유 또는 잇꽃유)",
    "해바라기유",
    "목화씨기름(면실유)",
    "땅콩기름(낙화생유)",
    "올리브유",
    "팜유류",
    "야자유",
    "고추씨기름",
    "기타식물성유지",
    "어유",
    "기타동물성유지",
    "혼합식용유",
    "향미유",
    "가공유지",
    "쇼트닝",
    "마가린",
    "모조치즈",
    "식물성크림",
    "기타식용유지가공품"
  ],
  "면류": [
    "생면",
    "숙면",
    "건면",
    "유탕면"
  ],
  "음료류": [
    "침출차",
    "액상차",
    "고형차",
    "커피",
    "농축과채즙(또는 과채분)",
    "과채주스",
    "과채음료",
    "탄산음료",
    "탄산수",
    "원액두유",
    "가공두유",
    "유산균음료",
    "효모음료",
    "기타발효음료",
    "인삼홍삼음료",
    "혼합음료",
    "음료베이스"
  ],
  "특수영양식품": [
    "영아전기용 조제식",
    "영아후기용 조제식",
    "유아기용 조제식",
    "영유아용 이유식",
    "체중조절용 조제식품",
    "임산수유부용식품",
    "고령자용 영양조제식품"
  ],
  "특수의료용도식품": [
    "일반 환자용 균형영양조제식품",
    "당뇨환자용 영양조제식품",
    "신장질환자용 영양조제식품",
    "장질환자용 단백가수분해 영양조제식품",
    "암환자용 영양조제식품",
    "고혈압환자용 영양조제식품",
    "폐질환자용 영양조제식품",
    "간경변환자용 영양조제식품",
    "열량 및 영양공급용 식품",
    "연하곤란자용 점도조절 식품",
    "수분 및 전해질 보충용 조제식품",
    "선천성대사질환자용조제식품",
    "영유아용 특수조제식품",
    "기타환자용 영양조제식품",
    "당뇨환자용 식단형 식품",
    "신장질환자용 식단형 식품",
    "암환자용 식단형 식품",
    "고혈압환자용 식단형 식품"
  ],
  "장류": [
    "한식메주",
    "개량메주",
    "한식간장",
    "양조간장",
    "산분해간장",
    "효소분해간장",
    "혼합간장",
    "한식된장",
    "된장",
    "고추장",
    "춘장",
    "청국장",
    "혼합장",
    "기타장류"
  ],
  "조미식품": [
    "발효식초",
    "희석초산",
    "소스",
    "마요네즈",
    "토마토케첩",
    "복합조미식품",
    "카레(커리)분",
    "카레(커리)",
    "고춧가루",
    "실고추",
    "천연향신료",
    "향신료조제품",
    "천일염",
    "재제소금(재제조소금)",
    "태움용융소금",
    "정제소금",
    "기타소금",
    "가공소금"
  ],
  "절임류 또는 조림류": [
    "김치",
    "김칫속",
    "절임식품",
    "당절임",
    "조림류"
  ],
  "주류": [
    "탁주",
    "약주",
    "청주",
    "맥주",
    "과실주",
    "소주",
    "위스키",
    "브랜디",
    "일반증류주",
    "리큐르",
    "기타주류",
    "주정"
  ],
  "농산가공식품류": [
    "전분",
    "전분가공품",
    "밀가루",
    "영양강화 밀가루",
    "땅콩버터",
    "땅콩 또는 견과류가공품",
    "시리얼류",
    "찐쌀",
    "효소식품",
    "과채가공품",
    "곡류가공품",
    "두류가공품",
    "서류가공품",
    "기타 농산가공품"
  ],
  "식육가공품 및 포장육": [
    "식육함유가공품"
  ],
  "알가공품류": [
    "알함유가공품"
  ],
  "유함유가공품": [
    "유함유가공품"
  ],
  "수산가공식품류": [
    "어육살",
    "연육",
    "어육반제품",
    "어묵",
    "어육소시지",
    "기타 어육가공품",
    "젓갈",
    "양념젓갈",
    "액젓",
    "조미액젓",
    "조미건어포",
    "건어포",
    "기타 건포류",
    "가공김(조미김 또는 구운김)",
    "한천",
    "기타 수산물가공품"
  ],
  "동물성가공식품류": [
    "기타식육 또는 기타알",
    "기타동물성가공식품",
    "곤충가공식품",
    "자라분말",
    "자라분말제품",
    "자라유제품",
    "추출가공식품"
  ],
  "벌꿀 및 화분가공품": [
    "벌집꿀",
    "벌꿀",
    "사양벌집꿀",
    "사양벌꿀",
    "로열젤리",
    "로열젤리제품",
    "가공화분",
    "화분함유제품"
  ],
  "즉석식품류": [
    "생식제품",
    "생식함유제품",
    "즉석섭취식품",
    "신선편의식품",
    "즉석조리식품",
    "간편조리세트",
    "만두",
    "만두피"
  ],
  "기타식품류": [
    "효모식품",
    "기타가공품"
  ]
};

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];

  function setTextLabelFor(el, text) {
    if (!el) return;
    const label = el.closest("label");
    if (!label) return;
    for (const n of [...label.childNodes]) {
      if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) {
        n.textContent = text;
        return;
      }
    }
    label.insertBefore(document.createTextNode(text), label.firstChild);
  }

  function optionsInto(select, values, keep="") {
    if (!select) return;
    const current = keep || select.value || "";
    const uniq = [...new Set(values.filter(Boolean))];
    select.innerHTML = '<option value="">전체</option>' +
      uniq.map(v => `<option value="${String(v).replace(/&/g,"&amp;").replace(/"/g,"&quot;")}">${v}</option>`).join("");
    if (uniq.includes(current)) select.value = current;
  }

  function normalizeMiddleName(v) {
    const s = String(v || "").trim();
    const aliases = {
      "과자류, 빵류 또는 떡류":"과자류, 빵류 또는 떡류",
      "빙과":"빙과류",
      "빙과류":"빙과류",
      "코코아가공품류":"코코아가공품류 또는 초콜릿류",
      "초콜릿류":"코코아가공품류 또는 초콜릿류",
      "코코아가공품류 또는 초콜릿류":"코코아가공품류 또는 초콜릿류",
      "설탕류":"당류","당류":"당류",
      "두부류 또는 묵류":"두부류 또는 묵류",
      "식용유지류":"식용유지류",
      "다류":"음료류","커피":"음료류","음료류":"음료류",
      "농산가공식품류":"농산가공식품류",
      "수산가공식품류":"수산가공식품류",
      "동물성가공식품류":"동물성가공식품류",
      "벌꿀 및 화분가공품류":"벌꿀 및 화분가공품",
      "벌꿀 및 화분가공품":"벌꿀 및 화분가공품"
    };
    return aliases[s] || s;
  }

  function ensureFoodTypeOptions(majorSel, middleSel, subSel) {
    if (!majorSel || !middleSel || !subSel) return;
    setTextLabelFor(subSel, "식품유형");
    if (majorSel.value !== "일반식품") return;
    const mid = normalizeMiddleName(middleSel.value);
    const list = FOOD_TYPES[mid];
    if (!list) return;
    const keep = subSel.value;
    optionsInto(subSel, list, keep);
    subSel.disabled = false;
  }

  function enhanceCategorySelectors() {
    const pm = $("#perfMajor"), pmi = $("#perfMiddle"), ps = $("#perfSub");
    if (pm && pmi && ps) ensureFoodTypeOptions(pm, pmi, ps);

    const em = $("#editCategoryMajor"), emi = $("#editCategoryMiddle"), es = $("#editCategorySub");
    if (em && emi && es) ensureFoodTypeOptions(em, emi, es);

    [pm,pmi,em,emi].filter(Boolean).forEach(el => {
      if (el.dataset.v292Bound) return;
      el.dataset.v292Bound = "1";
      el.addEventListener("change", () => setTimeout(enhanceCategorySelectors, 0));
    });
  }

  function enhanceDateFields() {
    ["perfStart","perfEnd"].forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      const label = input.closest("label");
      if (label) label.classList.add("v292-date-label");
      const btn = input.nextElementSibling;
      if (btn && btn.classList.contains("date-picker-open")) {
        const wrap = document.createElement("span");
        wrap.className = "v292-date-combo";
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);
        wrap.appendChild(btn);
      }
    });
  }

  const collapseKey = title => "hsfm_v292_collapse_" + title;
  function makeCollapsibleByTitle(title, defaultCollapsed=true) {
    const h3 = $$("h3").find(x => x.textContent.trim().includes(title));
    const card = h3?.closest(".card");
    if (!card || card.dataset.v292Collapse) return;
    card.dataset.v292Collapse = "1";
    const head = h3.closest(".card-head") || h3.parentElement;
    const bodyNodes = [...card.children].filter(n => n !== head);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn v292-section-toggle";
    const stored = localStorage.getItem(collapseKey(title));
    let collapsed = stored == null ? defaultCollapsed : stored === "1";
    function apply() {
      card.classList.toggle("v292-collapsed", collapsed);
      bodyNodes.forEach(n => n.classList.toggle("v292-collapse-hidden", collapsed));
      btn.textContent = collapsed ? "펼치기 ▾" : "접기 ▴";
      btn.setAttribute("aria-expanded", String(!collapsed));
      localStorage.setItem(collapseKey(title), collapsed ? "1" : "0");
    }
    btn.onclick = () => { collapsed = !collapsed; apply(); };
    head.appendChild(btn);
    apply();
  }

  function enhanceCollapsibles() {
    makeCollapsibleByTitle("특별히 잘 나온 실적", true);
    makeCollapsibleByTitle("신규 등장 상품", true);
    makeCollapsibleByTitle("홈쇼핑사별 실적", true);
    makeCollapsibleByTitle("상품별 실적", true);
  }

  function enhanceHistoryDialog() {
    const dlg = $("#historyDialog");
    if (!dlg) return;
    dlg.classList.add("v292-history-dialog");
    const card = dlg.querySelector(".dialog-card");
    if (card) card.classList.add("v292-history-card");
  }

  function replaceSubLabelsGlobally() {
    $$("label").forEach(label => {
      const t = [...label.childNodes].find(n => n.nodeType===Node.TEXT_NODE && n.textContent.trim()==="소분류");
      if (t) t.textContent = "식품유형";
    });
  }

  function runEnhancements() {
    enhanceDateFields();
    enhanceCollapsibles();
    enhanceHistoryDialog();
    replaceSubLabelsGlobally();
    enhanceCategorySelectors();
  }

  let queued = false;
  const mo = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      runEnhancements();
    });
  });
  mo.observe(document.documentElement, {subtree:true, childList:true});

  document.addEventListener("DOMContentLoaded", () => {
    runEnhancements();
    setTimeout(runEnhancements, 600);
    console.info(`[HSFM] V${VERSION} dashboard hotfix active`);
  });
})();
