(() => {
  "use strict";

  const DATA_URL = "../data/food_broadcasts.csv";
  const MASTER_URL = "../data/product_master.csv";
  const PENDING_URL = "../reports/pending_products.json";

  const WATCH_PRODUCTS_KEY = "hsfm_watch_products_v2";
  const WATCH_KEYWORDS_KEY = "hsfm_watch_keywords_v2";
  const REVIEW_DRAFTS_KEY = "hsfm_review_drafts_v2";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    rows: [],
    master: [],
    pending: [],
    tab: "calendar",
    view: "month",
    cursor: null,
    platform: "",
    productQuery: "",
    interestOnly: false,
    watchProducts: new Set(),
    watchKeywords: [],
    reviewDrafts: {},
    firstProductDate: new Map(),
    productSalesBenchmarks: new Map(),
    overallHotThreshold: 0,
    reviewQuery: "",
    reviewFilter: "pending",
    reviewPlatform: "",
    reviewFrom: "",
    reviewTo: "",
    perf: {
      from: "",
      to: "",
      platform: "",
      query: "",
      group: "",
      status: "all",
      hotOnly: false,
      newOnly: false
    }
  };

  function todayKST() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  function parseDateKey(s) {
    const [y, m, d] = String(s || "").slice(0, 10).split("-").map(Number);
    return new Date(y || 1970, (m || 1) - 1, d || 1, 12, 0, 0);
  }

  function dateKey(d) {
    if (typeof d === "string") return d.slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function startOfWeek(d) {
    const x = new Date(d);
    x.setDate(x.getDate() - x.getDay());
    x.setHours(12, 0, 0, 0);
    return x;
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0);
  }

  function endOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12, 0, 0);
  }

  function num(v) {
    if (v == null || v === "") return 0;
    const n = Number(String(v).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function norm(v) {
    return String(v || "")
      .toLowerCase()
      .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];

      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (c === '"') {
          quoted = false;
        } else {
          field += c;
        }
      } else {
        if (c === '"') {
          quoted = true;
        } else if (c === ",") {
          row.push(field);
          field = "";
        } else if (c === "\n") {
          row.push(field.replace(/\r$/, ""));
          rows.push(row);
          row = [];
          field = "";
        } else {
          field += c;
        }
      }
    }

    if (field.length || row.length) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
    }

    if (!rows.length) return [];
    const headers = rows[0].map(h => String(h || "").trim());

    return rows
      .slice(1)
      .filter(r => r.some(v => String(v || "").trim() !== ""))
      .map(cols => {
        const out = {};
        headers.forEach((h, i) => out[h] = cols[i] ?? "");
        return out;
      });
  }

  async function fetchText(url) {
    const r = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.text();
  }

  async function fetchJsonSafe(url) {
    try {
      const r = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  function extractPending(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    for (const k of ["items", "pending", "products", "data"]) {
      if (Array.isArray(v[k])) return v[k];
    }
    return [];
  }

  function productName(r) {
    return String(
      r.standard_product_name ||
      r.normalized_title ||
      r.raw_title ||
      r.match_keyword ||
      "상품명 미확인"
    ).trim();
  }

  function productKey(r) {
    return norm(productName(r));
  }

  function timeHHMM(v) {
    const s = String(v || "");
    const m = s.match(/T(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : (s.slice(11, 16) || "--:--");
  }

  function salesAmount(r) {
    return num(r.sales_amt);
  }

  function salesCount(r) {
    return num(r.sales_cnt);
  }

  function hasPerformance(r) {
    return salesAmount(r) > 0 || salesCount(r) > 0 ||
      ["success", "confirmed", "확인"].some(x =>
        String(r.performance_status || "").toLowerCase().includes(x)
      );
  }

  function isPastDate(key) {
    return key < todayKST();
  }

  function fmtWon(v) {
    const n = num(v);
    if (!n) return "-";
    const man = n / 10000;
    return `${Math.round(man).toLocaleString("ko-KR")}만원`;
  }

  function fmtCount(v, suffix = "회") {
    return `${Math.round(num(v)).toLocaleString("ko-KR")}${suffix}`;
  }

  function unique(arr) {
    return [...new Set(arr.filter(Boolean))];
  }

  function groupBy(arr, fn) {
    const out = {};
    arr.forEach(x => {
      const k = fn(x);
      (out[k] ||= []).push(x);
    });
    return out;
  }

  function sum(arr, fn) {
    return arr.reduce((a, x) => a + fn(x), 0);
  }


  function median(values) {
    const a = values.filter(v => Number.isFinite(v) && v > 0).sort((x, y) => x - y);
    if (!a.length) return 0;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function percentile(values, p) {
    const a = values.filter(v => Number.isFinite(v) && v > 0).sort((x, y) => x - y);
    if (!a.length) return 0;
    const idx = Math.min(a.length - 1, Math.max(0, Math.ceil(p * a.length) - 1));
    return a[idx];
  }

  function buildSignalIndexes() {
    state.firstProductDate = new Map();
    const byProductSales = new Map();
    const allSales = [];

    state.rows.forEach(r => {
      const k = productKey(r);
      if (k && r.broadcast_date) {
        const old = state.firstProductDate.get(k);
        if (!old || r.broadcast_date < old) state.firstProductDate.set(k, r.broadcast_date);
      }

      const amt = salesAmount(r);
      if (k && amt > 0) {
        if (!byProductSales.has(k)) byProductSales.set(k, []);
        byProductSales.get(k).push(amt);
        allSales.push(amt);
      }
    });

    state.overallHotThreshold = percentile(allSales, 0.90);
    state.productSalesBenchmarks = new Map();

    for (const [k, vals] of byProductSales.entries()) {
      state.productSalesBenchmarks.set(k, {
        count: vals.length,
        median: median(vals),
        p90: percentile(vals, 0.90)
      });
    }
  }

  function isHot(r) {
    const amt = salesAmount(r);
    if (amt <= 0) return false;

    const b = state.productSalesBenchmarks.get(productKey(r));

    // 상품 자체 실적이 충분히 쌓였으면 "평소보다 유난히 잘 나온 방송" 기준.
    if (b && b.count >= 3 && b.median > 0) {
      return amt >= b.median * 1.5 &&
             amt >= state.overallHotThreshold * 0.60;
    }

    // 신규/표본 부족 상품은 전체 실적 상위 10% 기준.
    return state.overallHotThreshold > 0 &&
           amt >= state.overallHotThreshold;
  }

  function isNew(r) {
    const k = productKey(r);
    return !!k &&
           !!r.broadcast_date &&
           state.firstProductDate.get(k) === r.broadcast_date;
  }

  function badgesFor(r, compact = false) {
    const badges = [];

    if (isHot(r)) {
      badges.push(
        `<span class="signal-badge hot" title="평소 대비 특별히 높은 실적">HOT</span>`
      );
    }

    if (isNew(r)) {
      badges.push(
        `<span class="signal-badge new" title="현재 수집 DB 기준 첫 등장 상품">NEW</span>`
      );
    }

    return badges.length
      ? `<span class="signal-wrap ${compact ? "compact" : ""}">${badges.join("")}</span>`
      : "";
  }

  function loadLocal() {
    try {
      state.watchProducts = new Set(JSON.parse(localStorage.getItem(WATCH_PRODUCTS_KEY) || "[]"));
    } catch {}
    try {
      state.watchKeywords = JSON.parse(localStorage.getItem(WATCH_KEYWORDS_KEY) || "[]");
      if (!Array.isArray(state.watchKeywords)) state.watchKeywords = [];
    } catch {}
    try {
      state.reviewDrafts = JSON.parse(localStorage.getItem(REVIEW_DRAFTS_KEY) || "{}");
      if (!state.reviewDrafts || typeof state.reviewDrafts !== "object") state.reviewDrafts = {};
    } catch {}
  }

  function saveWatchProducts() {
    localStorage.setItem(WATCH_PRODUCTS_KEY, JSON.stringify([...state.watchProducts]));
  }

  function saveWatchKeywords() {
    localStorage.setItem(WATCH_KEYWORDS_KEY, JSON.stringify(state.watchKeywords));
  }

  function saveReviewDrafts() {
    localStorage.setItem(REVIEW_DRAFTS_KEY, JSON.stringify(state.reviewDrafts));
  }

  function toast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    $("#toastRoot").appendChild(el);
    setTimeout(() => el.classList.add("show"), 20);
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 200);
    }, 2400);
  }

  function closeModal() {
    $("#modalRoot").innerHTML = "";
  }

  function showModal(html, onReady) {
    $("#modalRoot").innerHTML = `<div class="modal-backdrop"><div class="modal-card">${html}</div></div>`;
    const backdrop = $(".modal-backdrop");
    backdrop.addEventListener("click", e => {
      if (e.target === backdrop) closeModal();
    });
    $("[data-close-modal]")?.addEventListener("click", closeModal);
    onReady?.($("#modalRoot"));
  }

  function allPlatforms() {
    return unique(state.rows.map(r => r.platform_name)).sort((a, b) => a.localeCompare(b, "ko"));
  }

  function allGroups() {
    return unique([
      ...state.rows.map(r => r.product_group),
      ...state.master.map(r => r.product_group)
    ]).sort((a, b) => a.localeCompare(b, "ko"));
  }

  function rowMatchesWatch(r) {
    if (state.watchProducts.has(productKey(r))) return true;
    const hay = norm([
      productName(r),
      r.raw_title,
      r.brand,
      r.product_group,
      r.main_ingredient
    ].join(" "));
    return state.watchKeywords.some(k => hay.includes(norm(k)));
  }

  function filteredCalendarRows() {
    const q = norm(state.productQuery);
    return state.rows.filter(r => {
      if (state.platform && r.platform_name !== state.platform) return false;
      if (q) {
        const hay = norm([productName(r), r.raw_title, r.brand, r.product_group, r.main_ingredient].join(" "));
        if (!hay.includes(q)) return false;
      }
      if (state.interestOnly && !rowMatchesWatch(r)) return false;
      return true;
    });
  }

  function selectedCalendarRange() {
    if (state.view === "day") {
      const k = dateKey(state.cursor);
      return [k, k];
    }
    if (state.view === "week") {
      const s = startOfWeek(state.cursor);
      return [dateKey(s), dateKey(addDays(s, 6))];
    }
    return [dateKey(startOfMonth(state.cursor)), dateKey(endOfMonth(state.cursor))];
  }

  function latestUpdateText() {
    const vals = state.rows
      .flatMap(r => [r.last_seen_at, r.performance_updated_at, r.detail_checked_at])
      .filter(Boolean)
      .sort();
    return vals.length ? vals[vals.length - 1] : "";
  }

  function renderKPIs(rows = null) {
    const useRows = rows || (() => {
      const [from, to] = selectedCalendarRange();
      return filteredCalendarRows().filter(r => r.broadcast_date >= from && r.broadcast_date <= to);
    })();

    const perfRows = useRows.filter(hasPerformance);
    const totalSales = sum(perfRows, salesAmount);
    const avgSales = perfRows.length ? totalSales / perfRows.length : 0;

    const pendingCount = getReviewItems().filter(x => !state.reviewDrafts[reviewKey(x)]).length;
    const manualCount = useRows.filter(r =>
      String(r.performance_source || "").toLowerCase().includes("manual")
    ).length;

    $("#kpiRoot").innerHTML = `
      <article class="kpi-card">
        <span>선택기간 방송</span>
        <strong>${fmtCount(useRows.length)}</strong>
        <small>식품 방송</small>
      </article>
      <article class="kpi-card">
        <span>확인된 매출</span>
        <strong>${fmtWon(totalSales)}</strong>
        <small>매출액 합계</small>
      </article>
      <article class="kpi-card">
        <span>평균 매출</span>
        <strong>${fmtWon(avgSales)}</strong>
        <small>실적 보유 방송 기준</small>
      </article>
      <article class="kpi-card">
        <span>상품 확인 필요</span>
        <strong>${pendingCount.toLocaleString("ko-KR")}건</strong>
        <small>상품 매칭 검토</small>
      </article>
      <article class="kpi-card">
        <span>수동 실적 확인</span>
        <strong>${manualCount.toLocaleString("ko-KR")}건</strong>
        <small>자동수집 예외</small>
      </article>
    `;
  }

  function renderTabs() {
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === state.tab));
  }

  function setTab(tab) {
    state.tab = tab;
    renderTabs();
    render();
  }

  function render() {
    if (state.tab === "calendar") renderCalendar();
    if (state.tab === "performance") renderPerformance();
    if (state.tab === "review") renderReview();
    if (state.tab === "watch") renderWatch();
  }

  function periodTitle() {
    if (state.view === "month") {
      return `${state.cursor.getFullYear()}년 ${state.cursor.getMonth() + 1}월`;
    }
    if (state.view === "week") {
      const s = startOfWeek(state.cursor);
      const e = addDays(s, 6);
      return `${s.getMonth() + 1}.${s.getDate()} – ${e.getMonth() + 1}.${e.getDate()}`;
    }
    return `${state.cursor.getFullYear()}년 ${state.cursor.getMonth() + 1}월 ${state.cursor.getDate()}일`;
  }

  function shiftCalendar(dir) {
    if (state.view === "month") {
      state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + dir, 1, 12);
    } else if (state.view === "week") {
      state.cursor = addDays(state.cursor, 7 * dir);
    } else {
      state.cursor = addDays(state.cursor, dir);
    }
    renderCalendar();
  }

  function renderCalendar() {
    const root = $("#viewRoot");
    root.innerHTML = `
      <section class="panel calendar-panel">
        <div class="calendar-toolbar">
          <div class="period-nav">
            <button class="icon-btn" id="prevPeriod" type="button">‹</button>
            <h2>${esc(periodTitle())}</h2>
            <button class="icon-btn" id="nextPeriod" type="button">›</button>
          </div>
          <div class="segmented" aria-label="캘린더 보기">
            <button data-view="month" class="${state.view === "month" ? "active" : ""}" type="button">월</button>
            <button data-view="week" class="${state.view === "week" ? "active" : ""}" type="button">주</button>
            <button data-view="day" class="${state.view === "day" ? "active" : ""}" type="button">일</button>
          </div>
        </div>

        <div class="filter-row">
          <label>홈쇼핑사
            <select id="calendarPlatform">
              <option value="">전체</option>
              ${allPlatforms().map(p => `<option ${state.platform === p ? "selected" : ""}>${esc(p)}</option>`).join("")}
            </select>
          </label>
          <label class="grow">상품 검색
            <input id="calendarQuery" value="${esc(state.productQuery)}" placeholder="상품명·브랜드·원료 검색" />
          </label>
          <label class="check-label">
            <input id="interestOnly" type="checkbox" ${state.interestOnly ? "checked" : ""} />
            관심상품만
          </label>
        </div>

        <div id="calendarRoot"></div>
      </section>
    `;

    $("#prevPeriod").addEventListener("click", () => shiftCalendar(-1));
    $("#nextPeriod").addEventListener("click", () => shiftCalendar(1));
    $$(".segmented [data-view]").forEach(btn => btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      renderCalendar();
    }));
    $("#calendarPlatform").addEventListener("change", e => {
      state.platform = e.target.value;
      renderCalendar();
    });
    $("#calendarQuery").addEventListener("input", e => {
      state.productQuery = e.target.value;
      renderCalendarBodyOnly();
    });
    $("#interestOnly").addEventListener("change", e => {
      state.interestOnly = e.target.checked;
      renderCalendarBodyOnly();
    });

    renderCalendarBodyOnly();
  }

  function renderCalendarBodyOnly() {
    if (state.view === "month") renderMonth();
    if (state.view === "week") renderWeek();
    if (state.view === "day") renderDay();
    renderKPIs();
  }

  function renderMonth() {
    const first = startOfMonth(state.cursor);
    const gridStart = addDays(first, -first.getDay());
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    const rows = filteredCalendarRows();
    const byDay = groupBy(rows, r => r.broadcast_date);
    const today = todayKST();

    let html = `<div class="month-board">`;
    ["일","월","화","수","목","금","토"].forEach(d => {
      html += `<div class="month-weekday">${d}</div>`;
    });

    days.forEach(d => {
      const k = dateKey(d);
      const dayRows = byDay[k] || [];
      const sameMonth = d.getMonth() === state.cursor.getMonth();
      const perf = dayRows.filter(hasPerformance);
      const totalSales = sum(perf, salesAmount);
      const future = k > today;

      const hotRows = dayRows.filter(isHot);
      const newRows = dayRows.filter(isNew);

      const hotTip = hotRows.slice(0, 6)
        .map(r => `${timeHHMM(r.start_datetime)} ${productName(r)} · ${fmtWon(salesAmount(r))}`)
        .join("\n");

      const newTip = newRows.slice(0, 6)
        .map(r => `${timeHHMM(r.start_datetime)} ${productName(r)} · ${r.platform_name || ""}`)
        .join("\n");

      html += `
        <button class="month-cell ${sameMonth ? "" : "other"} ${k === today ? "today" : ""}" data-open-day="${k}" type="button">
          <span class="day-number">${d.getDate()}</span>

          ${(hotRows.length || newRows.length) ? `
            <div class="month-signals">
              ${hotRows.length ? `<span class="signal-badge hot" title="${esc(hotTip)}${hotRows.length > 6 ? `&#10;외 ${hotRows.length - 6}건` : ""}">HOT ${hotRows.length}</span>` : ""}
              ${newRows.length ? `<span class="signal-badge new" title="${esc(newTip)}${newRows.length > 6 ? `&#10;외 ${newRows.length - 6}건` : ""}">NEW ${newRows.length}</span>` : ""}
            </div>
          ` : ""}

          <div class="month-summary">
            ${dayRows.length ? `<span class="summary-pill count">식품방송 ${dayRows.length}회</span>` : ""}
            ${!future && totalSales ? `<span class="summary-pill sales">매출 ${fmtWon(totalSales)}</span>` : ""}
            ${future && dayRows.length ? `<span class="summary-pill future">예정 ${dayRows.length}회</span>` : ""}
          </div>
        </button>
      `;
    });

    html += `</div>`;
    $("#calendarRoot").innerHTML = html;

    $$("[data-open-day]").forEach(btn => btn.addEventListener("click", () => {
      state.cursor = parseDateKey(btn.dataset.openDay);
      state.view = "day";
      renderCalendar();
    }));
  }

  function renderWeek() {
    const start = startOfWeek(state.cursor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const firstKey = dateKey(days[0]);
    const lastKey = dateKey(days[6]);

    const rows = filteredCalendarRows()
      .filter(r => r.broadcast_date >= firstKey && r.broadcast_date <= lastKey)
      .sort((a, b) => String(a.start_datetime || "").localeCompare(String(b.start_datetime || "")));

    const byDayHour = {};
    rows.forEach(r => {
      const hour = (String(r.start_datetime || "").match(/T(\d{2}):/) || [,"00"])[1];
      (byDayHour[`${r.broadcast_date}|${hour}`] ||= []).push(r);
    });

    const today = todayKST();
    let html = `<div class="week-scroll"><div class="week-board">`;
    html += `<div class="week-corner week-sticky"></div>`;

    days.forEach(d => {
      const k = dateKey(d);
      html += `
        <div class="week-day-head week-sticky ${k === today ? "today" : ""}">
          <strong>${["일","월","화","수","목","금","토"][d.getDay()]}</strong>
          <small>${d.getMonth() + 1}/${d.getDate()}</small>
        </div>`;
    });

    for (let hour = 0; hour < 24; hour++) {
      const hh = String(hour).padStart(2, "0");
      html += `<div class="week-hour">${hh}:00</div>`;

      days.forEach(d => {
        const k = dateKey(d);
        const key = `${k}|${hh}`;
        const slot = byDayHour[key] || [];
        const visible = slot.slice(0, 3);
        const hidden = slot.length - visible.length;

        html += `<div class="week-slot ${k === today ? "today" : ""}">`;

        visible.forEach(r => {
          html += `
            <button class="event-chip ${rowMatchesWatch(r) ? "interest" : ""}"
                    data-show-id="${esc(r.hsshow_id || "")}"
                    type="button"
                    title="${esc(productName(r))}">
              <strong>${esc(timeHHMM(r.start_datetime))} ${esc(productName(r))}</strong>
              <span>${esc(r.platform_name || "")}</span>
              ${badgesFor(r, true)}
            </button>`;
        });

        if (hidden > 0) {
          html += `<button class="week-more-btn" data-week-more="${esc(key)}" type="button">+ ${hidden}개 더보기</button>`;
        }

        html += `</div>`;
      });
    }

    html += `</div></div>`;
    $("#calendarRoot").innerHTML = html;

    $$("[data-show-id]").forEach(btn => btn.addEventListener("click", () => {
      const r = state.rows.find(x => String(x.hsshow_id) === String(btn.dataset.showId));
      if (r) openBroadcastModal(r);
    }));

    $$("[data-week-more]").forEach(btn => btn.addEventListener("click", () => {
      openWeekMoreModal(btn.dataset.weekMore, byDayHour[btn.dataset.weekMore] || []);
    }));
  }

  function openWeekMoreModal(key, rows) {
    const [day, hour] = key.split("|");
    showModal(`
      <div class="modal-head">
        <div>
          <h3>${esc(day)} ${esc(hour)}시 방송</h3>
          <p>${rows.length}개 방송</p>
        </div>
        <button class="modal-close" data-close-modal type="button">×</button>
      </div>
      <div class="modal-list">
        ${rows.map((r, i) => `
          <button class="modal-row" data-modal-row="${i}" type="button">
            <span class="modal-time">${esc(timeHHMM(r.start_datetime))}</span>
            <span class="modal-main">
              <strong>${esc(productName(r))}</strong>
              <small>${esc(r.platform_name || "")}</small>
            </span>
          </button>`).join("")}
      </div>
    `, root => {
      $$("[data-modal-row]", root).forEach(btn => btn.addEventListener("click", () => {
        const r = rows[Number(btn.dataset.modalRow)];
        closeModal();
        openBroadcastModal(r);
      }));
    });
  }

  function renderDay() {
    const key = dateKey(state.cursor);
    const rows = filteredCalendarRows()
      .filter(r => r.broadcast_date === key)
      .sort((a, b) => String(a.start_datetime || "").localeCompare(String(b.start_datetime || "")));

    const perf = rows.filter(hasPerformance);
    const totalSales = sum(perf, salesAmount);

    $("#calendarRoot").innerHTML = `
      <div class="day-summary">
        <span>방송 ${rows.length}회</span>
        <span>실적 확인 ${perf.length}회</span>
        <span>매출 ${fmtWon(totalSales)}</span>
        <span>관심방송 ${rows.filter(rowMatchesWatch).length}건</span>
        <span class="hot-chip">HOT ${rows.filter(isHot).length}건</span>
        <span class="new-chip">NEW ${rows.filter(isNew).length}건</span>
      </div>

      <div class="day-table-wrap">
        <table class="data-table day-table">
          <thead>
            <tr>
              <th></th><th>시간</th><th>홈쇼핑사</th><th>상품</th><th>표시</th>
              <th class="num">판매량</th><th class="num">매출</th><th>상태</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((r, i) => {
              const watched = state.watchProducts.has(productKey(r));
              return `
                <tr>
                  <td><button class="star-btn ${watched ? "active" : ""}" data-star="${i}" type="button">${watched ? "★" : "☆"}</button></td>
                  <td>${esc(timeHHMM(r.start_datetime))}</td>
                  <td>${esc(r.platform_name || "")}</td>
                  <td>
                    <button class="link-btn" data-day-show="${i}" type="button">${esc(productName(r))}</button>
                    ${r.raw_title && r.raw_title !== productName(r) ? `<small class="raw-line">${esc(r.raw_title)}</small>` : ""}
                  </td>
                  <td>${badgesFor(r)}</td>
                  <td class="num">${salesCount(r) ? salesCount(r).toLocaleString("ko-KR") : "-"}</td>
                  <td class="num strong">${fmtWon(salesAmount(r))}</td>
                  <td>${hasPerformance(r) ? `<span class="status ok">수집완료</span>` : `<span class="status pending">예정/미확인</span>`}</td>
                </tr>`;
            }).join("") : `<tr><td colspan="8" class="empty-cell">조건에 맞는 방송이 없습니다.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    $$("[data-star]").forEach(btn => btn.addEventListener("click", () => {
      const r = rows[Number(btn.dataset.star)];
      const k = productKey(r);
      if (state.watchProducts.has(k)) state.watchProducts.delete(k);
      else state.watchProducts.add(k);
      saveWatchProducts();
      renderDay();
      renderKPIs();
    }));

    $$("[data-day-show]").forEach(btn => btn.addEventListener("click", () => {
      openBroadcastModal(rows[Number(btn.dataset.dayShow)]);
    }));
  }

  function openBroadcastModal(r) {
    const watched = state.watchProducts.has(productKey(r));
    showModal(`
      <div class="modal-head">
        <div>
          <h3>${esc(productName(r))}</h3>
          <p>${esc(r.platform_name || "")} · ${esc(r.broadcast_date || "")} ${esc(timeHHMM(r.start_datetime))}</p>
        </div>
        <button class="modal-close" data-close-modal type="button">×</button>
      </div>
      <div class="detail-grid">
        <div><span>판매량</span><strong>${salesCount(r) ? salesCount(r).toLocaleString("ko-KR") : "-"}</strong></div>
        <div><span>매출</span><strong>${fmtWon(salesAmount(r))}</strong></div>
        <div><span>상품군</span><strong>${esc(r.product_group || "-")}</strong></div>
        <div><span>브랜드</span><strong>${esc(r.brand || "-")}</strong></div>
      </div>
      <div class="raw-box"><span>원본 방송명</span>${esc(r.raw_title || "-")}</div>
      <div class="modal-actions">
        <button id="modalWatchBtn" class="btn ${watched ? "secondary" : "primary"}" type="button">
          ${watched ? "★ 관심상품 해제" : "☆ 관심상품 등록"}
        </button>
      </div>
    `, () => {
      $("#modalWatchBtn").addEventListener("click", () => {
        const k = productKey(r);
        if (state.watchProducts.has(k)) state.watchProducts.delete(k);
        else state.watchProducts.add(k);
        saveWatchProducts();
        closeModal();
        render();
      });
    });
  }

  function defaultPerfRange() {
    const salesDates = state.rows.filter(hasPerformance).map(r => r.broadcast_date).filter(Boolean).sort();
    const latest = salesDates.length ? salesDates[salesDates.length - 1] : todayKST();

    const yesterday = dateKey(addDays(parseDateKey(latest), -1));
    const hasYesterday = state.rows.some(r => r.broadcast_date === yesterday && hasPerformance(r));

    // 기본값은 전일. 전일 실적이 없을 때만 최신 실적일 사용.
    return hasYesterday ? [yesterday, yesterday] : [latest, latest];
  }

  function performanceRows() {
    const p = state.perf;
    const q = norm(p.query);
    return state.rows.filter(r => {
      if (p.from && r.broadcast_date < p.from) return false;
      if (p.to && r.broadcast_date > p.to) return false;
      if (p.platform && r.platform_name !== p.platform) return false;
      if (p.group && r.product_group !== p.group) return false;
      if (p.status === "confirmed" && !hasPerformance(r)) return false;
      if (p.status === "missing" && hasPerformance(r)) return false;
      if (p.hotOnly && !isHot(r)) return false;
      if (p.newOnly && !isNew(r)) return false;
      if (q) {
        const hay = norm([productName(r), r.raw_title, r.brand, r.product_group, r.main_ingredient].join(" "));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }


  function daysInclusive(from, to) {
    const a = parseDateKey(from);
    const b = parseDateKey(to);
    return Math.max(1, Math.round((b - a) / 86400000) + 1);
  }

  function previousPeriodRange(from, to) {
    const len = daysInclusive(from, to);
    const prevTo = addDays(parseDateKey(from), -1);
    const prevFrom = addDays(prevTo, -(len - 1));
    return [dateKey(prevFrom), dateKey(prevTo)];
  }

  function rowsForPerfRange(from, to, basePerf) {
    const q = norm(basePerf.query || "");

    return state.rows.filter(r => {
      if (from && r.broadcast_date < from) return false;
      if (to && r.broadcast_date > to) return false;
      if (basePerf.platform && r.platform_name !== basePerf.platform) return false;
      if (basePerf.group && r.product_group !== basePerf.group) return false;
      if (basePerf.status === "confirmed" && !hasPerformance(r)) return false;
      if (basePerf.status === "missing" && hasPerformance(r)) return false;
      if (basePerf.hotOnly && !isHot(r)) return false;
      if (basePerf.newOnly && !isNew(r)) return false;

      if (q) {
        const hay = norm([
          productName(r), r.raw_title, r.brand,
          r.product_group, r.main_ingredient
        ].join(" "));

        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }

  function pctChange(current, previous) {
    if (!previous && !current) return 0;
    if (!previous && current) return null;
    return ((current - previous) / previous) * 100;
  }

  function compareBadge(current, previous, suffix = "") {
    const pct = pctChange(current, previous);

    if (pct === null) {
      return `<span class="compare-badge neutral">비교기준 없음</span>`;
    }

    const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "–";
    const cls = pct > 0 ? "up" : pct < 0 ? "down" : "neutral";

    return `
      <span class="compare-badge ${cls}">
        ${arrow} ${Math.abs(pct).toFixed(1)}%${suffix}
      </span>
    `;
  }

  function productTrendBars(rows, maxBars = 8) {
    const items = rows
      .filter(hasPerformance)
      .slice()
      .sort((a, b) => String(a.start_datetime || "").localeCompare(String(b.start_datetime || "")))
      .slice(-maxBars);

    if (!items.length) return `<span class="trend-empty">-</span>`;

    const vals = items.map(salesAmount);
    const max = Math.max(1, ...vals);

    return `
      <span class="mini-trend" title="${esc(items.map(r => `${r.broadcast_date} ${timeHHMM(r.start_datetime)} ${fmtWon(salesAmount(r))}`).join("\n"))}">
        ${vals.map(v => `<i style="height:${Math.max(8, v / max * 100)}%"></i>`).join("")}
      </span>
    `;
  }

  function autoPerformanceSummary(rows, perf, previousRows, previousPerf) {
    const total = sum(perf, salesAmount);
    const prevTotal = sum(previousPerf, salesAmount);
    const avg = perf.length ? total / perf.length : 0;
    const prevAvg = previousPerf.length ? prevTotal / previousPerf.length : 0;

    const platforms = Object.entries(groupBy(perf, r => r.platform_name || "미분류"))
      .map(([name, rs]) => ({
        name,
        avg: rs.length ? sum(rs, salesAmount) / rs.length : 0,
        total: sum(rs, salesAmount)
      }))
      .sort((a, b) => b.avg - a.avg);

    const products = Object.entries(groupBy(perf, r => productName(r)))
      .map(([name, rs]) => ({ name, total: sum(rs, salesAmount) }))
      .sort((a, b) => b.total - a.total);

    const confirmation = rows.length ? perf.length / rows.length * 100 : 0;
    const hotCount = rows.filter(isHot).length;
    const newCount = rows.filter(isNew).length;

    const parts = [];

    parts.push(
      `선택기간 식품방송 ${rows.length.toLocaleString("ko-KR")}회 중 실적 ${perf.length.toLocaleString("ko-KR")}회가 확인되어 확인률은 ${confirmation.toFixed(1)}%입니다.`
    );

    if (perf.length) {
      const totalPct = pctChange(total, prevTotal);
      const avgPct = pctChange(avg, prevAvg);

      let compareText = "";
      if (totalPct !== null && avgPct !== null) {
        compareText =
          ` 직전 동일기간 대비 총매출은 ${totalPct >= 0 ? "증가" : "감소"} ${Math.abs(totalPct).toFixed(1)}%, 방송당 평균매출은 ${avgPct >= 0 ? "증가" : "감소"} ${Math.abs(avgPct).toFixed(1)}%입니다.`;
      }

      parts.push(
        `총매출은 ${fmtWon(total)}, 방송당 평균매출은 ${fmtWon(avg)}입니다.${compareText}`
      );
    }

    if (platforms.length) {
      parts.push(
        `평균매출이 가장 높은 채널은 ${platforms[0].name}(${fmtWon(platforms[0].avg)})입니다.`
      );
    }

    if (products.length) {
      parts.push(
        `선택기간 총매출 1위 상품은 ${products[0].name}(${fmtWon(products[0].total)})입니다. HOT ${hotCount}건, NEW ${newCount}건이 감지되었습니다.`
      );
    }

    return parts;
  }

  function renderPerformance() {
    const root = $("#viewRoot");

    const rows = performanceRows();
    const perf = rows.filter(hasPerformance);

    const [prevFrom, prevTo] = previousPeriodRange(state.perf.from, state.perf.to);
    const previousRows = rowsForPerfRange(prevFrom, prevTo, state.perf);
    const previousPerf = previousRows.filter(hasPerformance);

    const salesValues = perf.map(salesAmount).filter(v => v > 0);
    const totalSales = sum(perf, salesAmount);
    const avgSales = perf.length ? totalSales / perf.length : 0;
    const medSales = median(salesValues);
    const maxSales = salesValues.length ? Math.max(...salesValues) : 0;
    const totalUnits = sum(perf, salesCount);

    const prevTotalSales = sum(previousPerf, salesAmount);
    const prevAvgSales = previousPerf.length ? prevTotalSales / previousPerf.length : 0;
    const prevUnits = sum(previousPerf, salesCount);

    const hotRows = rows.filter(isHot).sort((a, b) => salesAmount(b) - salesAmount(a));
    const newRows = rows.filter(isNew).sort((a, b) =>
      String(b.start_datetime || "").localeCompare(String(a.start_datetime || ""))
    );

    const byProduct = Object.entries(groupBy(perf, r => productName(r)))
      .map(([name, rs]) => ({
        name,
        rs,
        sales: sum(rs, salesAmount),
        avg: rs.length ? sum(rs, salesAmount) / rs.length : 0,
        med: median(rs.map(salesAmount)),
        max: Math.max(0, ...rs.map(salesAmount)),
        units: sum(rs, salesCount),
        channels: unique(rs.map(r => r.platform_name)).length
      }))
      .sort((a, b) => b.sales - a.sales);

    const byPlatform = Object.entries(groupBy(perf, r => r.platform_name || "미분류"))
      .map(([name, rs]) => ({
        name,
        rs,
        sales: sum(rs, salesAmount),
        avg: rs.length ? sum(rs, salesAmount) / rs.length : 0,
        med: median(rs.map(salesAmount)),
        max: Math.max(0, ...rs.map(salesAmount)),
        units: sum(rs, salesCount)
      }))
      .sort((a, b) => b.sales - a.sales);

    const hours = Array.from({ length: 24 }, (_, h) => {
      const rs = perf.filter(r => {
        const hour = Number((String(r.start_datetime || "").match(/T(\d{2}):/) || [,"-1"])[1]);
        return hour === h;
      });

      return {
        h,
        count: rs.length,
        sales: sum(rs, salesAmount),
        avg: rs.length ? sum(rs, salesAmount) / rs.length : 0
      };
    });

    const maxHourSales = Math.max(1, ...hours.map(x => x.sales));

    const lowProducts = byProduct
      .filter(x => x.rs.length >= 3)
      .slice()
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 10);

    const summaryLines = autoPerformanceSummary(
      rows, perf, previousRows, previousPerf
    );

    const platformGroups = byPlatform.map(p => ({
      ...p,
      allRows: rows
        .filter(r => (r.platform_name || "미분류") === p.name)
        .slice()
        .sort((a, b) =>
          String(b.start_datetime || "").localeCompare(String(a.start_datetime || ""))
        )
    }));

    root.innerHTML = `
      <section class="section-head">
        <div>
          <div class="eyebrow">PERFORMANCE DETAIL</div>
          <h2>실적 상세</h2>
        </div>
        <p>핵심 실적은 위에서, 상세 데이터는 필요한 경우에만 펼쳐봅니다.</p>
      </section>

      <section class="panel performance-filter">
        <div class="quick-range">
          <button data-quick-today type="button">당일</button>
          <button data-quick-yesterday type="button">전일</button>
          <button data-quick-days="7" type="button">최근 7일</button>
          <button data-quick-days="30" type="button">최근 30일</button>
          <button data-quick-month type="button">이번달</button>
          <button data-quick-all type="button">전체</button>
        </div>

        <div class="filter-grid">
          <label>시작일<input id="perfFrom" type="date" value="${esc(state.perf.from)}"></label>
          <label>종료일<input id="perfTo" type="date" value="${esc(state.perf.to)}"></label>

          <label>홈쇼핑사
            <select id="perfPlatform">
              <option value="">전체</option>
              ${allPlatforms().map(p => `<option ${state.perf.platform === p ? "selected" : ""}>${esc(p)}</option>`).join("")}
            </select>
          </label>

          <label>상품군
            <select id="perfGroup">
              <option value="">전체</option>
              ${allGroups().map(g => `<option ${state.perf.group === g ? "selected" : ""}>${esc(g)}</option>`).join("")}
            </select>
          </label>

          <label class="wide">
            상품/키워드
            <input id="perfQuery" value="${esc(state.perf.query)}" placeholder="예: 흑염소, 콘드로이친, 오한진">
          </label>

          <label>실적 상태
            <select id="perfStatus">
              <option value="all" ${state.perf.status === "all" ? "selected" : ""}>전체</option>
              <option value="confirmed" ${state.perf.status === "confirmed" ? "selected" : ""}>실적 확인</option>
              <option value="missing" ${state.perf.status === "missing" ? "selected" : ""}>미확인/예정</option>
            </select>
          </label>

          <label class="check-label">
            <input id="perfHotOnly" type="checkbox" ${state.perf.hotOnly ? "checked" : ""}>
            HOT만
          </label>

          <label class="check-label">
            <input id="perfNewOnly" type="checkbox" ${state.perf.newOnly ? "checked" : ""}>
            NEW만
          </label>

          <button id="perfReset" class="btn secondary filter-reset" type="button">필터 초기화</button>
        </div>
      </section>

      <section class="auto-summary panel">
        <div class="auto-summary-head">
          <div>
            <span class="eyebrow">AUTO BRIEF</span>
            <h3>선택기간 핵심 요약</h3>
          </div>
          <span class="confidence-badge ${rows.length && perf.length / rows.length >= .9 ? "good" : rows.length && perf.length / rows.length >= .7 ? "warn" : "bad"}">
            실적확인률 ${rows.length ? (perf.length / rows.length * 100).toFixed(1) : "0.0"}%
          </span>
        </div>
        <div class="auto-summary-lines">
          ${summaryLines.map(x => `<p>${esc(x)}</p>`).join("")}
        </div>
      </section>

      <section class="mini-kpis detail-kpis v26">
        <div>
          <span>방송</span>
          <strong>${fmtCount(rows.length)}</strong>
          ${compareBadge(rows.length, previousRows.length)}
        </div>

        <div>
          <span>실적 확인률</span>
          <strong>${rows.length ? (perf.length / rows.length * 100).toFixed(1) : "0.0"}%</strong>
          <small>${perf.length}/${rows.length}회</small>
        </div>

        <div>
          <span>총 매출</span>
          <strong>${fmtWon(totalSales)}</strong>
          ${compareBadge(totalSales, prevTotalSales)}
        </div>

        <div>
          <span>평균 매출</span>
          <strong>${fmtWon(avgSales)}</strong>
          ${compareBadge(avgSales, prevAvgSales)}
        </div>

        <div>
          <span>중앙값 매출</span>
          <strong>${fmtWon(medSales)}</strong>
          <small>이상치 영향 완화</small>
        </div>

        <div>
          <span>최고 매출</span>
          <strong>${fmtWon(maxSales)}</strong>
          <small>단일 방송 최고</small>
        </div>

        <div>
          <span>총 판매량</span>
          <strong>${totalUnits ? totalUnits.toLocaleString("ko-KR") : "-"}</strong>
          ${compareBadge(totalUnits, prevUnits)}
        </div>

        <div class="signal-kpi hot"><span>HOT 방송</span><strong>${hotRows.length}건</strong></div>
        <div class="signal-kpi new"><span>NEW 방송</span><strong>${newRows.length}건</strong></div>
      </section>

      <section class="analysis-grid v26-primary">
        <article class="panel analysis-card top-products-card">
          <div class="panel-title">
            <h3>매출 상위 상품 TOP 15</h3>
            <span>${byProduct.length}개 상품</span>
          </div>

          <div class="rank-list">
            ${byProduct.slice(0, 15).map((x, i) => `
              <div class="rank-row v26">
                <span class="rank">${i + 1}</span>
                <span class="rank-name">
                  ${esc(x.name)}
                  <small>${x.rs.length}회 · 평균 ${fmtWon(x.avg)}</small>
                </span>
                <span class="rank-value">${fmtWon(x.sales)}</span>
              </div>
            `).join("") || `<div class="empty-box">실적 데이터가 없습니다.</div>`}
          </div>
        </article>

        <article class="panel analysis-card hourly-sales-card">
          <div class="panel-title">
            <h3>시간대별 매출</h3>
            <span>00시~23시</span>
          </div>

          <div class="hour-sales-list">
            ${hours.map(x => `
              <div class="hour-sales-row">
                <span class="hour-label">${String(x.h).padStart(2, "0")}시</span>

                <div class="hour-bar-wrap">
                  <span class="bar-track">
                    <i style="width:${x.sales ? Math.max(2, x.sales / maxHourSales * 100) : 0}%"></i>
                  </span>
                </div>

                <span class="hour-count">${x.count}개</span>
                <strong>${fmtWon(x.sales)}</strong>
                <span class="hour-avg">평균 ${fmtWon(x.avg)}</span>
              </div>
            `).join("")}
          </div>
        </article>
      </section>

      <section class="signal-panels">
        <article class="panel analysis-card">
          <div class="panel-title">
            <h3>🔥 특별히 잘 나온 실적</h3>
            <span>HOT ${hotRows.length}건</span>
          </div>

          ${hotRows.length ? `
            <div class="compact-list">
              ${hotRows.slice(0, 8).map(r => `
                <button data-perf-show="${esc(r.hsshow_id || "")}" type="button">
                  <span>
                    ${badgesFor(r, true)} ${esc(productName(r))}
                    <small>${esc(r.broadcast_date)} ${esc(timeHHMM(r.start_datetime))} · ${esc(r.platform_name || "")}</small>
                  </span>
                  <strong>${fmtWon(salesAmount(r))}</strong>
                </button>
              `).join("")}
            </div>
          ` : `<div class="empty-box">선택 기간에 HOT 방송이 없습니다.</div>`}
        </article>

        <article class="panel analysis-card">
          <div class="panel-title">
            <h3>✨ 신규 등장 상품</h3>
            <span>NEW ${newRows.length}건</span>
          </div>

          ${newRows.length ? `
            <div class="compact-list">
              ${newRows.slice(0, 8).map(r => `
                <button data-perf-show="${esc(r.hsshow_id || "")}" type="button">
                  <span>
                    ${badgesFor(r, true)} ${esc(productName(r))}
                    <small>${esc(r.broadcast_date)} ${esc(timeHHMM(r.start_datetime))} · ${esc(r.platform_name || "")}</small>
                  </span>
                  <strong>${fmtWon(salesAmount(r))}</strong>
                </button>
              `).join("")}
            </div>
          ` : `<div class="empty-box">선택 기간에 NEW 상품이 없습니다.</div>`}
        </article>
      </section>

      <section class="panel table-panel">
        <div class="panel-title">
          <h3>홈쇼핑사별 실적</h3>
          <span>${byPlatform.length}개 채널</span>
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th>홈쇼핑사</th>
              <th class="num">방송</th>
              <th class="num">총매출</th>
              <th class="num">평균</th>
              <th class="num">중앙값</th>
              <th class="num">최고매출</th>
              <th class="num">판매량</th>
            </tr>
          </thead>

          <tbody>
            ${byPlatform.map(x => `
              <tr>
                <td>${esc(x.name)}</td>
                <td class="num">${x.rs.length}</td>
                <td class="num strong">${fmtWon(x.sales)}</td>
                <td class="num">${fmtWon(x.avg)}</td>
                <td class="num">${fmtWon(x.med)}</td>
                <td class="num">${fmtWon(x.max)}</td>
                <td class="num">${x.units.toLocaleString("ko-KR")}</td>
              </tr>
            `).join("") || `<tr><td colspan="7" class="empty-cell">데이터가 없습니다.</td></tr>`}
          </tbody>
        </table>
      </section>

      <details class="detail-section panel">
        <summary>
          <span>
            <strong>상품별 실적 상세</strong>
            <small>${byProduct.length}개 상품 · 필요할 때 펼쳐보기</small>
          </span>
          <span class="summary-action">펼치기</span>
        </summary>

        <div class="detail-section-body">
          <div class="detail-toolbar">
            <input id="productDetailSearch" placeholder="상품명 검색">
            <select id="productDetailSort">
              <option value="sales">총매출 높은순</option>
              <option value="avg">평균매출 높은순</option>
              <option value="count">방송수 많은순</option>
              <option value="latest">최근추세 중심</option>
            </select>
          </div>

          <div id="productDetailTable"></div>
        </div>
      </details>

      <details class="detail-section panel">
        <summary>
          <span>
            <strong>방송별 상세 내역</strong>
            <small>${rows.length}건 · 방송사별로 접어서 확인</small>
          </span>
          <span class="summary-action">펼치기</span>
        </summary>

        <div class="detail-section-body platform-accordion">
          ${platformGroups.map(p => `
            <details class="platform-detail">
              <summary>
                <span class="platform-name">${esc(p.name)}</span>
                <span>${p.allRows.length}회</span>
                <strong>${fmtWon(sum(p.allRows.filter(hasPerformance), salesAmount))}</strong>
                <small>평균 ${fmtWon(p.avg)}</small>
              </summary>

              <div class="platform-table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>날짜</th><th>시간</th><th>상품</th><th>표시</th>
                      <th class="num">판매량</th><th class="num">매출</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${p.allRows.map(r => `
                      <tr>
                        <td>${esc(r.broadcast_date)}</td>
                        <td>${esc(timeHHMM(r.start_datetime))}</td>
                        <td><button class="link-btn" data-perf-show="${esc(r.hsshow_id || "")}" type="button">${esc(productName(r))}</button></td>
                        <td>${badgesFor(r)}</td>
                        <td class="num">${salesCount(r) ? salesCount(r).toLocaleString("ko-KR") : "-"}</td>
                        <td class="num strong">${fmtWon(salesAmount(r))}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            </details>
          `).join("")}
        </div>
      </details>

      <details class="detail-section panel">
        <summary>
          <span>
            <strong>평균매출 하위 상품</strong>
            <small>방송 3회 이상 · 저성과 후보</small>
          </span>
          <span class="summary-action">펼치기</span>
        </summary>

        <div class="detail-section-body">
          <table class="data-table">
            <thead><tr><th>상품</th><th class="num">방송</th><th class="num">평균매출</th><th class="num">총매출</th></tr></thead>
            <tbody>
              ${lowProducts.map(x => `
                <tr>
                  <td>${esc(x.name)}</td>
                  <td class="num">${x.rs.length}</td>
                  <td class="num">${fmtWon(x.avg)}</td>
                  <td class="num">${fmtWon(x.sales)}</td>
                </tr>
              `).join("") || `<tr><td colspan="4" class="empty-cell">조건에 맞는 상품이 없습니다.</td></tr>`}
            </tbody>
          </table>
        </div>
      </details>
    `;

    function renderProductDetailTable() {
      const q = norm($("#productDetailSearch")?.value || "");
      const sort = $("#productDetailSort")?.value || "sales";

      let list = byProduct.filter(x => !q || norm(x.name).includes(q));

      list = list.slice();

      if (sort === "avg") list.sort((a, b) => b.avg - a.avg);
      else if (sort === "count") list.sort((a, b) => b.rs.length - a.rs.length);
      else if (sort === "latest") {
        list.sort((a, b) => {
          const aLast = a.rs.slice().sort((x, y) => String(y.start_datetime || "").localeCompare(String(x.start_datetime || "")))[0];
          const bLast = b.rs.slice().sort((x, y) => String(y.start_datetime || "").localeCompare(String(x.start_datetime || "")))[0];
          return String(bLast?.start_datetime || "").localeCompare(String(aLast?.start_datetime || ""));
        });
      } else list.sort((a, b) => b.sales - a.sales);

      const shown = list.slice(0, 40);

      $("#productDetailTable").innerHTML = `
        <div class="detail-count">검색 결과 ${list.length}개 · 상위 40개 표시</div>

        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>상품</th><th class="num">방송</th><th class="num">채널수</th>
                <th class="num">총매출</th><th class="num">평균</th><th class="num">최고</th>
                <th>최근 8회 추세</th>
              </tr>
            </thead>

            <tbody>
              ${shown.map(x => `
                <tr>
                  <td>${esc(x.name)}</td>
                  <td class="num">${x.rs.length}</td>
                  <td class="num">${x.channels}</td>
                  <td class="num strong">${fmtWon(x.sales)}</td>
                  <td class="num">${fmtWon(x.avg)}</td>
                  <td class="num">${fmtWon(x.max)}</td>
                  <td>${productTrendBars(x.rs)}</td>
                </tr>
              `).join("") || `<tr><td colspan="7" class="empty-cell">검색 결과가 없습니다.</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
    }

    const rerenderFromInputs = () => {
      state.perf.from = $("#perfFrom").value;
      state.perf.to = $("#perfTo").value;
      state.perf.platform = $("#perfPlatform").value;
      state.perf.group = $("#perfGroup").value;
      state.perf.query = $("#perfQuery").value;
      state.perf.status = $("#perfStatus").value;
      state.perf.hotOnly = $("#perfHotOnly").checked;
      state.perf.newOnly = $("#perfNewOnly").checked;
      renderPerformance();
    };

    ["perfFrom","perfTo","perfPlatform","perfGroup","perfStatus","perfHotOnly","perfNewOnly"]
      .forEach(id => $(`#${id}`).addEventListener("change", rerenderFromInputs));

    $("#perfQuery").addEventListener("change", rerenderFromInputs);

    $("[data-quick-today]").addEventListener("click", () => {
      const t = todayKST();
      state.perf.from = t;
      state.perf.to = t;
      renderPerformance();
    });

    $("[data-quick-yesterday]").addEventListener("click", () => {
      const y = dateKey(addDays(parseDateKey(todayKST()), -1));
      state.perf.from = y;
      state.perf.to = y;
      renderPerformance();
    });

    $$("[data-quick-days]").forEach(btn => btn.addEventListener("click", () => {
      const t = todayKST();
      state.perf.to = t;
      state.perf.from = dateKey(addDays(parseDateKey(t), -(Number(btn.dataset.quickDays) - 1)));
      renderPerformance();
    }));

    $("[data-quick-month]").addEventListener("click", () => {
      const d = parseDateKey(todayKST());
      state.perf.from = dateKey(startOfMonth(d));
      state.perf.to = todayKST();
      renderPerformance();
    });

    $("[data-quick-all]").addEventListener("click", () => {
      const dates = state.rows.map(r => r.broadcast_date).filter(Boolean).sort();
      state.perf.from = dates[0] || "";
      state.perf.to = dates[dates.length - 1] || "";
      renderPerformance();
    });

    $("#perfReset").addEventListener("click", () => {
      const [from, to] = defaultPerfRange();

      state.perf = {
        from, to, platform: "", query: "", group: "", status: "all",
        hotOnly: false, newOnly: false
      };

      renderPerformance();
    });

    $$("[data-perf-show]").forEach(btn => btn.addEventListener("click", () => {
      const r = state.rows.find(x => String(x.hsshow_id) === String(btn.dataset.perfShow));
      if (r) openBroadcastModal(r);
    }));

    $("#productDetailSearch")?.addEventListener("input", renderProductDetailTable);
    $("#productDetailSort")?.addEventListener("change", renderProductDetailTable);
    renderProductDetailTable();

    $$("details.detail-section").forEach(d => {
      d.addEventListener("toggle", () => {
        const label = $(".summary-action", d);
        if (label) label.textContent = d.open ? "접기" : "펼치기";
      });
    });

    renderKPIs(rows);
  }


  function matchReviewOccurrences(item) {
    const raw = norm(
      item.raw_title ||
      item.title ||
      item.match_keyword ||
      item.standard_product_name ||
      ""
    );

    if (!raw) return [];

    return state.rows
      .filter(r => {
        const candidates = [
          r.raw_title,
          r.normalized_title,
          r.standard_product_name
        ].map(norm);

        return candidates.some(c =>
          c === raw ||
          (raw.length >= 6 && (c.includes(raw) || raw.includes(c)))
        );
      })
      .sort((a, b) =>
        String(b.start_datetime || "").localeCompare(
          String(a.start_datetime || "")
        )
      );
  }

  function reviewKey(item) {
    return String(item.hsshow_id || item.raw_title || item.match_keyword || item.standard_product_name || "").trim();
  }

  function getReviewItems() {
    const pending = state.pending.map(x => ({
      ...x,
      raw_title: x.raw_title || x.title || x.match_keyword || x.standard_product_name || ""
    }));

    const masterNeeds = state.master
      .filter(r => {
        const s = norm(`${r.review_status} ${r.enabled}`);
        return s.includes("확인") || s.includes("pending") || String(r.enabled || "").toUpperCase() === "N";
      })
      .map(r => ({
        hsshow_id: "",
        broadcast_date: "",
        start_datetime: "",
        platform_name: "",
        raw_title: r.match_keyword || r.standard_product_name || "",
        reason: r.review_status || "product_master 확인 필요"
      }));

    const map = new Map();
    [...pending, ...masterNeeds].forEach(x => {
      const k = reviewKey(x);
      if (k && !map.has(k)) map.set(k, x);
    });
    return [...map.values()].map(item => ({
      ...item,
      occurrences: matchReviewOccurrences(item)
    }));
  }

  function bigrams(s) {
    const t = norm(s).replace(/\s+/g, "");
    const set = new Set();
    for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
    if (!set.size && t) set.add(t);
    return set;
  }

  function similarity(a, b) {
    const A = bigrams(a);
    const B = bigrams(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach(x => { if (B.has(x)) inter++; });
    const dice = (2 * inter) / (A.size + B.size);

    const ta = new Set(norm(a).split(" ").filter(Boolean));
    const tb = new Set(norm(b).split(" ").filter(Boolean));
    let ti = 0;
    ta.forEach(x => { if (tb.has(x)) ti++; });
    const union = new Set([...ta, ...tb]).size || 1;
    const jac = ti / union;
    return Math.round((dice * 0.72 + jac * 0.28) * 100);
  }

  function masterCandidates(raw, limit = 5) {
    const bestByName = new Map();
    state.master.forEach(m => {
      const name = m.standard_product_name || m.match_keyword;
      if (!name) return;
      const score = Math.max(
        similarity(raw, name),
        similarity(raw, `${m.brand || ""} ${name}`),
        similarity(raw, m.match_keyword || "")
      );
      const old = bestByName.get(name);
      if (!old || score > old.score) bestByName.set(name, { ...m, score });
    });
    return [...bestByName.values()].sort((a,b) => b.score - a.score).slice(0, limit);
  }

  function renderReview() {
    const items = getReviewItems();
    const q = norm(state.reviewQuery || "");
    const filter = state.reviewFilter || "pending";

    const shown = items.filter(x => {
      const done = !!state.reviewDrafts[reviewKey(x)];

      if (filter === "pending" && done) return false;
      if (filter === "done" && !done) return false;

      if (q && !norm([x.raw_title, x.reason].join(" ")).includes(q)) return false;

      const occ = x.occurrences || [];

      if (state.reviewPlatform && !occ.some(r => r.platform_name === state.reviewPlatform)) {
        return false;
      }

      if (state.reviewFrom && !occ.some(r => r.broadcast_date >= state.reviewFrom)) {
        return false;
      }

      if (state.reviewTo && !occ.some(r => r.broadcast_date <= state.reviewTo)) {
        return false;
      }

      return true;
    });

    $("#viewRoot").innerHTML = `
      <section class="section-head">
        <div>
          <div class="eyebrow">PRODUCT REVIEW</div>
          <h2>상품 확인</h2>
        </div>
        <div class="head-actions">
          <button id="exportReviewDrafts" class="btn secondary" type="button">결정 내역 내보내기</button>
        </div>
      </section>

      <div class="notice warning">
        <strong>상품명뿐 아니라 실제 방송일·시간·홈쇼핑사를 함께 확인할 수 있습니다.</strong>
        <span>동일 원본명이 여러 차례 방송된 경우 최근 방송과 전체 방송이력을 함께 표시합니다.</span>
      </div>

      <section class="panel review-toolbar review-filter-grid">
        <label class="grow">
          상품 검색
          <input id="reviewQuery" value="${esc(state.reviewQuery || "")}" placeholder="미확인 상품 검색">
        </label>

        <label>
          홈쇼핑사
          <select id="reviewPlatform">
            <option value="">전체</option>
            ${allPlatforms().map(p => `<option ${state.reviewPlatform === p ? "selected" : ""}>${esc(p)}</option>`).join("")}
          </select>
        </label>

        <label>
          방송 시작일
          <input id="reviewFrom" type="date" value="${esc(state.reviewFrom || "")}">
        </label>

        <label>
          방송 종료일
          <input id="reviewTo" type="date" value="${esc(state.reviewTo || "")}">
        </label>

        <div class="segmented">
          <button data-review-filter="pending" class="${filter === "pending" ? "active" : ""}" type="button">미확인</button>
          <button data-review-filter="done" class="${filter === "done" ? "active" : ""}" type="button">결정완료</button>
          <button data-review-filter="all" class="${filter === "all" ? "active" : ""}" type="button">전체</button>
        </div>

        <span class="toolbar-count">${shown.length}건</span>
      </section>

      <section class="review-list">
        ${shown.length ? shown.map((x, i) => {
          const draft = state.reviewDrafts[reviewKey(x)];
          const occ = x.occurrences || [];
          const latest = occ[0];
          const channels = unique(occ.map(r => r.platform_name));

          return `
            <article class="review-card">
              <div class="review-main">
                <strong>${esc(x.raw_title || "상품명 미확인")}</strong>

                ${latest ? `
                  <p>
                    <b>최근 방송</b>
                    ${esc(latest.broadcast_date)} ${esc(timeHHMM(latest.start_datetime))}
                    · ${esc(latest.platform_name || "")}
                  </p>
                ` : `<p>방송 이력을 food_broadcasts.csv에서 찾지 못했습니다.</p>`}

                <small>
                  방송 ${occ.length}회
                  ${channels.length ? ` · ${esc(channels.join(", "))}` : ""}
                  · ${esc(x.reason || "기존상품 연결 / 신규상품 등록 여부 확인 필요")}
                </small>
              </div>

              <div class="review-side">
                ${draft
                  ? `<span class="status ok">${draft.action === "existing" ? "기존상품 연결" : draft.action === "new" ? "신규상품" : "제외"} 저장됨</span>`
                  : `<span class="status pending">확인필요</span>`}

                ${occ.length
                  ? `<button class="btn small secondary" data-review-history="${i}" type="button">방송이력</button>`
                  : ""}

                <button class="btn small primary" data-review-open="${i}" type="button">
                  ${draft ? "결정 수정" : "확인"}
                </button>
              </div>
            </article>`;
        }).join("") : `<div class="empty-box large">조건에 맞는 상품 확인 항목이 없습니다.</div>`}
      </section>
    `;

    const rerender = () => {
      state.reviewQuery = $("#reviewQuery").value;
      state.reviewPlatform = $("#reviewPlatform").value;
      state.reviewFrom = $("#reviewFrom").value;
      state.reviewTo = $("#reviewTo").value;
      renderReview();
    };

    ["reviewQuery","reviewPlatform","reviewFrom","reviewTo"]
      .forEach(id => $(`#${id}`).addEventListener("change", rerender));

    $$("[data-review-filter]").forEach(btn => btn.addEventListener("click", () => {
      state.reviewFilter = btn.dataset.reviewFilter;
      renderReview();
    }));

    $$("[data-review-open]").forEach(btn => btn.addEventListener("click", () => {
      openReviewModal(shown[Number(btn.dataset.reviewOpen)]);
    }));

    $$("[data-review-history]").forEach(btn => btn.addEventListener("click", () => {
      openReviewHistory(shown[Number(btn.dataset.reviewHistory)]);
    }));

    $("#exportReviewDrafts").addEventListener("click", exportReviewDrafts);

    renderKPIs();
  }

  function openReviewHistory(item) {
    const rows = item.occurrences || [];

    showModal(`
      <div class="modal-head">
        <div>
          <h3>방송 이력</h3>
          <p>${esc(item.raw_title || "")}</p>
        </div>
        <button class="modal-close" data-close-modal type="button">×</button>
      </div>

      <div class="modal-list">
        ${rows.length ? rows.map(r => `
          <div class="history-row">
            <span>${esc(r.broadcast_date)} ${esc(timeHHMM(r.start_datetime))}</span>
            <strong>${esc(r.platform_name || "")}</strong>
            <em>${fmtWon(salesAmount(r))}</em>
          </div>
        `).join("") : `<div class="empty-box">방송 이력이 없습니다.</div>`}
      </div>
    `);
  }

  function openReviewModal(item) {
    const key = reviewKey(item);
    const candidates = masterCandidates(item.raw_title || "", 6);
    const current = state.reviewDrafts[key];

    showModal(`
      <div class="modal-head">
        <div>
          <h3>상품 확인</h3>
          <p>${esc(item.raw_title || "")}</p>
          ${(item.occurrences || [])[0] ? `
            <p>
              최근방송:
              ${esc(item.occurrences[0].broadcast_date)}
              ${esc(timeHHMM(item.occurrences[0].start_datetime))}
              · ${esc(item.occurrences[0].platform_name || "")}
            </p>
          ` : ""}
        </div>
        <button class="modal-close" data-close-modal type="button">×</button>
      </div>

      <div class="review-modal-section">
        <h4>유사한 기존 상품</h4>
        <div class="candidate-list">
          ${candidates.length ? candidates.map((m, i) => `
            <div class="candidate-row">
              <div>
                <strong>${esc(m.standard_product_name || m.match_keyword)}</strong>
                <small>${esc([m.brand, m.product_group, m.main_ingredient].filter(Boolean).join(" · ") || "부가정보 없음")}</small>
              </div>
              <div class="candidate-action">
                <span class="score">${m.score}%</span>
                <button class="btn small secondary" data-link-existing="${i}" type="button">이 제품으로 연결</button>
              </div>
            </div>`).join("") : `<div class="empty-box">유사 후보를 찾지 못했습니다.</div>`}
        </div>
      </div>

      <div class="review-modal-section new-product-box">
        <h4>신규 제품으로 등록</h4>
        <div class="form-grid">
          <label class="wide">표준 상품명<input id="newStandardName" value="${esc(current?.action === "new" ? current.standard_product_name : "")}" placeholder="정확한 상품명"></label>
          <label>브랜드<input id="newBrand" value="${esc(current?.brand || "")}" placeholder="브랜드"></label>
          <label>상품군<input id="newGroup" value="${esc(current?.product_group || "")}" placeholder="예: 과채주스"></label>
          <label>주원료<input id="newIngredient" value="${esc(current?.main_ingredient || "")}" placeholder="예: 흑염소"></label>
        </div>
        <button id="saveNewProduct" class="btn primary" type="button">신규상품 결정 저장</button>
      </div>

      <div class="modal-actions split">
        <button id="excludeProduct" class="btn danger-ghost" type="button">식품 모니터링에서 제외</button>
        ${current ? `<button id="clearReviewDecision" class="btn secondary" type="button">현재 결정 취소</button>` : ""}
      </div>
    `, root => {
      $$("[data-link-existing]", root).forEach(btn => btn.addEventListener("click", () => {
        const m = candidates[Number(btn.dataset.linkExisting)];
        state.reviewDrafts[key] = {
          action: "existing",
          raw_title: item.raw_title,
          match_keyword: item.raw_title,
          standard_product_name: m.standard_product_name || m.match_keyword,
          brand: m.brand || "",
          product_group: m.product_group || "",
          main_ingredient: m.main_ingredient || "",
          saved_at: new Date().toISOString()
        };
        saveReviewDrafts();
        closeModal();
        renderReview();
        toast("기존 상품 연결 결정이 저장되었습니다.");
      }));

      $("#saveNewProduct").addEventListener("click", () => {
        const name = $("#newStandardName").value.trim();
        if (!name) return toast("표준 상품명을 입력해주세요.");
        state.reviewDrafts[key] = {
          action: "new",
          raw_title: item.raw_title,
          match_keyword: item.raw_title,
          standard_product_name: name,
          brand: $("#newBrand").value.trim(),
          product_group: $("#newGroup").value.trim(),
          main_ingredient: $("#newIngredient").value.trim(),
          saved_at: new Date().toISOString()
        };
        saveReviewDrafts();
        closeModal();
        renderReview();
        toast("신규상품 등록 결정이 저장되었습니다.");
      });

      $("#excludeProduct").addEventListener("click", () => {
        state.reviewDrafts[key] = {
          action: "exclude",
          raw_title: item.raw_title,
          saved_at: new Date().toISOString()
        };
        saveReviewDrafts();
        closeModal();
        renderReview();
        toast("제외 결정이 저장되었습니다.");
      });

      $("#clearReviewDecision")?.addEventListener("click", () => {
        delete state.reviewDrafts[key];
        saveReviewDrafts();
        closeModal();
        renderReview();
      });
    });
  }

  function exportReviewDrafts() {
    const blob = new Blob([JSON.stringify({
      exported_at: new Date().toISOString(),
      count: Object.keys(state.reviewDrafts).length,
      decisions: state.reviewDrafts
    }, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `product_review_decisions_${todayKST()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function watchProductCatalog() {
    const map = new Map();
    state.rows.forEach(r => {
      const k = productKey(r);
      if (!k) return;
      const old = map.get(k);
      if (!old || r.broadcast_date > old.broadcast_date) map.set(k, r);
    });
    return [...map.entries()].map(([key, row]) => ({ key, row }))
      .sort((a,b) => productName(a.row).localeCompare(productName(b.row), "ko"));
  }

  function keywordStats(keyword) {
    const q = norm(keyword);
    const latest = state.rows.map(r => r.broadcast_date).filter(Boolean).sort().pop() || todayKST();
    const from = dateKey(addDays(parseDateKey(latest), -29));
    const rows = state.rows.filter(r => {
      if (r.broadcast_date < from || r.broadcast_date > latest) return false;
      const hay = norm([productName(r), r.raw_title, r.brand, r.product_group, r.main_ingredient].join(" "));
      return hay.includes(q);
    });
    const products = unique(rows.map(productName));
    return { rows, products, sales: sum(rows.filter(hasPerformance), salesAmount) };
  }

  function renderWatch() {
    const catalog = watchProductCatalog();
    const q = norm(state.watchSearch || "");
    const suggestions = q ? catalog.filter(x => norm(productName(x.row)).includes(q)).slice(0, 8) : [];

    $("#viewRoot").innerHTML = `
      <section class="section-head">
        <div><div class="eyebrow">WATCHLIST</div><h2>관심상품</h2></div>
        <p>특정 상품뿐 아니라 '흑염소' 같은 시장 키워드 전체를 지속적으로 모니터링할 수 있습니다.</p>
      </section>

      <section class="watch-grid">
        <article class="panel watch-add-card">
          <h3>관심 키워드 등록</h3>
          <p>상품명·브랜드·상품군·주원료에 키워드가 포함된 방송을 한 번에 묶습니다.</p>
          <div class="inline-form">
            <input id="watchKeywordInput" placeholder="예: 흑염소, 레몬, 콘드로이친" />
            <button id="addWatchKeyword" class="btn primary" type="button">키워드 등록</button>
          </div>
        </article>

        <article class="panel watch-add-card">
          <h3>특정 상품 등록</h3>
          <p>개별 상품을 정확히 지정해 별도로 추적합니다.</p>
          <div class="search-box">
            <input id="watchProductSearch" value="${esc(state.watchSearch || "")}" placeholder="상품명 검색" autocomplete="off" />
            ${suggestions.length ? `<div class="search-suggestions">
              ${suggestions.map((x, i) => `<button data-watch-suggest="${i}" type="button">${esc(productName(x.row))}<small>${esc(x.row.platform_name || "")}</small></button>`).join("")}
            </div>` : ""}
          </div>
        </article>
      </section>

      <section class="watch-section">
        <div class="panel-title"><h3>관심 키워드</h3><span>${state.watchKeywords.length}개</span></div>
        <div class="watch-cards">
          ${state.watchKeywords.length ? state.watchKeywords.map((k, i) => {
            const s = keywordStats(k);
            return `
              <article class="watch-card">
                <div class="watch-card-head">
                  <strong>★ ${esc(k)}</strong>
                  <button data-remove-keyword="${i}" class="text-danger" type="button">삭제</button>
                </div>
                <div class="watch-metrics">
                  <div><span>최근 30일 방송</span><strong>${s.rows.length}회</strong></div>
                  <div><span>일치 상품</span><strong>${s.products.length}개</strong></div>
                  <div><span>확인 매출</span><strong>${fmtWon(s.sales)}</strong></div>
                </div>
                <div class="tag-list">${s.products.slice(0, 6).map(p => `<span>${esc(p)}</span>`).join("")}${s.products.length > 6 ? `<span>+${s.products.length - 6}</span>` : ""}</div>
              </article>`;
          }).join("") : `<div class="empty-box large">아직 관심 키워드가 없습니다. 예: <strong>흑염소</strong>를 등록해보세요.</div>`}
        </div>
      </section>

      <section class="watch-section">
        <div class="panel-title"><h3>관심 상품</h3><span>${state.watchProducts.size}개</span></div>
        <div class="watch-cards">
          ${state.watchProducts.size ? [...state.watchProducts].map(key => {
            const all = state.rows.filter(r => productKey(r) === key);
            const latest = all.sort((a,b) => String(b.broadcast_date).localeCompare(String(a.broadcast_date)))[0];
            const perf = all.filter(hasPerformance);
            return latest ? `
              <article class="watch-card">
                <div class="watch-card-head">
                  <strong>★ ${esc(productName(latest))}</strong>
                  <button data-remove-product="${esc(key)}" class="text-danger" type="button">삭제</button>
                </div>
                <div class="watch-metrics">
                  <div><span>수집 방송</span><strong>${all.length}회</strong></div>
                  <div><span>누적 확인 매출</span><strong>${fmtWon(sum(perf, salesAmount))}</strong></div>
                  <div><span>최근 방송</span><strong>${esc(latest.broadcast_date || "-")}</strong></div>
                </div>
              </article>` : "";
          }).join("") : `<div class="empty-box large">일간 캘린더의 ☆ 또는 위 상품 검색으로 관심상품을 등록하세요.</div>`}
        </div>
      </section>
    `;

    $("#addWatchKeyword").addEventListener("click", () => {
      const v = $("#watchKeywordInput").value.trim();
      if (!v) return;
      if (!state.watchKeywords.some(x => norm(x) === norm(v))) {
        state.watchKeywords.push(v);
        saveWatchKeywords();
      }
      state.watchSearch = "";
      renderWatch();
      toast(`'${v}' 키워드를 관심목록에 등록했습니다.`);
    });

    $("#watchKeywordInput").addEventListener("keydown", e => {
      if (e.key === "Enter") $("#addWatchKeyword").click();
    });

    $("#watchProductSearch").addEventListener("input", e => {
      state.watchSearch = e.target.value;
      renderWatch();
      setTimeout(() => {
        const input = $("#watchProductSearch");
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      }, 0);
    });

    $$("[data-watch-suggest]").forEach(btn => btn.addEventListener("click", () => {
      const x = suggestions[Number(btn.dataset.watchSuggest)];
      state.watchProducts.add(x.key);
      saveWatchProducts();
      state.watchSearch = "";
      renderWatch();
      toast("관심상품에 등록했습니다.");
    }));

    $$("[data-remove-keyword]").forEach(btn => btn.addEventListener("click", () => {
      state.watchKeywords.splice(Number(btn.dataset.removeKeyword), 1);
      saveWatchKeywords();
      renderWatch();
    }));

    $$("[data-remove-product]").forEach(btn => btn.addEventListener("click", () => {
      state.watchProducts.delete(btn.dataset.removeProduct);
      saveWatchProducts();
      renderWatch();
    }));

    renderKPIs();
  }

  async function init() {
    loadLocal();
    state.cursor = parseDateKey(todayKST());

    try {
      const [dataText, masterText, pendingJson] = await Promise.all([
        fetchText(DATA_URL),
        fetchText(MASTER_URL),
        fetchJsonSafe(PENDING_URL)
      ]);

      state.rows = parseCSV(dataText);
      state.master = parseCSV(masterText);
      state.pending = extractPending(pendingJson);

      buildSignalIndexes();

      const [from, to] = defaultPerfRange();
      state.perf.from = from;
      state.perf.to = to;

      $("#updatedAt").textContent = latestUpdateText()
        ? `최근 데이터 갱신: ${latestUpdateText()}`
        : `방송 데이터 ${state.rows.length.toLocaleString("ko-KR")}건`;
      $("#rowCount").textContent = `정상 로드 · ${state.rows.length.toLocaleString("ko-KR")}건`;

      renderTabs();
      render();
    } catch (err) {
      console.error(err);
      $("#updatedAt").textContent = "데이터 로드 실패";
      $("#viewRoot").innerHTML = `
        <div class="notice error">
          <strong>데이터를 불러오지 못했습니다.</strong>
          <span>${esc(err.message)}</span>
        </div>`;
    }
  }

  $$(".tab").forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

  $("#todayBtn").addEventListener("click", () => {
    state.cursor = parseDateKey(todayKST());
    state.tab = "calendar";
    renderTabs();
    renderCalendar();
  });

  $("#refreshBtn").addEventListener("click", () => location.reload());

  init();
})();
