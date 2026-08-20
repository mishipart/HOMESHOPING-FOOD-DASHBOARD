(() => {
  const PATHS = {
    broadcasts: "../data/food_broadcasts.csv",
    productMaster: "../data/product_master.csv",
    pending: "../reports/pending_products.json",
    manual: "../reports/manual_review.json"
  };

  const state = {
    broadcasts: [],
    productMaster: [],
    pending: [],
    manual: [],
    view: "month",
    cursor: todayKST(),
    platform: "",
    search: "",
    interestOnly: false,
    interests: new Set(JSON.parse(localStorage.getItem("hs_food_interests") || "[]"))
  };

  const $ = (id) => document.getElementById(id);
  const fmtMoney = new Intl.NumberFormat("ko-KR");
  const fmtCount = new Intl.NumberFormat("ko-KR");

  function todayKST() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return new Date(`${map.year}-${map.month}-${map.day}T12:00:00+09:00`);
  }

  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseDateKey(s) {
    return new Date(`${s}T12:00:00+09:00`);
  }

  function startOfWeek(d) {
    const x = new Date(d);
    const dow = x.getDay();
    x.setDate(x.getDate() - dow);
    return x;
  }

  function addDays(d, n) {
    const x = new Date(d); x.setDate(x.getDate() + n); return x;
  }

  function escapeHtml(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (inQuotes) {
        if (c === '"' && n === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift().map(h => h.replace(/^\uFEFF/, "").trim());
    return rows.filter(r => r.some(v => v !== "")).map(r => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = r[i] ?? "");
      return obj;
    });
  }

  async function fetchText(path) {
    const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.text();
  }

  async function fetchJsonSafe(path) {
    try {
      const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  function extractArray(obj, preferred = []) {
    if (!obj) return [];
    if (Array.isArray(obj)) return obj;
    for (const key of preferred) if (Array.isArray(obj[key])) return obj[key];
    for (const value of Object.values(obj)) if (Array.isArray(value)) return value;
    return [];
  }

  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replaceAll(",", ""));
    return Number.isFinite(n) ? n : null;
  }

  function productName(r) {
    return (r.standard_product_name || r.normalized_title || r.raw_title || "상품명 미확인").trim();
  }

  function interestKey(r) {
    return (r.standard_product_name || r.normalized_title || r.raw_title || r.hsshow_id || "").trim();
  }

  function isPastDate(key) {
    return key < dateKey(todayKST());
  }

  function filteredRows() {
    return state.broadcasts.filter(r => {
      if (state.platform && r.platform_name !== state.platform) return false;
      if (state.search) {
        const hay = `${productName(r)} ${r.raw_title || ""} ${r.platform_name || ""}`.toLowerCase();
        if (!hay.includes(state.search.toLowerCase())) return false;
      }
      if (state.interestOnly && !state.interests.has(interestKey(r))) return false;
      return true;
    });
  }

  function rangeForView() {
    const c = state.cursor;
    if (state.view === "day") {
      const k = dateKey(c); return [k, k];
    }
    if (state.view === "week") {
      const s = startOfWeek(c), e = addDays(s, 6);
      return [dateKey(s), dateKey(e)];
    }
    const y = c.getFullYear(), m = c.getMonth();
    return [dateKey(new Date(y, m, 1, 12)), dateKey(new Date(y, m + 1, 0, 12))];
  }

  function rowsInSelectedRange() {
    const [a, b] = rangeForView();
    return filteredRows().filter(r => r.broadcast_date >= a && r.broadcast_date <= b);
  }

  function renderKPIs() {
    const rows = rowsInSelectedRange();
    const salesRows = rows.filter(r => num(r.sales_amt) !== null);
    const totalSales = salesRows.reduce((s, r) => s + num(r.sales_amt), 0);
    $("kpiBroadcasts").textContent = `${fmtCount.format(rows.length)}회`;
    $("kpiSales").textContent = totalSales ? `${fmtMoney.format(Math.round(totalSales / 10000))}만원` : "-";
    $("kpiAvgSales").textContent = salesRows.length ? `${fmtMoney.format(Math.round((totalSales / salesRows.length) / 10000))}만원` : "-";
    $("kpiPending").textContent = `${fmtCount.format(state.pending.length)}건`;
    $("kpiManual").textContent = `${fmtCount.format(state.manual.length)}건`;
  }

  function renderPeriodTitle() {
    const c = state.cursor;
    if (state.view === "month") $("periodTitle").textContent = `${c.getFullYear()}년 ${c.getMonth()+1}월`;
    else if (state.view === "week") {
      const s = startOfWeek(c), e = addDays(s, 6);
      $("periodTitle").textContent = `${s.getMonth()+1}.${s.getDate()} – ${e.getMonth()+1}.${e.getDate()}`;
    } else {
      $("periodTitle").textContent = `${c.getFullYear()}년 ${c.getMonth()+1}월 ${c.getDate()}일`;
    }
  }

  function monthCellSummary(key, rows) {
    const today = dateKey(todayKST());
    const salesRows = rows.filter(r => num(r.sales_amt) !== null);
    const totalSales = salesRows.reduce((s, r) => s + num(r.sales_amt), 0);
    const interests = rows.filter(r => state.interests.has(interestKey(r))).length;
    const future = key > today;
    return `
      <div class="month-summary">
        <span class="summary-pill count">식품방송 ${rows.length}회</span>
        ${totalSales ? `<span class="summary-pill sales">매출 ${fmtMoney.format(Math.round(totalSales/10000))}만원</span>` : ""}
        ${future ? `<span class="summary-pill future">예정 ${rows.length}회</span>` : ""}
        ${interests ? `<span class="summary-pill watch">관심상품 ${interests}건</span>` : ""}
      </div>`;
  }

  function renderMonth() {
    const rows = filteredRows();
    const byDate = groupBy(rows, r => r.broadcast_date);
    const c = state.cursor, first = new Date(c.getFullYear(), c.getMonth(), 1, 12);
    const gridStart = addDays(first, -first.getDay());
    const weekdays = ["일","월","화","수","목","금","토"];
    let html = `<div class="month-grid">${weekdays.map(d => `<div class="weekday">${d}</div>`).join("")}`;
    for (let i=0; i<42; i++) {
      const d = addDays(gridStart, i), key = dateKey(d);
      const dayRows = byDate[key] || [];
      const other = d.getMonth() !== c.getMonth();
      const today = key === dateKey(todayKST());
      html += `
        <div class="month-cell ${other ? "other-month" : ""} ${today ? "today" : ""}">
          <div class="day-number">${d.getDate()}</div>
          ${dayRows.length ? monthCellSummary(key, dayRows) : ""}
          <button class="cell-button" data-open-day="${key}" aria-label="${key} 상세보기"></button>
        </div>`;
    }
    html += `</div>`;
    $("calendarRoot").innerHTML = html;
    document.querySelectorAll("[data-open-day]").forEach(btn => btn.addEventListener("click", () => {
      state.cursor = parseDateKey(btn.dataset.openDay);
      state.view = "day";
      syncViewButtons(); renderAll();
    }));
  }

  function renderWeek() {
    const start = startOfWeek(state.cursor);
    const days = Array.from({length:7}, (_,i) => addDays(start,i));
    const rows = filteredRows().filter(r => r.broadcast_date >= dateKey(days[0]) && r.broadcast_date <= dateKey(days[6]));
    const byDayHour = groupBy(rows, r => `${r.broadcast_date}|${String(new Date(r.start_datetime).getHours()).padStart(2,"0")}`);
    let html = `<div class="week-board"><div class="week-corner week-head"></div>`;
    for (const d of days) html += `<div class="week-day-head week-head">${["일","월","화","수","목","금","토"][d.getDay()]}<small>${d.getMonth()+1}/${d.getDate()}</small></div>`;
    for (let hour=0; hour<24; hour++) {
      html += `<div class="week-hour">${String(hour).padStart(2,"0")}:00</div>`;
      for (const d of days) {
        const key = `${dateKey(d)}|${String(hour).padStart(2,"0")}`;
        const slot = byDayHour[key] || [];
        html += `<div class="week-slot">` + slot.map(r => {
          const t = timeHHMM(r.start_datetime);
          const interest = state.interests.has(interestKey(r));
          return `<button class="event-chip ${isPastDate(r.broadcast_date) ? "past" : ""} ${interest ? "interest":""}" data-show-id="${escapeHtml(r.hsshow_id)}">
            <strong>${escapeHtml(t)} ${escapeHtml(productName(r))}</strong><span>${escapeHtml(r.platform_name || "")}</span>
          </button>`;
        }).join("") + `</div>`;
      }
    }
    html += `</div>`;
    $("calendarRoot").innerHTML = html;
    attachEventChips();
  }

  function renderDay() {
    const key = dateKey(state.cursor);
    const rows = filteredRows().filter(r => r.broadcast_date === key).sort((a,b) => (a.start_datetime||"").localeCompare(b.start_datetime||""));
    const salesRows = rows.filter(r => num(r.sales_amt) !== null);
    const total = salesRows.reduce((s,r) => s+num(r.sales_amt),0);
    const interests = rows.filter(r => state.interests.has(interestKey(r))).length;
    let html = `<div class="day-board">
      <div class="day-summary">
        <span>방송 ${rows.length}회</span>
        <span>실적 확인 ${salesRows.length}회</span>
        <span>매출 ${total ? fmtMoney.format(Math.round(total/10000))+"만원" : "-"}</span>
        <span>관심상품 ${interests}건</span>
      </div>
      <div class="table-wrap"><table><thead><tr>
        <th></th><th>시간</th><th>홈쇼핑사</th><th>상품</th><th>판매량</th><th>매출</th><th>상태</th>
      </tr></thead><tbody>`;
    html += rows.map(r => {
      const keyI = interestKey(r), active = state.interests.has(keyI);
      const sc = num(r.sales_cnt), sa = num(r.sales_amt);
      const status = r.performance_status || (sa !== null ? "captured" : "scheduled");
      return `<tr>
        <td><button class="star-btn ${active?"active":""}" data-interest="${escapeHtml(keyI)}">★</button></td>
        <td>${escapeHtml(timeHHMM(r.start_datetime))}</td>
        <td>${escapeHtml(r.platform_name || "")}</td>
        <td class="product-cell"><strong>${escapeHtml(productName(r))}</strong><br><span class="subtle">${escapeHtml(r.raw_title || "")}</span></td>
        <td>${sc === null ? "-" : fmtCount.format(sc)}</td>
        <td class="money">${sa === null ? "-" : fmtMoney.format(Math.round(sa/10000))+"만원"}</td>
        <td><span class="status ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></td>
      </tr>`;
    }).join("");
    html += `</tbody></table></div></div>`;
    $("calendarRoot").innerHTML = html;
    attachInterestButtons();
  }

  function statusLabel(s) {
    const map = {
      captured:"수집완료", final:"최종", manual:"수동보정", provisional_23h:"23시 잠정",
      needs_nextday:"다음날 확인", missing:"실적 미확인", scheduled:"예정", needs_manual:"수동확인"
    };
    return map[s] || s || "-";
  }

  function timeHHMM(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone:"Asia/Seoul", hour:"2-digit", minute:"2-digit", hour12:false
    }).format(d);
  }

  function groupBy(arr, fn) {
    return arr.reduce((acc, x) => {
      const k = fn(x); (acc[k] ||= []).push(x); return acc;
    }, {});
  }

  function attachEventChips() {
    document.querySelectorAll("[data-show-id]").forEach(btn => btn.addEventListener("click", () => {
      const r = state.broadcasts.find(x => x.hsshow_id === btn.dataset.showId);
      if (!r) return;
      state.cursor = parseDateKey(r.broadcast_date);
      state.view = "day"; syncViewButtons(); renderAll();
    }));
  }

  function attachInterestButtons() {
    document.querySelectorAll("[data-interest]").forEach(btn => btn.addEventListener("click", () => {
      toggleInterest(btn.dataset.interest); renderAll();
    }));
  }

  function toggleInterest(key) {
    if (state.interests.has(key)) state.interests.delete(key); else state.interests.add(key);
    localStorage.setItem("hs_food_interests", JSON.stringify([...state.interests]));
  }

  function renderCalendar() {
    renderPeriodTitle();
    if (state.view === "month") renderMonth();
    else if (state.view === "week") renderWeek();
    else renderDay();
  }

  function renderAnalysis() {
    const rows = state.broadcasts.filter(r => num(r.sales_amt) !== null);
    const byProduct = {};
    rows.forEach(r => {
      const k = productName(r);
      (byProduct[k] ||= []).push(r);
    });
    const ranked = Object.entries(byProduct).map(([name, rs]) => ({
      name, total: rs.reduce((s,r)=>s+num(r.sales_amt),0), count: rs.length
    })).sort((a,b)=>b.total-a.total).slice(0,10);

    $("topProducts").innerHTML = ranked.length ? `<div class="rank-list">` + ranked.map((x,i)=>`
      <div class="rank-row"><span class="rank-index">${i+1}</span><span class="rank-name">${escapeHtml(x.name)}</span><span class="rank-value">${fmtMoney.format(Math.round(x.total/10000))}만원</span></div>
    `).join("") + `</div>` : `<div class="empty">실적 데이터가 아직 없습니다.</div>`;

    const bands = [
      ["00–05시",0,5],["06–09시",6,9],["10–13시",10,13],
      ["14–17시",14,17],["18–21시",18,21],["22–23시",22,23]
    ].map(([label,a,b]) => {
      const rs = rows.filter(r => {
        const h = new Date(r.start_datetime).getHours();
        return h>=a && h<=b;
      });
      const avg = rs.length ? rs.reduce((s,r)=>s+num(r.sales_amt),0)/rs.length : 0;
      return {label, avg, count:rs.length};
    });
    const max = Math.max(...bands.map(x=>x.avg),1);
    $("timeBandSummary").innerHTML = bands.map(x=>`
      <div class="bar-row"><span>${x.label}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(x.avg/max*100)}%"></div></div><strong>${x.avg ? fmtMoney.format(Math.round(x.avg/10000))+"만원" : "-"}</strong></div>
    `).join("");

    const topShows = [...rows].sort((a,b)=>num(b.sales_amt)-num(a.sales_amt)).slice(0,20);
    $("highSalesRows").innerHTML = topShows.map(r => `
      <tr><td>${escapeHtml(r.broadcast_date)} ${escapeHtml(timeHHMM(r.start_datetime))}</td>
      <td>${escapeHtml(r.platform_name || "")}</td><td>${escapeHtml(productName(r))}</td>
      <td>${num(r.sales_cnt) === null ? "-" : fmtCount.format(num(r.sales_cnt))}</td>
      <td class="money">${fmtMoney.format(Math.round(num(r.sales_amt)/10000))}만원</td></tr>
    `).join("");
  }

  function renderPending() {
    if (!state.pending.length) {
      $("pendingList").innerHTML = `<div class="empty">확인 필요한 신규 상품이 없습니다.</div>`;
    } else {
      $("pendingList").innerHTML = state.pending.map((x,i) => {
        const title = x.raw_title || x.match_keyword || x.normalized_title || x.standard_product_name || `확인항목 ${i+1}`;
        const meta = [x.platform_name, x.broadcast_date, x.review_status, x.note].filter(Boolean).join(" · ");
        return `<article class="review-item"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(meta || "정확한 상품명을 확인해주세요.")}</p></div><span class="tag">확인필요</span></article>`;
      }).join("");
    }

    if (!state.manual.length) {
      $("manualList").innerHTML = `<div class="empty">수동 실적 확인 항목이 없습니다.</div>`;
    } else {
      $("manualList").innerHTML = state.manual.map((x,i) => {
        const title = x.raw_title || x.title || x.product_name || `수동확인 ${i+1}`;
        const meta = [x.broadcast_date, x.start_datetime ? timeHHMM(x.start_datetime) : "", x.platform_name, x.reason].filter(Boolean).join(" · ");
        return `<article class="review-item"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(meta)}</p></div><span class="tag">수동확인</span></article>`;
      }).join("");
    }
  }

  function renderInterests() {
    const keys = [...state.interests];
    if (!keys.length) {
      $("interestList").innerHTML = `<div class="empty">일간 보기에서 ★를 눌러 관심상품을 등록하세요.</div>`;
      return;
    }
    $("interestList").innerHTML = keys.map(key => {
      const rows = state.broadcasts.filter(r => interestKey(r) === key).sort((a,b)=>(b.broadcast_date||"").localeCompare(a.broadcast_date||""));
      const sales = rows.filter(r => num(r.sales_amt) !== null);
      const avg = sales.length ? sales.reduce((s,r)=>s+num(r.sales_amt),0)/sales.length : 0;
      const next = [...rows].filter(r => r.broadcast_date >= dateKey(todayKST())).sort((a,b)=>(a.start_datetime||"").localeCompare(b.start_datetime||""))[0];
      return `<article class="interest-item"><div><h3>${escapeHtml(key)}</h3>
        <p>방송 ${rows.length}회 · 평균매출 ${avg ? fmtMoney.format(Math.round(avg/10000))+"만원" : "-"}${next ? ` · 다음방송 ${escapeHtml(next.broadcast_date)} ${escapeHtml(timeHHMM(next.start_datetime))} ${escapeHtml(next.platform_name || "")}` : ""}</p></div>
        <button class="star-btn active" data-interest="${escapeHtml(key)}">★</button></article>`;
    }).join("");
    attachInterestButtons();
  }

  function renderPlatformFilter() {
    const platforms = [...new Set(state.broadcasts.map(r=>r.platform_name).filter(Boolean))].sort();
    $("platformFilter").innerHTML = `<option value="">전체</option>` + platforms.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
    $("platformFilter").value = state.platform;
  }

  function renderAll() {
    renderCalendar();
    renderKPIs();
    renderAnalysis();
    renderPending();
    renderInterests();
  }

  function syncViewButtons() {
    document.querySelectorAll(".view-btn").forEach(b => b.classList.toggle("active", b.dataset.view === state.view));
  }

  async function loadData() {
    $("loadState").textContent = "데이터 불러오는 중";
    try {
      const [broadcastText, masterText, pendingObj, manualObj] = await Promise.all([
        fetchText(PATHS.broadcasts),
        fetchText(PATHS.productMaster).catch(()=> ""),
        fetchJsonSafe(PATHS.pending),
        fetchJsonSafe(PATHS.manual)
      ]);

      state.broadcasts = parseCSV(broadcastText).filter(r => r.category === "식품" || !r.category);
      state.productMaster = masterText ? parseCSV(masterText) : [];
      state.pending = extractArray(pendingObj, ["items","pending_products","products"]);
      state.manual = extractArray(manualObj, ["items","manual_review","rows"]);

      const last = state.broadcasts.map(r=>r.last_seen_at || r.performance_updated_at || "").filter(Boolean).sort().pop();
      $("dataUpdated").textContent = last ? `최근 데이터 갱신: ${last.replace("T"," ").slice(0,19)}` : `방송 데이터 ${fmtCount.format(state.broadcasts.length)}건 로드`;
      $("loadState").textContent = `정상 로드 · ${fmtCount.format(state.broadcasts.length)}건`;

      renderPlatformFilter();
      renderAll();
    } catch (err) {
      console.error(err);
      $("loadState").textContent = "데이터 로드 실패";
      $("calendarRoot").innerHTML = `<div class="empty"><strong>데이터를 불러오지 못했습니다.</strong><br>${escapeHtml(err.message)}<br><br>저장소 루트에서 HTTP 서버로 실행했는지 확인해주세요.</div>`;
    }
  }

  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.panel).classList.add("active");
  }));

  document.querySelectorAll(".view-btn").forEach(btn => btn.addEventListener("click", () => {
    state.view = btn.dataset.view; syncViewButtons(); renderAll();
  }));

  $("prevBtn").addEventListener("click", () => {
    if (state.view === "month") state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth()-1, 1, 12);
    else if (state.view === "week") state.cursor = addDays(state.cursor,-7);
    else state.cursor = addDays(state.cursor,-1);
    renderAll();
  });
  $("nextBtn").addEventListener("click", () => {
    if (state.view === "month") state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth()+1, 1, 12);
    else if (state.view === "week") state.cursor = addDays(state.cursor,7);
    else state.cursor = addDays(state.cursor,1);
    renderAll();
  });
  $("todayBtn").addEventListener("click", () => { state.cursor = todayKST(); renderAll(); });
  $("reloadBtn").addEventListener("click", loadData);
  $("platformFilter").addEventListener("change", e => { state.platform = e.target.value; renderAll(); });
  $("productSearch").addEventListener("input", e => { state.search = e.target.value.trim(); renderAll(); });
  $("interestOnlyFilter").addEventListener("change", e => { state.interestOnly = e.target.checked; renderAll(); });

  loadData();
})();
