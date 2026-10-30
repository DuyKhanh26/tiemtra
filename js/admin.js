/* Trang quản lý dành cho chủ quán */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var money = function (n) { return (Number(n) || 0).toLocaleString("vi-VN") + "đ"; };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var uid = function () { return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); };

  var OWNER = Store.OWNER;
  var draft = null, saved = null, dirty = false;
  var FIELDS = { name: "#fName", tagline: "#fTagline", notice: "#fNotice", address: "#fAddress", phone: "#fPhone", hours: "#fHours", closedNote: "#fClosedNote" };
  var billUI = null;
  var menuCat = "__all", menuQ = "", openRows = {};
  var manual = {};
  var ST = { new: "Chờ xử lý", done: "Hoàn thành", cancelled: "Đã huỷ" };
  var SRC = { web: "Web", shop: "Tại quán", staff: "Nhân viên" };
  var orders = [], range = "today", stFilter = "all", tab = "info";
  var meEmail = "", unsubShop = null, unsubOrders = null, unsubStaff = null, unsubReq = null, reqs = [], reqSeen = null, staffList = [], loginMsg = "";

  var authSeq = 0, ownerList = [], unsubOwners = null;
  /* ---------- Đăng nhập ---------- */
  function showLogin() {
    $("#appView").classList.add("hidden");
    $("#loginView").classList.remove("hidden");
    $("#demoNote").classList.toggle("hidden", Store.mode !== "demo");
    var er = $("#loginErr");
    if (loginMsg) { er.textContent = loginMsg; er.classList.remove("hidden"); } else er.classList.add("hidden");
  }
  function stopListening() {
    if (unsubShop) { unsubShop(); unsubShop = null; }
    if (unsubOrders) { unsubOrders(); unsubOrders = null; }
    if (unsubStaff) { unsubStaff(); unsubStaff = null; }
    if (unsubOwners) { unsubOwners(); unsubOwners = null; } ownerList = [];
    if (unsubReq) { unsubReq(); unsubReq = null; } reqs = []; reqSeen = null;
    draft = saved = null; dirty = false; orders = []; seen = null;
  }

  /* ---------- Chuông + thông báo đơn mới ---------- */
  var seen = null, ac = null, wl = null, baseTitle = "Quản lý quán";
  var soundOn = false;
  try { soundOn = localStorage.getItem("tra_sound") === "1"; } catch (e) {}

  function audio() {
    if (!ac) { var C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); }
    if (ac && ac.state === "suspended") ac.resume();
    return ac;
  }
  function beep() {
    if (!soundOn) return;
    var a = audio(); if (!a) return;
    [0, 0.28, 0.56].forEach(function (d, i) {
      var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + d;
      o.type = "sine"; o.frequency.value = i === 1 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.26);
    });
  }
  function keepAwake(on) {
    try {
      if (on && navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { wl = l; }, function () {});
      else if (wl) { wl.release(); wl = null; }
    } catch (e) {}
  }
  function renderBell() {
    $("#bellBtn").textContent = soundOn ? "🔔 Chuông: Bật" : "🔕 Chuông: Tắt";
  }
  $("#bellBtn").addEventListener("click", function () {
    soundOn = !soundOn;
    try { localStorage.setItem("tra_sound", soundOn ? "1" : "0"); } catch (e) {}
    if (soundOn) {
      audio(); beep(); keepAwake(true);
      try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
      toast("Đã bật chuông. Giữ trang này mở để nghe chuông khi có đơn.");
    } else keepAwake(false);
    renderBell();
  });
  document.addEventListener("pointerdown", function () { if (soundOn) audio(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && soundOn) keepAwake(true); });
  renderBell();

  function detectNew(list) {
    if (seen === null) { seen = {}; list.forEach(function (o) { seen[o.id] = 1; }); return; }
    var fresh = list.filter(function (o) { return !seen[o.id] && o.status === "new" && o.source !== "staff"; });
    list.forEach(function (o) { seen[o.id] = 1; });
    if (!fresh.length) return;
    beep();
    toast("🔔 Có " + fresh.length + " đơn mới!");
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        var o = fresh[0];
        new Notification("🔔 Đơn mới #" + (o.code || ""), { body: (o.items || []).map(function (i) { return i.name + " ×" + i.qty; }).join(", "), tag: "tra-order" });
      }
    } catch (e) {}
  }
  // Nhắc lại mỗi 20 giây khi còn đơn chờ xử lý
  setInterval(function () {
    if (soundOn && orders.some(function (o) { return o.status === "new"; })) beep();
  }, 20000);
  function showApp(user) {
    $("#loginView").classList.add("hidden");
    $("#appView").classList.remove("hidden");
    $("#who").textContent = user.email; meEmail = user.email;
    if (!unsubShop) {
      unsubShop = Store.subscribeShop(function (s) {
        saved = clone(s);
        if (!dirty || !draft) { draft = clone(s); renderAllForms(); }
        $("#barName").textContent = saved.name || "Quản lý quán";
      });
    }
    if (!unsubOrders) {
      unsubOrders = Store.subscribeOrders(function (list) { detectNew(list); orders = list; renderRevenue(); renderTables(); });
    }
    if (!unsubReq) {
      unsubReq = Store.subscribeRequests(function (list) {
        if (reqSeen === null) reqSeen = {};
        var fresh = list.filter(function (r) { return !reqSeen[r.id]; });
        list.forEach(function (r) { reqSeen[r.id] = 1; });
        reqs = list;
        if (fresh.length) { beep(); toast("🪑 Khách xin mở " + Tables.label(fresh[0].table)); }
        renderTables();
      });
    }
    var isMain = String(user.email || "").toLowerCase() === OWNER;
    $("#ownerCard").classList.toggle("hidden", !isMain);
    if (!unsubOwners) unsubOwners = Store.subscribeOwners(function (list) { ownerList = list; renderOwners(); });
    if (!unsubStaff) {
      unsubStaff = Store.subscribeStaff(function (list) { staffList = list; renderStaff(); renderRevenue(); renderTables(); });
    }
  }

  Store.onAuth(function (user) {
    if (!user) { stopListening(); showLogin(); return; }
    var email = String(user.email || "").toLowerCase();
    if (meEmail && meEmail.toLowerCase() === email && !$("#appView").classList.contains("hidden")) return;
    var token = ++authSeq;
    var pass = user.verified === false ? Promise.resolve(false) : (email === OWNER ? Promise.resolve(true) : Store.isOwner(email));
    pass.then(function (ok) {
      if (token !== authSeq) return;
      if (!ok) {
        loginMsg = "Tài khoản " + (user.email || "") + " không có quyền quản lý quán này.";
        stopListening();
        showLogin();
        Store.logout();
        return;
      }
      loginMsg = "";
      showApp(user);
    });
  });

  $("#loginBtn").addEventListener("click", function () {
    loginMsg = "";
    Store.login().catch(function (e) {
      loginMsg = "Đăng nhập chưa thành công: " + (e && e.message ? e.message : e);
      showLogin();
    });
  });
  $("#logoutBtn").addEventListener("click", function () {
    if (dirty && !confirm("Bạn có thay đổi chưa lưu. Vẫn đăng xuất?")) return;
    dirty = false; Store.logout();
  });

  /* ---------- Tabs ---------- */
  $("#tabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]"); if (!b) return;
    tab = b.getAttribute("data-tab");
    $$(".tab").forEach(function (t) { t.classList.toggle("on", t === b); });
    ["info", "menu", "rev", "tables", "staff"].forEach(function (k) { $("#panel-" + k).classList.toggle("hidden", k !== tab); });
    $("#saveBar").classList.toggle("hidden", tab === "staff" || tab === "tables");
  });

  /* ---------- Trạng thái lưu ---------- */
  function markDirty() {
    dirty = true; updateSaveBar();
  }
  function updateSaveBar() {
    $("#saveBtn").disabled = !dirty;
    $("#revertBtn").disabled = !dirty;
    var st = $("#saveSt");
    st.textContent = dirty ? "● Có thay đổi chưa lưu" : "✓ Đã lưu — trang khách đang hiển thị bản này";
    st.classList.toggle("dirty", dirty);
  }
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  function toast(msg) {
    var t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
  }

  /* ---------- Form thông tin ---------- */
  function renderInfo() {
    Object.keys(FIELDS).forEach(function (k) { $(FIELDS[k]).value = draft[k] || ""; });
    $("#fOpen").checked = draft.isOpen !== false;
    $("#openLbl").textContent = draft.isOpen !== false ? "Quán đang bán" : "Quán đang nghỉ";
  }

  $("#panel-info").addEventListener("input", function (e) {
    var f = e.target.getAttribute("data-f"); if (!f || !draft) return;
    draft[f] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    if (f === "isOpen") $("#openLbl").textContent = draft.isOpen ? "Quán đang bán" : "Quán đang nghỉ";
    markDirty();
  });


  /* ---------- Bàn đang mở ---------- */
  function renderTables() {
    var gs = Tables.group(orders);
    var q = $("#tblSearch").value, shown = Tables.filterTables(gs, q), paid = Tables.filterTables(Tables.paidGroups(orders, startOfDay(Date.now())), q);
    $("#tablesAdmin").innerHTML = Tables.reqHtml(reqs) + (q.trim() && !shown.length && gs.length ? Tables.noHit : Tables.cardsHtml(shown)) + Tables.paidHtml(paid, staffName);
    var tb = $("#tblBadge"); tb.textContent = gs.length + reqs.length; tb.classList.toggle("hidden", gs.length + reqs.length === 0);
  }
  Tables.bindRequests($("#tablesAdmin"), function () { return reqs; }, function () { return meEmail; }, toast);
  Tables.bindManualOpen($("#openTblIn"), $("#openTblBtn"), function () { return meEmail; }, toast);
  $("#tblSearch").addEventListener("input", renderTables);
  $("#tablesAdmin").addEventListener("click", function (e) {
    var b = e.target.closest("[data-bill-open],[data-move-open]"); if (!b) return;
    var tb0 = b.getAttribute("data-bill-open") || b.getAttribute("data-move-open"), gs = Tables.group(orders);
    var g = gs.filter(function (x) { return x.table === tb0; })[0];
    if (!g) return;
    if (!billUI) billUI = Tables.createBillUI({ dlg: $("#billDlg"), body: $("#billBody"), email: function () { return meEmail; }, toast: toast });
    billUI.open(g, gs, b.hasAttribute("data-move-open") ? "move" : "bill");
  });

  /* ---------- Nhân viên ---------- */
  function staffName(email) {
    var e = String(email || "").toLowerCase();
    if (e === OWNER) return "Chủ quán";
    for (var j = 0; j < ownerList.length; j++) if (ownerList[j].email === e && ownerList[j].name) return ownerList[j].name;
    for (var i = 0; i < staffList.length; i++) if (staffList[i].email === e && staffList[i].name) return staffList[i].name;
    return e;   // chưa đặt tên thì hiện Gmail đầy đủ
  }
  function renderStaff() {
    var l = staffList.slice().sort(function (a, b) { return (a.addedAt || 0) - (b.addedAt || 0); });
    $("#stList").innerHTML = l.length ? l.map(function (x) {
      return '<div class="stepper-row"><span><b>' + esc(x.name || x.email.split("@")[0]) + '</b><br><small style="color:var(--muted)">' + esc(x.email) + '</small></span>' +
        '<button class="btn danger sm" data-rm="' + esc(x.email) + '">Xoá</button></div>';
    }).join("") : '<div style="color:var(--muted);padding:8px 0">Chưa có nhân viên nào.</div>';
  }
  function renderOwners() {
    var l = ownerList.slice().sort(function (a, b) { return (a.addedAt || 0) - (b.addedAt || 0); });
    $("#owList").innerHTML = l.length ? l.map(function (x) {
      return '<div class="stepper-row"><span><b>' + esc(x.name || x.email.split("@")[0]) + '</b><br><small style="color:var(--muted)">' + esc(x.email) + '</small></span>' +
        '<button class="btn danger sm" data-rmo="' + esc(x.email) + '">Xoá</button></div>';
    }).join("") : '<div style="color:var(--muted);padding:8px 0">Chưa có chủ quán phụ nào.</div>';
  }
  $("#owAdd").addEventListener("click", function () {
    var email = $("#owEmail").value.trim().toLowerCase(), name = $("#owName").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert("Gmail chưa đúng định dạng."); $("#owEmail").focus(); return; }
    if (email === OWNER) { alert("Đây là email chủ quán chính, không cần thêm."); return; }
    Store.addOwner(email, name).then(function () {
      $("#owEmail").value = ""; $("#owName").value = ""; toast("Đã thêm chủ quán phụ ✓");
    }).catch(function (e) { alert("Chưa thêm được: " + (e && e.message ? e.message : e)); });
  });
  $("#owList").addEventListener("click", function (e) {
    var b = e.target.closest("[data-rmo]"); if (!b) return;
    var em = b.getAttribute("data-rmo");
    if (!confirm("Xoá chủ quán phụ " + em + "? Người này sẽ không vào được trang quản lý nữa.")) return;
    Store.removeOwner(em).then(function () { toast("Đã xoá chủ quán phụ"); })
      .catch(function (err) { alert("Chưa xoá được: " + (err && err.message ? err.message : err)); });
  });
  $("#stLink").value = new URL("staff.html", location.href).href;
  $("#stCopy").addEventListener("click", function () {
    var v = $("#stLink").value;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(function () { toast("Đã sao chép link ✓"); });
    else { $("#stLink").select(); try { document.execCommand("copy"); toast("Đã sao chép link ✓"); } catch (e) {} }
  });
  $("#stAdd").addEventListener("click", function () {
    var email = $("#stEmail").value.trim().toLowerCase(), name = $("#stName").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert("Gmail chưa đúng định dạng."); $("#stEmail").focus(); return; }
    if (email === OWNER) { alert("Đây là email chủ quán, không cần thêm."); return; }
    Store.addStaff(email, name).then(function () {
      $("#stEmail").value = ""; $("#stName").value = ""; toast("Đã thêm nhân viên ✓");
    }).catch(function (e) { alert("Chưa thêm được: " + (e && e.message ? e.message : e)); });
  });
  $("#stList").addEventListener("click", function (e) {
    var b = e.target.closest("[data-rm]"); if (!b) return;
    var em = b.getAttribute("data-rm");
    if (!confirm("Xoá nhân viên " + em + "? Người này sẽ không đăng nhập được nữa.")) return;
    Store.removeStaff(em).then(function () { toast("Đã xoá nhân viên"); })
      .catch(function (err) { alert("Chưa xoá được: " + (err && err.message ? err.message : err)); });
  });

  /* ---------- Thực đơn: lọc theo nhóm, tìm kiếm, thu gọn từng món ---------- */
  function fold(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase(); }
  function catOf(m) { return (m.cat || "").trim(); }
  function iconTxt(ic) { ic = String(ic || "🧋"); return /^https?:/i.test(ic) ? "🖼️" : ic; }
  function matches(m) {
    var c = catOf(m);
    if (menuCat === "__best") { if (!m.best) return false; }
    else if (menuCat === "__none") { if (c) return false; }
    else if (menuCat !== "__all" && c !== menuCat) return false;
    if (menuQ && fold(m.name + " " + (m.desc || "")).indexOf(fold(menuQ)) < 0) return false;
    return true;
  }
  function rowHtml(m, i) {
    return '<div class="mrow' + (m.available === false ? " off" : "") + (openRows[m.id] ? " open" : "") + '" data-i="' + i + '" data-id="' + esc(m.id) + '">' +
      '<div class="mh"><span class="mico">' + esc(iconTxt(m.icon)) + '</span>' +
      '<span class="mt"><b class="mh-name">' + esc(m.name || "(chưa đặt tên)") + '</b><button type="button" class="starbtn' + (m.best ? " on" : "") + '" data-star="1" title="Best-Seller">' + (m.best ? "★" : "☆") + '</button><small><span class="mh-price">' + Tables.priceText(m) + '</span> · <span class="mh-cat">' + esc(catOf(m) || "Chưa phân nhóm") + "</span></small></span>" +
      '<label class="tg sm" title="Còn bán / Tạm hết"><input type="checkbox" data-k="available"' + (m.available !== false ? " checked" : "") + "><span></span></label>" +
      '<span class="chev">▾</span></div>' +
      '<div class="mb"><div class="grid2">' +
      '<div class="full"><label class="f" style="margin-top:0">Tên món</label><input data-k="name" value="' + esc(m.name) + '"></div>' +
      '<div><label class="f">Giá (đ) · khi không chia size</label><input data-k="price" type="number" min="0" step="1000" inputmode="numeric" value="' + esc(m.price) + '"></div>' +
      '<div><label class="f">Nhóm món</label><input data-k="cat" list="catList" value="' + esc(m.cat || "") + '" placeholder="Trà trái cây…"></div>' +
      '<div><label class="f">Size M (đ)</label><input data-k="priceM" type="number" min="0" step="1000" inputmode="numeric" value="' + esc(m.priceM || "") + '" placeholder="để trống nếu không có"></div>' +
      '<div><label class="f">Size L (đ)</label><input data-k="priceL" type="number" min="0" step="1000" inputmode="numeric" value="' + esc(m.priceL || "") + '" placeholder="để trống nếu không có"></div>' +
      '<div class="full hintsm" style="margin:0">Nhập giá size M và/hoặc L thì khách chọn theo size (giá ở ô “Giá” sẽ không dùng). Để trống cả hai nếu món chỉ có một giá.</div>' +
      '<div class="full"><label class="f">Mô tả</label><input data-k="desc" value="' + esc(m.desc || "") + '"></div>' +
      '<div class="full"><label class="f">Biểu tượng (emoji) hoặc link ảnh https://…</label><input data-k="icon" value="' + esc(m.icon || "") + '"></div>' +
      '</div><div class="acts"><span style="color:var(--muted);font-size:12.5px">Bật/tắt “còn bán” ở công tắc phía trên</span>' +
      '<span style="display:flex;gap:6px"><button class="btn ghost sm" data-act="up" title="Lên">↑</button><button class="btn ghost sm" data-act="down" title="Xuống">↓</button>' +
      '<button class="btn danger sm" data-act="del">Xoá</button></span></div></div></div>';
  }
  function renderMenu(focusId) {
    var menu = draft.menu, cats = [], counts = {}, none = 0;
    menu.forEach(function (m) { var c = catOf(m); if (!c) none++; else { if (cats.indexOf(c) < 0) cats.push(c); counts[c] = (counts[c] || 0) + 1; } });
    if (menuCat === "__best" && !menu.some(function (m) { return m.best; })) menuCat = "__all";
    if (menuCat !== "__all" && menuCat !== "__none" && menuCat !== "__best" && cats.indexOf(menuCat) < 0) menuCat = "__all";
    if (menuCat === "__none" && !none) menuCat = "__all";
    $("#catList").innerHTML = cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join("");
    var chips = [{ k: "__all", t: "Tất cả (" + menu.length + ")" }];
    cats.forEach(function (c) { chips.push({ k: c, t: c + " (" + counts[c] + ")" }); });
    var bestN = menu.filter(function (m) { return m.best; }).length;
    if (bestN) chips.splice(1, 0, { k: "__best", t: "⭐ Best-Seller (" + bestN + ")" });
    if (none && cats.length) chips.push({ k: "__none", t: "Chưa phân nhóm (" + none + ")" });
    $("#menuCats").innerHTML = chips.length > 1 ? chips.map(function (c) {
      return '<button class="cat' + (c.k === menuCat ? " on" : "") + '" data-mcat="' + esc(c.k) + '">' + esc(c.t) + "</button>";
    }).join("") : "";
    var vis = []; menu.forEach(function (m, i) { if (matches(m)) vis.push(i); });
    $("#menuInfo").textContent = menu.length ? "Hiển thị " + vis.length + "/" + menu.length + " món" : "";
    $("#catRename").classList.toggle("hidden", menuCat === "__all" || menuCat === "__none" || menuCat === "__best");
    if (!menu.length) { $("#menuList").innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px">Chưa có món nào. Bấm “Thêm món mới” nhé.</div>'; return; }
    if (!vis.length) { $("#menuList").innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px">Không có món nào khớp.</div>'; return; }
    $("#menuList").innerHTML = vis.map(function (i) { return rowHtml(menu[i], i); }).join("");
    if (focusId) {
      var el = document.querySelector('#menuList .mrow[data-id="' + focusId + '"]');
      if (el) { el.scrollIntoView({ block: "center" }); var inp = el.querySelector(".mb input"); if (inp) inp.select(); }
    }
  }
  $("#menuSearch").addEventListener("input", function () { menuQ = this.value.trim(); if (draft) renderMenu(); });
  $("#menuCats").addEventListener("click", function (e) {
    var b = e.target.closest("[data-mcat]"); if (!b) return;
    menuCat = b.getAttribute("data-mcat"); renderMenu();
  });
  $("#catRename").addEventListener("click", function () {
    var old = menuCat; if (old === "__all" || old === "__none" || old === "__best") return;
    var nn = prompt("Tên mới cho nhóm “" + old + "”:", old);
    if (nn === null) return; nn = nn.trim();
    if (!nn || nn === old) return;
    draft.menu.forEach(function (m) { if (catOf(m) === old) m.cat = nn; });
    menuCat = nn; markDirty(); renderMenu();
  });
  $("#menuList").addEventListener("input", function (e) {
    var k = e.target.getAttribute("data-k"); if (!k) return;
    var row = e.target.closest(".mrow"), i = +row.getAttribute("data-i");
    var m = draft.menu[i]; if (!m) return;
    if (k === "available") { m.available = e.target.checked; row.classList.toggle("off", !m.available); }
    else if (k === "priceM" || k === "priceL") {
      m[k] = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value));
      row.querySelector(".mh-price").textContent = Tables.priceText(m);
    }
    else if (k === "price") { m.price = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)); row.querySelector(".mh-price").textContent = money(m.price); }
    else {
      m[k] = e.target.value;
      if (k === "name") row.querySelector(".mh-name").textContent = m.name || "(chưa đặt tên)";
      else if (k === "cat") row.querySelector(".mh-cat").textContent = catOf(m) || "Chưa phân nhóm";
      else if (k === "icon") row.querySelector(".mico").textContent = iconTxt(m.icon);
    }
    markDirty();
  });
  $("#menuList").addEventListener("change", function (e) {
    if (e.target.getAttribute && e.target.getAttribute("data-k") === "cat") renderMenu();   // cập nhật chip nhóm khi gõ xong
  });
  $("#menuList").addEventListener("click", function (e) {
    var row = e.target.closest(".mrow"); if (!row) return;
    var i = +row.getAttribute("data-i"), m = draft.menu, b = e.target.closest("[data-act]");
    if (e.target.closest("[data-star]")) { m[i].best = !m[i].best; markDirty(); renderMenu(); return; }
    if (!b) {
      if (e.target.closest(".mh") && !e.target.closest(".tg")) {
        var id = row.getAttribute("data-id"); openRows[id] = !openRows[id]; row.classList.toggle("open", !!openRows[id]);
      }
      return;
    }
    var act = b.getAttribute("data-act");
    if (act === "del") { if (!confirm("Xoá món “" + (m[i].name || "") + "”?")) return; m.splice(i, 1); }
    else if (act === "up" || act === "down") {
      var vis = []; m.forEach(function (x, j) { if (matches(x)) vis.push(j); });
      var pos = vis.indexOf(i), tj = act === "up" ? vis[pos - 1] : vis[pos + 1];
      if (tj === undefined) return;
      var t = m[i]; m[i] = m[tj]; m[tj] = t;
    } else return;
    markDirty(); renderMenu();
  });
  $("#addItem").addEventListener("click", function () {
    var c = (menuCat !== "__all" && menuCat !== "__none" && menuCat !== "__best") ? menuCat : "";
    var m = { id: uid(), name: "Món mới", price: 35000, cat: c, icon: "🧋", desc: "", available: true, best: menuCat === "__best" };
    draft.menu.push(m); openRows[m.id] = true; menuQ = ""; $("#menuSearch").value = "";
    markDirty(); renderMenu(m.id);
  });

  function renderAllForms() { renderInfo(); renderMenu(); updateSaveBar(); renderRevenue(); }

  /* ---------- Lưu / hoàn tác ---------- */
  $("#saveBtn").addEventListener("click", function () {
    var d = clone(draft);
    d.name = (d.name || "").trim();
    if (!d.name) { alert("Tên quán không được để trống."); return; }
    for (var i = 0; i < d.menu.length; i++) {
      var m = d.menu[i];
      m.name = (m.name || "").trim();
      if (!m.name) { alert("Món số " + (i + 1) + " chưa có tên."); return; }
      m.price = Number(m.price) || 0;
      m.priceM = Math.max(0, Number(m.priceM) || 0); m.priceL = Math.max(0, Number(m.priceL) || 0);
      if (m.priceM || m.priceL) m.price = Math.min.apply(null, [m.priceM, m.priceL].filter(Boolean));
      m.best = !!m.best;
      m.cat = (m.cat || "").trim();
      m.available = m.available !== false;
      if (!m.id) m.id = uid();
    }
    $("#saveBtn").disabled = true; $("#saveBtn").textContent = "Đang lưu…";
    Store.saveShop(d).then(function () {
      draft = clone(d); saved = clone(d); dirty = false;
      renderAllForms(); toast("Đã lưu — trang khách đã cập nhật ✓");
    }).catch(function (err) {
      console.error(err); alert("Lưu chưa được: " + (err && err.message ? err.message : err));
    }).then(function () { $("#saveBtn").textContent = "💾 Lưu thay đổi"; updateSaveBar(); });
  });
  $("#revertBtn").addEventListener("click", function () {
    if (!confirm("Bỏ toàn bộ thay đổi chưa lưu?")) return;
    draft = clone(saved); dirty = false; renderAllForms();
  });

  /* ---------- Doanh thu ---------- */
  /* Đơn được tính doanh thu: đơn thường khi đã xong; đơn uống tại bàn khi đã tính tiền */
  function counted(o) {
    if (o.status === "cancelled") return false;
    if (o.table) return o.billStatus === "paid" && !!o.paidBy;
    return o.status === "done";
  }
  function orderTotal(o) {
    return (o.items || []).reduce(function (s, it) { return s + (Number(it.price) || 0) * (Number(it.qty) || 0); }, 0);
  }
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function startOfDay(ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function rangeStart() {
    var now = Date.now();
    if (range === "today") return startOfDay(now);
    if (range === "7") return startOfDay(now) - 6 * 86400000;
    if (range === "30") return startOfDay(now) - 29 * 86400000;
    return 0;
  }
  function fmtTime(ts) {
    var d = new Date(ts), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getHours()) + ":" + p(d.getMinutes()) + " " + p(d.getDate()) + "/" + p(d.getMonth() + 1);
  }

  function renderRevenue() {
    if (!$("#stats")) return;
    var from = rangeStart();
    var inRange = orders.filter(function (o) { return (o.createdAt || 0) >= from; });
    var done = inRange.filter(counted);
    var revenue = done.reduce(function (s, o) { return s + orderTotal(o); }, 0);
    var cups = done.reduce(function (s, o) { return s + (o.items || []).reduce(function (a, i) { return a + (Number(i.qty) || 0); }, 0); }, 0);
    var pending = orders.filter(function (o) { return o.status === "new"; }).length;

    $("#stats").innerHTML =
      '<div class="stat hl"><small>Doanh thu</small><b>' + money(revenue) + "</b></div>" +
      '<div class="stat"><small>Đơn hoàn thành</small><b>' + done.length + "</b></div>" +
      '<div class="stat"><small>Số ly/phần đã bán</small><b>' + cups + "</b></div>" +
      '<div class="stat"><small>Đơn chờ xử lý</small><b>' + pending + "</b></div>";
    var nb = $("#newBadge"); nb.textContent = pending; nb.classList.toggle("hidden", pending === 0);
    document.title = pending ? "(" + pending + ") 🔔 Đơn mới – " + baseTitle : baseTitle;

    // Biểu đồ 7 ngày
    var days = [], today = startOfDay(Date.now());
    for (var i = 6; i >= 0; i--) { var t = today - i * 86400000; days.push({ t: t, v: 0 }); }
    orders.forEach(function (o) {
      if (!counted(o)) return;
      var k = dayKey(o.createdAt);
      days.forEach(function (d) { if (dayKey(d.t) === k) d.v += orderTotal(o); });
    });
    var max = Math.max.apply(null, days.map(function (d) { return d.v; }).concat([1]));
    $("#bars").innerHTML = days.map(function (d) {
      var dt = new Date(d.t);
      return '<div class="bar"><div class="v">' + (d.v ? Math.round(d.v / 1000) + "k" : "") + '</div><div class="col" style="height:' + Math.max(2, d.v / max * 100) + '%"></div><div>' + dt.getDate() + "/" + (dt.getMonth() + 1) + "</div></div>";
    }).join("");

    // Món bán chạy
    var tally = {};
    done.forEach(function (o) { (o.items || []).forEach(function (it) {
      var k = it.name || "?"; tally[k] = tally[k] || { q: 0, r: 0 };
      tally[k].q += Number(it.qty) || 0; tally[k].r += (Number(it.price) || 0) * (Number(it.qty) || 0);
    }); });
    var top = Object.keys(tally).sort(function (a, b) { return tally[b].q - tally[a].q; }).slice(0, 6);
    $("#top").innerHTML = top.length ? top.map(function (k) {
      return '<div class="toprow"><span>' + esc(k) + " × " + tally[k].q + "</span><b>" + money(tally[k].r) + "</b></div>";
    }).join("") : '<div style="color:var(--muted);padding:8px 0">Chưa có dữ liệu trong khoảng này.</div>';

    // Danh sách đơn
    var list = inRange.filter(function (o) { return stFilter === "all" || o.status === stFilter; });
    $("#orders").innerHTML = list.length ? list.slice(0, 100).map(orderHtml).join("") :
      '<div style="text-align:center;color:var(--muted);padding:24px">Không có đơn nào.</div>';
  }

  function orderHtml(o) {
    var c = o.customer || {};
    var acts = "";
    if (o.status === "new") acts = '<button class="btn ok sm" data-act="done">✓ Hoàn thành</button><button class="btn danger sm" data-act="cancelled">Huỷ đơn</button>';
    else acts = '<button class="btn ghost sm" data-act="new">Mở lại</button>';
    if (!o.table && o.source !== "shop" && o.status !== "cancelled")
      acts = (o.orderPaid ? '<button class="btn ghost sm" data-act="unpaid">↩ Bỏ “đã thanh toán”</button>' : '<button class="btn sm" data-act="paid">💰 Đã thanh toán</button>') + acts;
    // Xoá hẳn: CHỈ chủ quán chính (chống người phá đơn). Chủ phụ và nhân viên dùng "Huỷ đơn" (có ghi tên).
    if (String(meEmail).toLowerCase() === OWNER) acts += '<button class="btn danger sm" data-act="del">🗑 Xoá đơn</button>';
    return '<div class="order ' + esc(o.status) + '" data-id="' + esc(o.id) + '">' +
      '<div class="h"><span>#' + esc(o.code || "") + ' <span class="tagx ' + esc(o.status) + '">' + esc(ST[o.status] || o.status) + '</span><span class="tagx">' + (SRC[o.source] || "Tại quán") + "</span>" + (o.table ? '<span class="tagx tb">Bàn ' + esc(o.table) + "</span>" : "") + Tables.payTag(o) + "</span><span>" + money(orderTotal(o)) + "</span></div>" +
      '<div class="sub">' + fmtTime(o.createdAt) + " · " + esc(c.name || "") + (c.phone ? ' · <a href="tel:' + esc(String(c.phone).replace(/\D/g, "")) + '">' + esc(c.phone) + "</a>" : "") + "</div>" +
      (o.method ? '<div class="sub">' + esc(o.method) + (o.address ? " · " + esc(o.address) : "") + "</div>" : "") +
      "<ul>" + (o.items || []).map(function (it) {
        return "<li>" + esc(it.name) + " × " + esc(it.qty) + (it.sugar ? ' <span class="sub">(' + esc(it.sugar) + " đường, " + esc(it.ice) + ")</span>" : "") + "</li>";
      }).join("") + "</ul>" +
      (o.table ? '<div class="sub">' + (o.billStatus === "paid" ? "💰 Đã tính tiền (" + (o.payMethod === "cash" ? "tiền mặt" : "chuyển khoản") + ") · " + esc(staffName(o.paidBy)) : "⏳ Bàn chưa tính tiền") + (o.movedFrom ? " · chuyển từ Bàn " + esc(o.movedFrom) + " (" + esc(staffName(o.movedBy)) + ")" : "") + "</div>" : "") +
      (o.orderPaid && !o.table ? '<div class="sub">💰 Đã thanh toán · xác nhận bởi ' + esc(staffName(o.orderPaidBy)) + "</div>" : "") +
      (o.createdBy || o.doneBy ? '<div class="sub">' + (o.createdBy ? "Nhập bởi " + esc(staffName(o.createdBy)) : "") + (o.createdBy && o.doneBy ? " · " : "") + (o.doneBy ? "Xong bởi " + esc(staffName(o.doneBy)) : "") + "</div>" : "") +
      (o.cancelledBy ? '<div class="sub">Huỷ bởi ' + esc(staffName(o.cancelledBy)) + "</div>" : "") +
      (o.note ? '<div class="sub">📝 ' + esc(o.note) + "</div>" : "") +
      '<div class="acts">' + acts + "</div></div>";
  }

  $("#rangeChips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-range]"); if (!b) return;
    range = b.getAttribute("data-range");
    $$("#rangeChips .chip").forEach(function (c) { c.classList.toggle("on", c === b); });
    renderRevenue();
  });
  $("#statusChips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-st]"); if (!b) return;
    stFilter = b.getAttribute("data-st");
    $$("#statusChips .chip").forEach(function (c) { c.classList.toggle("on", c === b); });
    renderRevenue();
  });
  $("#orders").addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var id = b.closest(".order").getAttribute("data-id"), act = b.getAttribute("data-act");
    var p;
    if (act === "cancelled" && !confirm("Huỷ đơn này? Tên bạn sẽ được ghi lại là người huỷ.")) return;
    if (act === "del") { if (!confirm("Xoá hẳn đơn này?")) return; p = Store.deleteOrder(id); }
    else if (act === "paid") p = Store.updateOrder(id, { orderPaid: true, orderPaidAt: Date.now(), orderPaidBy: meEmail });
    else if (act === "unpaid") p = Store.updateOrder(id, { orderPaid: false });
    else {
      var patch = { status: act, updatedAt: Date.now() };
      if (act === "done") patch.doneBy = meEmail;
      else if (act === "cancelled") patch.cancelledBy = meEmail;
      else if (act === "new") { patch.doneBy = ""; patch.cancelledBy = ""; }
      p = Store.updateOrder(id, patch);
    }
    p.catch(function (err) { alert("Chưa cập nhật được: " + (err && err.message ? err.message : err)); });
  });

  /* ---------- Ghi đơn tại quán ---------- */
  $("#manualBtn").addEventListener("click", function () {
    manual = {};
    renderManual();
    $("#manualDlg").showModal();
  });
  function renderManual() {
    var items = (saved ? saved.menu : []).filter(function (m) { return m.available !== false; });
    var total = 0;
    var vlist = []; items.forEach(function (m) { Tables.variants(m).forEach(function (v) { vlist.push(v); total += (manual[v.key] || 0) * v.price; }); });
    $("#manualBody").innerHTML = '<button class="x" data-m="close">✕</button><h2>Ghi đơn bán tại quán</h2>' +
      (vlist.length ? vlist.map(function (v) {
        var q = manual[v.key] || 0;
        return '<div class="stepper-row"><span>' + esc(v.item.name) + Tables.starHtml(v.item) + (v.size ? ' <span class="szb">' + esc(v.size) + "</span>" : "") + '<br><small style="color:var(--muted)">' + money(v.price) + '</small></span><div class="qty">' +
          (q ? '<button class="minus" data-m="dec" data-id="' + esc(v.key) + '">−</button><span>' + q + "</span>" : "") +
          '<button data-m="inc" data-id="' + esc(v.key) + '">+</button></div></div>';
      }).join("") : "<p>Chưa có món nào đang bán.</p>") +
      '<div class="total"><span>Tổng</span><span>' + money(total) + '</span></div><button class="btn block" data-m="save"' + (total ? "" : " disabled") + ">Ghi nhận đơn (đã thanh toán)</button>";
  }
  $("#manualDlg").addEventListener("click", function (e) {
    if (e.target === this) { this.close(); return; }
    var b = e.target.closest("[data-m]"); if (!b) return;
    var a = b.getAttribute("data-m"), id = b.getAttribute("data-id");
    if (a === "close") { this.close(); return; }
    if (a === "inc") manual[id] = Math.min(99, (manual[id] || 0) + 1);
    else if (a === "dec") { manual[id] = (manual[id] || 0) - 1; if (manual[id] <= 0) delete manual[id]; }
    else if (a === "save") {
      var items = [];
      saved.menu.forEach(function (m) { Tables.variants(m).forEach(function (v) {
        if (manual[v.key]) { var it = { id: v.id, name: v.name, price: v.price, qty: manual[v.key] }; if (v.size) it.size = v.size; items.push(it); }
      }); });
      if (!items.length) return;
      var dlg = this;
      Store.addOrder({
        code: Math.random().toString(36).slice(2, 6).toUpperCase(), source: "shop", status: "done", createdAt: Date.now(),
        customer: { name: "Khách tại quán", phone: "" }, method: "Uống tại quán", address: "", note: "",
        items: items, total: items.reduce(function (s, i) { return s + i.price * i.qty; }, 0)
      }).then(function () { dlg.close(); toast("Đã ghi đơn ✓"); })
        .catch(function (err) { alert("Chưa ghi được: " + (err && err.message ? err.message : err)); });
      return;
    }
    renderManual();
  });
})();
