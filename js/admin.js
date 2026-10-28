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
  var orders = [], range = "today", stFilter = "all", tab = "info";
  var unsubShop = null, unsubOrders = null, loginMsg = "";

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
    var fresh = list.filter(function (o) { return !seen[o.id] && o.status === "new"; });
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
    $("#who").textContent = user.email;
    if (!unsubShop) {
      unsubShop = Store.subscribeShop(function (s) {
        saved = clone(s);
        if (!dirty || !draft) { draft = clone(s); renderAllForms(); }
        $("#barName").textContent = saved.name || "Quản lý quán";
      });
    }
    if (!unsubOrders) {
      unsubOrders = Store.subscribeOrders(function (list) { detectNew(list); orders = list; renderRevenue(); });
    }
  }

  Store.onAuth(function (user) {
    if (!user) { stopListening(); showLogin(); return; }
    var ok = user.email && user.email.toLowerCase() === OWNER && user.verified !== false;
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
    ["info", "menu", "rev"].forEach(function (k) { $("#panel-" + k).classList.toggle("hidden", k !== tab); });
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
  var FIELDS = { name: "#fName", tagline: "#fTagline", notice: "#fNotice", address: "#fAddress", phone: "#fPhone", hours: "#fHours", payNote: "#fPayNote", closedNote: "#fClosedNote" };
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

  /* ---------- Thực đơn ---------- */
  function renderMenu(focusLast) {
    var menu = draft.menu;
    var cats = [];
    menu.forEach(function (m) { var c = (m.cat || "").trim(); if (c && cats.indexOf(c) < 0) cats.push(c); });
    $("#catList").innerHTML = cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join("");
    if (!menu.length) { $("#menuList").innerHTML = '<div class="empty" style="text-align:center;color:var(--muted);padding:24px">Chưa có món nào. Bấm “Thêm món mới” nhé.</div>'; return; }
    $("#menuList").innerHTML = menu.map(function (m, i) {
      return '<div class="mrow' + (m.available === false ? " off" : "") + '" data-i="' + i + '"><div class="grid2">' +
        '<div class="full"><label class="f" style="margin-top:0">Tên món</label><input data-k="name" value="' + esc(m.name) + '"></div>' +
        '<div><label class="f">Giá (đ)</label><input data-k="price" type="number" min="0" step="1000" inputmode="numeric" value="' + esc(m.price) + '"></div>' +
        '<div><label class="f">Nhóm món</label><input data-k="cat" list="catList" value="' + esc(m.cat || "") + '" placeholder="Trà trái cây…"></div>' +
        '<div class="full"><label class="f">Mô tả</label><input data-k="desc" value="' + esc(m.desc || "") + '"></div>' +
        '<div class="full"><label class="f">Biểu tượng (emoji) hoặc link ảnh https://…</label><input data-k="icon" value="' + esc(m.icon || "") + '"></div>' +
        '</div><div class="acts"><label class="chk"><input type="checkbox" data-k="available"' + (m.available !== false ? " checked" : "") + '> Còn bán</label>' +
        '<span style="display:flex;gap:6px"><button class="btn ghost sm" data-act="up" title="Lên">↑</button><button class="btn ghost sm" data-act="down" title="Xuống">↓</button>' +
        '<button class="btn danger sm" data-act="del">Xoá</button></span></div></div>';
    }).join("");
    if (focusLast) { var ins = $$("#menuList .mrow"); var last = ins[ins.length - 1]; last.scrollIntoView({ block: "center" }); last.querySelector("input").select(); }
  }
  $("#menuList").addEventListener("input", function (e) {
    var k = e.target.getAttribute("data-k"); if (!k) return;
    var i = +e.target.closest(".mrow").getAttribute("data-i");
    var m = draft.menu[i]; if (!m) return;
    if (k === "available") { m.available = e.target.checked; e.target.closest(".mrow").classList.toggle("off", !m.available); }
    else if (k === "price") m.price = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value));
    else m[k] = e.target.value;
    markDirty();
  });
  $("#menuList").addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var i = +b.closest(".mrow").getAttribute("data-i"), act = b.getAttribute("data-act"), m = draft.menu;
    if (act === "del") { if (!confirm("Xoá món “" + (m[i].name || "") + "”?")) return; m.splice(i, 1); }
    else if (act === "up" && i > 0) { var t = m[i]; m[i] = m[i - 1]; m[i - 1] = t; }
    else if (act === "down" && i < m.length - 1) { var t2 = m[i]; m[i] = m[i + 1]; m[i + 1] = t2; }
    else return;
    markDirty(); renderMenu();
  });
  $("#addItem").addEventListener("click", function () {
    draft.menu.push({ id: uid(), name: "Món mới", price: 35000, cat: "", icon: "🧋", desc: "", available: true });
    markDirty(); renderMenu(true);
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
    var done = inRange.filter(function (o) { return o.status === "done"; });
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
      if (o.status !== "done") return;
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

  var ST = { new: "Chờ xử lý", done: "Hoàn thành", cancelled: "Đã huỷ" };
  function orderHtml(o) {
    var c = o.customer || {};
    var acts = "";
    if (o.status === "new") acts = '<button class="btn ok sm" data-act="done">✓ Hoàn thành</button><button class="btn danger sm" data-act="cancelled">Huỷ đơn</button>';
    else acts = '<button class="btn ghost sm" data-act="new">Mở lại</button>';
    acts += '<button class="btn danger sm" data-act="del">🗑</button>';
    return '<div class="order ' + esc(o.status) + '" data-id="' + esc(o.id) + '">' +
      '<div class="h"><span>#' + esc(o.code || "") + ' <span class="tagx ' + esc(o.status) + '">' + esc(ST[o.status] || o.status) + '</span><span class="tagx">' + (o.source === "web" ? "Web" : "Tại quán") + "</span></span><span>" + money(orderTotal(o)) + "</span></div>" +
      '<div class="sub">' + fmtTime(o.createdAt) + " · " + esc(c.name || "") + (c.phone ? ' · <a href="tel:' + esc(String(c.phone).replace(/\D/g, "")) + '">' + esc(c.phone) + "</a>" : "") + "</div>" +
      (o.method ? '<div class="sub">' + esc(o.method) + (o.address ? " · " + esc(o.address) : "") + "</div>" : "") +
      "<ul>" + (o.items || []).map(function (it) {
        return "<li>" + esc(it.name) + " × " + esc(it.qty) + (it.sugar ? ' <span class="sub">(' + esc(it.sugar) + " đường, " + esc(it.ice) + ")</span>" : "") + "</li>";
      }).join("") + "</ul>" +
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
    if (act === "del") { if (!confirm("Xoá hẳn đơn này?")) return; p = Store.deleteOrder(id); }
    else p = Store.updateOrder(id, { status: act, updatedAt: Date.now() });
    p.catch(function (err) { alert("Chưa cập nhật được: " + (err && err.message ? err.message : err)); });
  });

  /* ---------- Ghi đơn tại quán ---------- */
  var manual = {};
  $("#manualBtn").addEventListener("click", function () {
    manual = {};
    renderManual();
    $("#manualDlg").showModal();
  });
  function renderManual() {
    var items = (saved ? saved.menu : []).filter(function (m) { return m.available !== false; });
    var total = 0;
    items.forEach(function (m) { total += (manual[m.id] || 0) * (Number(m.price) || 0); });
    $("#manualBody").innerHTML = '<button class="x" data-m="close">✕</button><h2>Ghi đơn bán tại quán</h2>' +
      (items.length ? items.map(function (m) {
        var q = manual[m.id] || 0;
        return '<div class="stepper-row"><span>' + esc(m.name) + '<br><small style="color:var(--muted)">' + money(m.price) + '</small></span><div class="qty">' +
          (q ? '<button class="minus" data-m="dec" data-id="' + esc(m.id) + '">−</button><span>' + q + "</span>" : "") +
          '<button data-m="inc" data-id="' + esc(m.id) + '">+</button></div></div>';
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
      var items = saved.menu.filter(function (m) { return manual[m.id]; }).map(function (m) {
        return { id: m.id, name: m.name, price: Number(m.price) || 0, qty: manual[m.id] };
      });
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
