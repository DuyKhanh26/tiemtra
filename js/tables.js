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
        '<div class="acts"><button class="btn block" data-bill-open="' + esc(g.table) + '">💰 Tính tiền ' + esc(label(g.table)) + "</button></div></div>";
    }).join("");
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
        '<button class="btn block" data-b="qr" style="margin-top:8px">🏦 Chuyển khoản (hiện mã QR)</button>';
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
        .then(function () { cfg.dlg.close(); cfg.toast("Đã tính tiền " + label(g.table) + " ✓"); })
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
      else if (a === "cash") { if (confirm("Xác nhận đã thu " + money(cur.g.total) + " tiền mặt của " + label(cur.g.table) + "?")) pay("cash"); }
      else if (a === "transfer") { if (confirm("Xác nhận đã nhận " + money(cur.g.total) + " chuyển khoản của " + label(cur.g.table) + "?")) pay("transfer"); }
    });
    return {
      open: function (g) {
        cur = { g: g, code: Math.random().toString(36).slice(2, 6).toUpperCase() };
        viewMain(); cfg.dlg.showModal();
      }
    };
  }

  window.Tables = { norm: norm, label: label, group: group, cardsHtml: cardsHtml, paidGroups: paidGroups, paidHtml: paidHtml, createBillUI: createBillUI, orderTotal: orderTotal };
})();
