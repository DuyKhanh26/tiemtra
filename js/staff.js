/* Trang dành cho nhân viên: xem đơn, đặt món tại quầy, bấm "Xong đơn".
 * Nhân viên KHÔNG có quyền xoá, huỷ đơn hay xem doanh thu (được chặn cả ở Firestore Rules). */
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
  var startOfDay = function (ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

  var me = null, shop = null, orders = [], cart = {}, tab = "orders";
  var unsubShop = null, unsubOrders = null, loginMsg = "", checking = "", seen = null;
  var baseTitle = "Nhân viên", soundOn = false, ac = null, wl = null;
  try { soundOn = localStorage.getItem("tra_sound") === "1"; } catch (e) {}

  function toast(msg) {
    var t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2400);
  }

  /* ---------- Đăng nhập + kiểm tra quyền nhân viên ---------- */
  function showLogin() {
    $("#appView").classList.add("hidden"); $("#loginView").classList.remove("hidden");
    $("#demoNote").classList.toggle("hidden", Store.mode !== "demo");
    var er = $("#loginErr");
    if (loginMsg) { er.textContent = loginMsg; er.classList.remove("hidden"); } else er.classList.add("hidden");
  }
  function stop() {
    if (unsubShop) { unsubShop(); unsubShop = null; }
    if (unsubOrders) { unsubOrders(); unsubOrders = null; }
    me = null; shop = null; orders = []; cart = {}; seen = null;
  }
  function start(user) {
    me = user;
    $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden");
    $("#who").textContent = user.email;
    if (!unsubShop) unsubShop = Store.subscribeShop(function (s) {
      shop = s; baseTitle = "Nhân viên – " + s.name; $("#barName").textContent = s.name;
      pruneCart(); renderAll();
    });
    if (!unsubOrders) unsubOrders = Store.subscribeOrdersSince(startOfDay(Date.now()) - 86400000, function (list) {
      detectNew(list); orders = list; renderAll();
    });
  }
  Store.onAuth(function (user) {
    if (!user) { checking = ""; stop(); showLogin(); return; }
    var email = String(user.email || "").toLowerCase();
    if ((me && me.email === email) || checking === email) return;
    checking = email;
    var pass = email === Store.OWNER ? Promise.resolve(true) : Store.isStaff(email);
    pass.then(function (ok) {
      if (checking !== email) return;
      if (!ok || user.verified === false) {
        loginMsg = "Tài khoản " + email + " chưa được chủ quán thêm làm nhân viên.";
        checking = ""; stop(); showLogin(); Store.logout(); return;
      }
      loginMsg = ""; checking = ""; start({ email: email });
    }).catch(function (e) {
      loginMsg = "Chưa kiểm tra được quyền đăng nhập: " + (e && e.message ? e.message : e);
      checking = ""; stop(); showLogin(); Store.logout();
    });
  });
  $("#loginBtn").addEventListener("click", function () {
    loginMsg = "";
    Store.login().catch(function (e) { loginMsg = "Đăng nhập chưa thành công: " + (e && e.message ? e.message : e); showLogin(); });
  });
  $("#logoutBtn").addEventListener("click", function () { Store.logout(); });

  /* ---------- Chuông báo đơn mới ---------- */
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
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.26);
    });
  }
  function keepAwake(on) {
    try {
      if (on && navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { wl = l; }, function () {});
      else if (wl) { wl.release(); wl = null; }
    } catch (e) {}
  }
  function renderBell() { $("#bellBtn").textContent = soundOn ? "🔔 Chuông: Bật" : "🔕 Chuông: Tắt"; }
  $("#bellBtn").addEventListener("click", function () {
    soundOn = !soundOn;
    try { localStorage.setItem("tra_sound", soundOn ? "1" : "0"); } catch (e) {}
    if (soundOn) { audio(); beep(); keepAwake(true); toast("Đã bật chuông. Giữ trang này mở để nghe khi có đơn."); } else keepAwake(false);
    renderBell();
  });
  document.addEventListener("pointerdown", function () { if (soundOn) audio(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && soundOn) keepAwake(true); });
  renderBell();
  function detectNew(list) {
    if (seen === null) { seen = {}; list.forEach(function (o) { seen[o.id] = 1; }); return; }
    var fresh = list.filter(function (o) { return !seen[o.id] && o.status === "new" && o.createdBy !== (me && me.email); });
    list.forEach(function (o) { seen[o.id] = 1; });
    if (fresh.length) { beep(); toast("🔔 Có " + fresh.length + " đơn mới!"); }
  }
  setInterval(function () {
    if (soundOn && orders.some(function (o) { return o.status === "new"; })) beep();
    if (me) renderOrders();
  }, 20000);

  /* ---------- Tabs ---------- */
  function setTab(name) {
    tab = name;
    $$(".tab").forEach(function (t) { t.classList.toggle("on", t.getAttribute("data-tab") === name); });
    ["orders", "tables", "new"].forEach(function (k) { $("#panel-" + k).classList.toggle("hidden", k !== name); });
  }
  $("#tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) setTab(b.getAttribute("data-tab")); });

  /* ---------- Danh sách đơn ---------- */
  function ago(ts) {
    var m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (m < 1) return "vừa xong";
    if (m < 60) return m + " phút trước";
    return Math.floor(m / 60) + " giờ " + (m % 60) + " phút trước";
  }
  function fmtTime(ts) { var d = new Date(ts), p = function (n) { return (n < 10 ? "0" : "") + n; }; return p(d.getHours()) + ":" + p(d.getMinutes()); }
  var SRC = { web: "Web", shop: "Tại quán", staff: "Nhân viên" };
  function orderHtml(o, isPending) {
    var c = o.customer || {};
    return '<div class="order ' + (isPending ? "" : "done") + '" data-id="' + esc(o.id) + '">' +
      '<div class="h"><span>#' + esc(o.code || "") + ' <span class="tagx">' + esc(SRC[o.source] || "Tại quán") + "</span>" + (o.table ? ' <span class="tagx tb">Bàn ' + esc(o.table) + "</span>" : "") + "</span><span>" + money(o.total) + "</span></div>" +
      '<div class="sub">' + fmtTime(o.createdAt) + (isPending ? ' · <span class="ago">' + ago(o.createdAt) + "</span>" : "") + " · " + esc(c.name || "") +
      (c.phone ? ' · <a href="tel:' + esc(String(c.phone).replace(/\D/g, "")) + '">' + esc(c.phone) + "</a>" : "") + "</div>" +
      (o.method ? '<div class="sub">' + esc(o.method) + (o.address ? " · " + esc(o.address) : "") + "</div>" : "") +
      "<ul>" + (o.items || []).map(function (it) {
        return "<li><b>" + esc(it.name) + " × " + esc(it.qty) + "</b>" + (it.sugar ? ' <span class="sub">(' + esc(it.sugar) + " đường, " + esc(it.ice) + ")</span>" : "") + "</li>";
      }).join("") + "</ul>" +
      (o.note ? '<div class="sub">📝 ' + esc(o.note) + "</div>" : "") +
      (isPending ? '<div class="acts"><button class="btn ok block" data-act="done">✓ Xong đơn</button></div>' : (o.doneBy ? '<div class="sub">Xong bởi ' + esc(String(o.doneBy).split("@")[0]) + "</div>" : "")) +
      "</div>";
  }
  function renderOrders() {
    var today = startOfDay(Date.now());
    var pend = orders.filter(function (o) { return o.status === "new"; }).sort(function (a, b) { return a.createdAt - b.createdAt; });
    var done = orders.filter(function (o) { return o.status === "done" && o.createdAt >= today; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    $("#pendCount").textContent = pend.length + " đơn";
    $("#doneCount").textContent = done.length + " đơn";
    $("#pending").innerHTML = pend.length ? pend.map(function (o) { return orderHtml(o, true); }).join("") :
      '<div style="text-align:center;color:var(--muted);padding:22px">Không có đơn nào đang chờ 🎉</div>';
    $("#done").innerHTML = done.slice(0, 40).map(function (o) { return orderHtml(o, false); }).join("");
    var nb = $("#newBadge"); nb.textContent = pend.length; nb.classList.toggle("hidden", pend.length === 0);
    document.title = pend.length ? "(" + pend.length + ") 🔔 " + baseTitle : baseTitle;
  }
  $("#pending").addEventListener("click", function (e) {
    var b = e.target.closest('[data-act="done"]'); if (!b) return;
    var card = b.closest(".order"), id = card.getAttribute("data-id");
    var code = (card.querySelector(".h span") || {}).textContent || "";
    if (!confirm("Đánh dấu đơn " + code.trim().split(" ")[0] + " đã xong? Bạn không thể hoàn tác.")) return;
    b.disabled = true;
    Store.updateOrder(id, { status: "done", updatedAt: Date.now(), doneBy: me.email })
      .then(function () { toast("Đã xong đơn ✓"); })
      .catch(function (err) { b.disabled = false; alert("Chưa cập nhật được: " + (err && err.message ? err.message : err)); });
  });

  /* ---------- Đặt món tại quầy ---------- */
  function availItems() { return shop ? (shop.menu || []).filter(function (m) { return m.available !== false; }) : []; }
  function pruneCart() {
    var ids = {}; availItems().forEach(function (m) { ids[m.id] = 1; });
    Object.keys(cart).forEach(function (k) { if (!ids[k]) delete cart[k]; });
  }
  function cartLines() {
    return availItems().filter(function (m) { return cart[m.id] > 0; }).map(function (m) {
      return { id: m.id, name: m.name, price: Number(m.price) || 0, qty: cart[m.id] };
    });
  }
  var nCat = "__all", nQ = "";
  function fold(t) { return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase(); }
  function renderNew() {
    var items = availItems(), cats = [], none = 0, selBy = {}, totalQty = 0;
    items.forEach(function (m) {
      var c = (m.cat || "").trim(), q = cart[m.id] || 0;
      if (!c) none++; else if (cats.indexOf(c) < 0) cats.push(c);
      selBy[c || "__none"] = (selBy[c || "__none"] || 0) + q; totalQty += q;
    });
    if (nCat !== "__all" && nCat !== "__none" && cats.indexOf(nCat) < 0) nCat = "__all";
    if (nCat === "__none" && !none) nCat = "__all";
    var chips = [{ k: "__all", t: "Tất cả", n: totalQty }];
    cats.forEach(function (c) { chips.push({ k: c, t: c, n: selBy[c] }); });
    if (none && cats.length) chips.push({ k: "__none", t: "Khác", n: selBy.__none });
    $("#nCats").innerHTML = chips.length > 1 ? chips.map(function (c) {
      return '<button class="cat' + (c.k === nCat && !nQ.trim() ? " on" : "") + '" data-ncat="' + esc(c.k) + '">' + esc(c.t) + (c.n ? " · " + c.n : "") + "</button>";
    }).join("") : "";

    var q = fold(nQ.trim());
    var list = items.filter(function (m) {
      var c = (m.cat || "").trim();
      if (q) return fold(m.name).indexOf(q) >= 0;   // đang tìm: tìm trong toàn bộ thực đơn
      if (nCat === "__none") return !c;
      return nCat === "__all" || c === nCat;
    });
    var html = "", lastCat = null, heads = nCat === "__all" && !q;
    list.forEach(function (m) {
      var cat = (m.cat || "").trim();
      if (heads && cat !== lastCat) { if (cat) html += '<div class="catline">' + esc(cat) + "</div>"; lastCat = cat; }
      var n = cart[m.id] || 0;
      html += '<div class="stepper-row"><span>' + esc(m.name) + '<br><small style="color:var(--muted)">' + money(m.price) + "</small></span><div class=\"qty\">" +
        (n ? '<button class="minus" data-n="dec" data-id="' + esc(m.id) + '">−</button><span>' + n + "</span>" : "") +
        '<button data-n="inc" data-id="' + esc(m.id) + '">+</button></div></div>';
    });
    $("#newMenu").innerHTML = html || '<div style="color:var(--muted);padding:12px;text-align:center">' + (items.length ? "Không có món nào khớp." : "Chưa có món nào đang bán.") + "</div>";

    var lines = cartLines();
    $("#nPicked").innerHTML = lines.length ? '<div class="catline" style="margin-top:0">Món đã chọn</div>' + lines.map(function (l) {
      return '<div class="stepper-row"><span>' + esc(l.name) + " × " + l.qty + "</span><b>" + money(l.price * l.qty) + "</b></div>";
    }).join("") : '<div style="color:var(--muted);font-size:13px">Chưa chọn món nào. Bấm dấu + ở danh sách phía trên.</div>';
    var total = lines.reduce(function (s, l) { return s + l.price * l.qty; }, 0);
    $("#nTotal").textContent = money(total);
    $("#nCreate").disabled = lines.length === 0;
  }
  $("#nCats").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ncat]"); if (!b) return;
    nCat = b.getAttribute("data-ncat"); renderNew();
  });
  $("#nSearch").addEventListener("input", function () { nQ = this.value; renderNew(); });
  $("#newMenu").addEventListener("click", function (e) {
    var b = e.target.closest("[data-n]"); if (!b) return;
    var id = b.getAttribute("data-id");
    if (b.getAttribute("data-n") === "inc") cart[id] = Math.min(99, (cart[id] || 0) + 1);
    else { cart[id] = (cart[id] || 0) - 1; if (cart[id] <= 0) delete cart[id]; }
    renderNew();
  });
  $("#nCreate").addEventListener("click", function () {
    var lines = cartLines(); if (!lines.length) return;
    var method0 = $("#nMethod").value, tbl = method0 === "Uống tại quán" ? Tables.norm($("#nTable").value) : "";
    if (method0 === "Uống tại quán" && !tbl) { alert("Bạn vui lòng nhập số bàn."); $("#nTable").focus(); return; }
    var total = lines.reduce(function (s, l) { return s + l.price * l.qty; }, 0);
    var code = Math.random().toString(36).slice(2, 6).toUpperCase();
    var order = {
      code: code, source: "staff", status: "new", createdAt: Date.now(), createdBy: me.email,
      customer: { name: $("#nName").value.trim() || "Khách tại quán", phone: "" },
      method: $("#nMethod").value, address: "", note: $("#nNote").value.trim(), total: total,
      items: lines.map(function (l) { return { id: l.id, name: l.name, price: l.price, qty: l.qty }; })
    };
    if (tbl) { order.table = tbl; order.billStatus = "open"; }
    var btn = this; btn.disabled = true; btn.textContent = "Đang tạo…";
    Store.addOrder(order).then(function () {
      cart = {}; $("#nName").value = ""; $("#nNote").value = ""; $("#nTable").value = ""; $("#nSearch").value = ""; nQ = ""; renderNew();
      var dine = !!order.table;
      $("#dlgBody").innerHTML = '<button class="x" data-d="close">✕</button><div class="success"><div class="big">✅</div><h2>Đã tạo đơn #' + esc(code) + "</h2><p>" + money(total) + " · " + esc(order.method) +
        (dine ? " · <b>" + esc(Tables.label(tbl)) + "</b><br>Chưa tính tiền: bấm “Tính tiền” ở tab Bàn khi khách xong." : "") + "</p>" +
        (dine ? "" : '<div id="payHost"></div>') + '<button class="btn block" data-d="close">Xong</button></div>';
      var h = document.getElementById("payHost"); if (h && window.Pay) window.Pay.render(h, code, total);
      $("#dlg").showModal();
    }).catch(function (err) { alert("Chưa tạo được đơn: " + (err && err.message ? err.message : err)); })
      .then(function () { btn.textContent = "Tạo đơn"; renderNew(); });
  });
  $("#dlg").addEventListener("click", function (e) {
    if (e.target === this || e.target.closest('[data-d="close"]')) {
      this.close();
      setTab("orders");
    }
  });

  /* ---------- Các bàn đang mở ---------- */
  var billUI = null;
  function renderTablesList() {
    var gs = Tables.group(orders);
    $("#tables").innerHTML = Tables.cardsHtml(gs);
    var tb = $("#tblBadge"); tb.textContent = gs.length; tb.classList.toggle("hidden", gs.length === 0);
    $("#nTables").innerHTML = gs.map(function (g) { return '<option value="' + esc(g.table) + '">'; }).join("");
  }
  $("#tables").addEventListener("click", function (e) {
    var b = e.target.closest("[data-bill-open]"); if (!b) return;
    var g = Tables.group(orders).filter(function (x) { return x.table === b.getAttribute("data-bill-open"); })[0];
    if (!g) return;
    if (!billUI) billUI = Tables.createBillUI({ dlg: $("#billDlg"), body: $("#billBody"), email: function () { return me.email; }, toast: toast });
    billUI.open(g);
  });
  $("#nMethod").addEventListener("change", function () { $("#nTableBox").classList.toggle("hidden", this.value !== "Uống tại quán"); });

  function renderAll() { renderOrders(); renderTablesList(); renderNew(); }
})();
