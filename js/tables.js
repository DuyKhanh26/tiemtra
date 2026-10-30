/* Gộp bill theo bàn (uống tại quán): nhiều lần gọi món cùng số bàn → tính tiền một lần.
 * Dùng chung cho trang khách (chuẩn hoá số bàn), trang nhân viên và trang chủ quán. */
(function () {
  "use strict";
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var money = function (n) { return (Number(n) || 0).toLocaleString("vi-VN") + "đ"; };
  var hhmm = function (ts) { var d = new Date(ts), p = function (n) { return (n < 10 ? "0" : "") + n; }; return p(d.getHours()) + ":" + p(d.getMinutes()); };

  /* "bàn 5", "Ban 5", " 5 " → "5" ; "a2" → "A2" */
  function norm(t) {
    var s = String(t == null ? "" : t).trim().toUpperCase().replace(/\s+/g, " ");
    s = s.replace(/^B[ÀÁẢÃẠA]N(\s+|(?=\d))/, "");
    return s.replace(/[^0-9A-ZÀ-ỹ \-]/g, "").trim().slice(0, 10);
  }
  function label(t) { return "Bàn " + t; }

  /* Size M / L: món có priceM và/hoặc priceL (>0) thì bán theo size, ngược lại bán theo "price" */
  function sizesOf(m) {
    var r = [], pm = Number(m && m.priceM) || 0, pl = Number(m && m.priceL) || 0;
    if (pm > 0) r.push({ n: "M", p: pm });
    if (pl > 0) r.push({ n: "L", p: pl });
    return r;
  }
  /* Hết món theo từng size (hoặc cả món nếu không chia size): khoá "id" hoặc "id|M" nằm trong danh sách hết */
  var OFF = {};
  function setOff(list) { OFF = {}; (list || []).forEach(function (k) { OFF[k] = 1; }); }
  function isOff(key) { return !!OFF[key]; }

  /* Mỗi "biến thể" = một dòng có thể đặt: key là id món (hoặc "id|M", "id|L" nếu có size) */
  function variants(m) {
    var s = sizesOf(m);
    if (!s.length) return [{ key: m.id, id: m.id, size: "", name: m.name, price: Number(m.price) || 0, item: m, off: isOff(m.id) }];
    return s.map(function (x) { var k = m.id + "|" + x.n; return { key: k, id: m.id, size: x.n, name: m.name + " (" + x.n + ")", price: x.p, item: m, off: isOff(k) }; });
  }
  function findVariant(menu, key) {
    var list = menu || [];
    for (var i = 0; i < list.length; i++) {
      var v = variants(list[i]);
      for (var j = 0; j < v.length; j++) if (v[j].key === key) return v[j];
    }
    return null;
  }
  function priceText(m) {
    var s = sizesOf(m);
    return s.length ? s.map(function (x) { return x.n + " " + money(x.p) + (isOff(m.id + "|" + x.n) ? " (hết)" : ""); }).join(" · ") : money(m.price) + (isOff(m.id) ? " (hết)" : "");
  }
  function starHtml(m) { return m && m.best ? ' <span class="star" title="Best-Seller">★</span>' : ""; }
  function orderTotal(o) {
    return (o.items || []).reduce(function (s, i) { return s + (Number(i.price) || 0) * (Number(i.qty) || 0); }, 0);
  }

  /* Các bàn đang mở (có đơn chưa tính tiền, không tính đơn đã huỷ) */
  function group(orders) {
    var map = {};
    (orders || []).forEach(function (o) {
      if (!o.table || o.billStatus !== "open" || o.status === "cancelled") return;
      var g = map[o.table] || (map[o.table] = { table: o.table, orders: [], total: 0, pending: 0, cups: 0, first: o.createdAt || 0 });
      g.orders.push(o); g.total += orderTotal(o);
      if (o.status === "new") g.pending++;
      g.first = Math.min(g.first, o.createdAt || g.first);
    });
    return Object.keys(map).map(function (k) {
      var g = map[k], lines = {};
      g.orders.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
      g.orders.forEach(function (o) {
        (o.items || []).forEach(function (it) {
          var key = (it.id || it.name) + "|" + (Number(it.price) || 0);
          var l = lines[key] || (lines[key] = { name: it.name, price: Number(it.price) || 0, qty: 0 });
          l.qty += Number(it.qty) || 0; g.cups += Number(it.qty) || 0;
        });
      });
      g.lines = Object.keys(lines).map(function (x) { return lines[x]; });
      return g;
    }).sort(function (a, b) { return a.first - b.first; });
  }

  /* Các hoá đơn bàn đã tính tiền (gộp theo mã hoá đơn), từ mốc thời gian `since` */
  function paidGroups(orders, since) {
    var map = {};
    (orders || []).forEach(function (o) {
      if (!o.table || o.billStatus !== "paid" || o.status === "cancelled" || (o.paidAt || 0) < since) return;
      var k = o.table + "|" + (o.billCode || o.paidAt);
      var g = map[k] || (map[k] = { table: o.table, total: 0, paidAt: o.paidAt || 0, paidBy: o.paidBy, payMethod: o.payMethod, rounds: 0 });
      g.total += orderTotal(o); g.rounds++;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.paidAt - a.paidAt; });
  }
  function paidHtml(groups, nameOf) {
    if (!groups.length) return "";
    return '<div class="sec"><span>Đã tính tiền hôm nay</span><small>' + groups.length + " hoá đơn</small></div>" + groups.map(function (g) {
      return '<div class="order done"><div class="h"><span>✅ ' + esc(label(g.table)) + "</span><span>" + money(g.total) + "</span></div>" +
        '<div class="sub">' + hhmm(g.paidAt) + " · " + (g.payMethod === "cash" ? "Tiền mặt" : "Chuyển khoản") + " · <b>Thu bởi " + esc(nameOf(g.paidBy)) + "</b> · " + g.rounds + " lần gọi</div></div>";
    }).join("");
  }

  function cardsHtml(groups) {
    if (!groups.length) return '<div style="text-align:center;color:var(--muted);padding:26px">Chưa có bàn nào đang mở 🍃</div>';
    return groups.map(function (g) {
      return '<div class="order tbl"><div class="h"><span>🪑 ' + esc(label(g.table)) + "</span><span>" + money(g.total) + "</span></div>" +
        '<div class="sub">' + g.cups + " ly/phần · " + g.orders.length + " lần gọi · từ " + hhmm(g.first) +
        (g.pending ? ' · <span class="ago">⏳ còn ' + g.pending + " đơn chưa xong</span>" : "") + "</div>" +
        "<ul>" + g.lines.map(function (l) { return "<li>" + esc(l.name) + " × " + l.qty + ' <span class="sub">' + money(l.price * l.qty) + "</span></li>"; }).join("") + "</ul>" +
        '<div class="acts"><button class="btn" style="flex:1" data-bill-open="' + esc(g.table) + '">💰 Tính tiền</button>' +
        '<button class="btn ghost" data-move-open="' + esc(g.table) + '">↔ Chuyển bàn</button></div></div>';
    }).join("");
  }

  /* Lọc bàn theo số gõ vào ("5", "bàn 5"): khớp một phần số bàn */
  function filterTables(list, q) {
    var k = norm(q); if (!k) return list;
    return list.filter(function (g) { return String(g.table).indexOf(k) >= 0; });
  }
  var NOHIT = '<div style="text-align:center;color:var(--muted);padding:26px">Không thấy bàn nào khớp 🔍</div>';

  /* Trạng thái thanh toán của đơn mang đi/giao (đơn tại bàn thì tính tiền theo bàn) */
  function payTag(o) {
    if (o.table || o.source === "shop" || o.status === "cancelled") return "";
    return o.orderPaid ? ' <span class="tagx paid">✅ Đã thanh toán</span>' : ' <span class="tagx unpaid">⏳ Chưa thanh toán</span>';
  }

  /* Yêu cầu mở bàn từ khách (đang chờ duyệt) */
  function reqHtml(list) {
    if (!list || !list.length) return "";
    return '<div class="order tbl reqbox"><div class="h"><span>🔔 Khách xin mở bàn</span><span>' + list.length + "</span></div>" +
      list.map(function (r) {
        return '<div class="stepper-row"><span><b>' + esc(label(r.table)) + "</b><br><small style=\"color:var(--muted)\">" +
          esc(r.name || "Khách") + " · " + hhmm(r.createdAt) + "</small></span>" +
          '<span style="display:flex;gap:6px"><button class="btn ok sm" data-req-ok="' + esc(r.id) + '">✓ Mở bàn</button>' +
          '<button class="btn ghost sm" data-req-no="' + esc(r.id) + '">Từ chối</button></span></div>';
      }).join("") + "</div>";
  }
  /* Mở/từ chối yêu cầu: gắn vào một vùng chứa, who() trả về email người duyệt */
  function bindRequests(root, getList, who, toast) {
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-req-ok],[data-req-no]"); if (!b) return;
      var ok = b.hasAttribute("data-req-ok"), id = b.getAttribute(ok ? "data-req-ok" : "data-req-no");
      var r = (getList() || []).filter(function (x) { return x.id === id; })[0]; if (!r) return;
      b.disabled = true;
      Store.answerRequest(r, ok, who()).then(function () { toast(ok ? "Đã mở " + label(r.table) + " ✓" : "Đã từ chối " + label(r.table)); })
        .catch(function (err) { b.disabled = false; alert("Chưa xử lý được: " + (err && err.message ? err.message : err)); });
    });
  }
  /* Ô "Mở bàn" thủ công: inputSel, btnSel */
  function bindManualOpen(input, btn, who, toast) {
    btn.addEventListener("click", function () {
      var t = norm(input.value); if (!t) { alert("Bạn vui lòng nhập số bàn."); input.focus(); return; }
      btn.disabled = true;
      Store.openTable(t, who()).then(function () { input.value = ""; toast("Đã mở " + label(t) + " ✓"); })
        .catch(function (err) { alert("Chưa mở được bàn: " + (err && err.message ? err.message : err)); })
        .then(function () { btn.disabled = false; });
    });
  }

  /* Hộp thoại tính tiền: cfg = { dlg, body, email(): string, toast(msg) } */
  function createBillUI(cfg) {
    var cur = null, busy = false;
    function head(title) { return '<button class="x" data-b="close">✕</button><h2>' + title + "</h2>"; }
    function summary() {
      var g = cur.g;
      return '<div class="sub" style="margin-bottom:6px">' + g.orders.length + " lần gọi món · mở lúc " + hhmm(g.first) + "</div>" +
        g.lines.map(function (l) {
          return '<div class="stepper-row"><span>' + esc(l.name) + " × " + l.qty + "</span><b>" + money(l.price * l.qty) + "</b></div>";
        }).join("") +
        '<div class="total"><span>Tổng cộng</span><span>' + money(g.total) + "</span></div>" +
        (g.pending ? '<div class="closed-banner" style="margin:0 0 12px;font-size:13px">⏳ Còn ' + g.pending + " đơn của bàn này chưa làm xong.</div>" : "");
    }
    function viewMain() {
      cfg.body.innerHTML = head("Tính tiền " + esc(label(cur.g.table))) + summary() +
        '<button class="btn ok block" data-b="cash">💵 Thu tiền mặt</button>' +
        '<button class="btn block" data-b="qr" style="margin-top:8px">🏦 Chuyển khoản (hiện mã QR)</button>' +
        '<button class="btn ghost block" data-b="move" style="margin-top:8px">↔ Chuyển / gộp sang bàn khác</button>';
    }
    function viewMove() {
      var others = cur.groups.filter(function (x) { return x.table !== cur.g.table; });
      cfg.body.innerHTML = head("Chuyển " + esc(label(cur.g.table))) +
        '<p class="sub" style="margin:0 0 6px">Khách đổi chỗ ngồi? Nhập số bàn mới, tất cả món đã gọi sẽ chuyển theo. Nếu bàn mới đang có khách thì hai bàn gộp thành một hoá đơn.</p>' +
        '<div class="total"><span>' + esc(label(cur.g.table)) + "</span><span>" + money(cur.g.total) + "</span></div>" +
        '<label class="f" style="margin-top:0">Số bàn mới</label><input id="moveTo" list="moveList" maxlength="10" autocomplete="off" placeholder="Ví dụ: 2">' +
        '<datalist id="moveList">' + others.map(function (x) { return '<option value="' + esc(x.table) + '">'; }).join("") + "</datalist>" +
        (others.length ? '<div class="hintsm">Bàn đang có khách: ' + others.map(function (x) { return esc(x.table); }).join(", ") + "</div>" : "") +
        '<button class="btn block" data-b="domove" style="margin-top:12px">↔ Chuyển bàn</button>' +
        '<button class="btn ghost block" data-b="back" style="margin-top:8px">← Quay lại</button>';
    }
    function doMove() {
      if (busy) return;
      var to = norm((cfg.body.querySelector("#moveTo") || {}).value), g = cur.g;
      if (!to) { alert("Bạn vui lòng nhập số bàn mới."); return; }
      if (to === g.table) { alert("Số bàn mới trùng với bàn hiện tại."); return; }
      var exist = cur.groups.filter(function (x) { return x.table === to; })[0];
      var msg = exist ? label(to) + " đang có khách (" + money(exist.total) + "). Gộp " + label(g.table) + " vào " + label(to) + " thành một hoá đơn?"
                      : "Chuyển " + label(g.table) + " sang " + label(to) + "?";
      if (!confirm(msg)) return;
      busy = true;
      Store.updateOrders(g.orders.map(function (o) { return o.id; }), { table: to, movedFrom: g.table, movedAt: Date.now(), movedBy: cfg.email() })
        .then(function () {
          try { Store.openTable(to, cfg.email()).catch(function () {}); Store.closeTable(g.table).catch(function () {}); } catch (x) {}
          cfg.dlg.close(); cfg.toast((exist ? "Đã gộp " : "Đã chuyển ") + label(g.table) + " → " + label(to) + " ✓");
        })
        .catch(function (e) { alert("Chưa chuyển được bàn: " + (e && e.message ? e.message : e)); })
        .then(function () { busy = false; });
    }
    function viewQr() {
      cfg.body.innerHTML = head("Chuyển khoản " + esc(label(cur.g.table))) +
        '<div class="total"><span>Tổng cộng</span><span>' + money(cur.g.total) + "</span></div>" +
        '<div id="billPayHost"></div>' +
        '<button class="btn ok block" data-b="transfer" style="margin-top:6px">✓ Đã nhận chuyển khoản</button>' +
        '<button class="btn ghost block" data-b="back" style="margin-top:8px">← Quay lại</button>';
      var h = cfg.body.querySelector("#billPayHost");
      if (window.Pay && window.Pay.enabled()) window.Pay.render(h, cur.code, cur.g.total);
      else h.innerHTML = '<div class="sub" style="padding:8px 0">Chưa cài thông tin ngân hàng (js/bank-config.js), nên chưa hiện được mã QR.</div>';
    }
    function pay(method) {
      if (busy) return; busy = true;
      var g = cur.g, ids = g.orders.map(function (o) { return o.id; });
      Store.updateOrders(ids, { billStatus: "paid", paidAt: Date.now(), paidBy: cfg.email(), payMethod: method, billCode: cur.code })
        .then(function () { try { Store.closeTable(g.table).catch(function () {}); } catch (x) {} cfg.dlg.close(); cfg.toast("Đã tính tiền " + label(g.table) + " ✓"); })
        .catch(function (e) { alert("Chưa lưu được thanh toán: " + (e && e.message ? e.message : e) + "\nBạn mở lại bàn này để kiểm tra rồi thử lại."); })
        .then(function () { busy = false; });
    }
    cfg.dlg.addEventListener("click", function (e) {
      if (e.target === cfg.dlg) { cfg.dlg.close(); return; }
      var b = e.target.closest("[data-b]"); if (!b || !cur) return;
      var a = b.getAttribute("data-b");
      if (a === "close") cfg.dlg.close();
      else if (a === "back") viewMain();
      else if (a === "qr") viewQr();
      else if (a === "move") viewMove();
      else if (a === "domove") doMove();
      else if (a === "cash") { if (confirm("Xác nhận đã thu " + money(cur.g.total) + " tiền mặt của " + label(cur.g.table) + "?")) pay("cash"); }
      else if (a === "transfer") { if (confirm("Xác nhận đã nhận " + money(cur.g.total) + " chuyển khoản của " + label(cur.g.table) + "?")) pay("transfer"); }
    });
    return {
      open: function (g, groups, view) {
        cur = { g: g, groups: groups || [g], code: Math.random().toString(36).slice(2, 6).toUpperCase() };
        if (view === "move") viewMove(); else viewMain();
        cfg.dlg.showModal();
      }
    };
  }

  window.Tables = { norm: norm, label: label, group: group, cardsHtml: cardsHtml, paidGroups: paidGroups, paidHtml: paidHtml, createBillUI: createBillUI, setOff: setOff, isOff: isOff, payTag: payTag, filterTables: filterTables, reqHtml: reqHtml, noHit: NOHIT, bindRequests: bindRequests, bindManualOpen: bindManualOpen, orderTotal: orderTotal,
    sizesOf: sizesOf, variants: variants, findVariant: findVariant, priceText: priceText, starHtml: starHtml };
})();
