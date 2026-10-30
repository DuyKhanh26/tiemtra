/* Trang dành cho khách mua hàng (không cần đăng nhập) */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var money = function (n) { return (Number(n) || 0).toLocaleString("vi-VN") + "đ"; };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var digits = function (s) { return String(s || "").replace(/\D/g, ""); };

  var BEST = "Best-Seller";
  var SUGAR = ["100%", "70%", "50%", "30%", "0%"];
  var ICE = ["Đá bình thường", "Ít đá", "Đá riêng", "Không đá"];

  var shop = null;
  var cart = loadCart();      // { itemId: {qty, sugar, ice} }
  var activeCat = "Tất cả";
  var checkoutInfo = loadInfo();
  var urlTable = "";
  try { urlTable = window.Tables ? Tables.norm(new URLSearchParams(location.search).get("ban")) : ""; } catch (e) {}

  function loadCart() { try { return JSON.parse(localStorage.getItem("tra_cart") || "{}"); } catch (e) { return {}; } }
  function saveCart() { try { localStorage.setItem("tra_cart", JSON.stringify(cart)); } catch (e) {} }
  function loadInfo() { try { return JSON.parse(localStorage.getItem("tra_info") || "{}"); } catch (e) { return {}; } }
  function saveInfo() { try { localStorage.setItem("tra_info", JSON.stringify(checkoutInfo)); } catch (e) {} }

  function isOpen() { return shop && shop.isOpen !== false; }
  function itemById(id) { return (shop.menu || []).filter(function (m) { return m.id === id; })[0]; }

  /* Đồng bộ giỏ hàng với thực đơn mới nhất (đổi giá, hết món, xoá món…) */
  function syncCart() {
    Object.keys(cart).forEach(function (key) {
      var v = Tables.findVariant(shop.menu, key);
      if (!v || v.item.available === false || v.off || !(cart[key].qty > 0)) delete cart[key];
    });
    saveCart();
  }
  function cartLines() {
    return Object.keys(cart).map(function (key) {
      var v = Tables.findVariant(shop.menu, key), c = cart[key];
      return v ? { key: key, id: v.id, size: v.size, name: v.name, price: v.price, qty: c.qty, sugar: c.sugar, ice: c.ice } : null;
    }).filter(Boolean);
  }
  function cartTotals() {
    var q = 0, t = 0;
    cartLines().forEach(function (l) { q += l.qty; t += l.qty * l.price; });
    return { qty: q, total: t };
  }

  function iconHtml(icon) {
    icon = String(icon || "🧋");
    if (/^https?:\/\//i.test(icon)) return '<img src="' + esc(icon) + '" alt="" loading="lazy">';
    return esc(icon);
  }

  /* ---------- Hiển thị ---------- */
  function renderHeader() {
    document.title = shop.name;
    $("#shopName").textContent = shop.name;
    $("#tagline").textContent = shop.tagline || "";
    var n = $("#notice");
    if (shop.notice) { n.textContent = shop.notice; n.classList.remove("hidden"); } else n.classList.add("hidden");
    $("#addr").textContent = shop.address || "";
    $("#hours").textContent = shop.hours || "";
    var d = digits(shop.phone);
    $("#phoneTxt").textContent = shop.phone || "";
    $("#callLink").href = "tel:" + d;
    $("#zaloLink").href = "https://zalo.me/" + d;
    var b = $("#openBadge");
    b.classList.toggle("closed", !isOpen());
    b.querySelector("span").textContent = isOpen() ? "Quán đang bán" : "Quán đang nghỉ";
    var cb = $("#closedBanner");
    if (isOpen()) cb.classList.add("hidden");
    else { cb.textContent = "😴 " + (shop.closedNote || "Quán đang nghỉ."); cb.classList.remove("hidden"); }
    $("#foot").textContent = "© " + new Date().getFullYear() + " " + shop.name;
  }

  function renderMenu() {
    var menu = shop.menu || [];
    var cats = ["Tất cả"];
    var hasBest = menu.some(function (m) { return m.best; });
    if (hasBest) cats.push(BEST);
    menu.forEach(function (m) { var c = (m.cat || "").trim(); if (c && cats.indexOf(c) < 0) cats.push(c); });
    if (cats.indexOf(activeCat) < 0) activeCat = "Tất cả";
    $("#cats").innerHTML = cats.length > 2 || hasBest ? cats.map(function (c) {
      return '<button class="cat' + (c === activeCat ? " on" : "") + '" data-cat="' + esc(c) + '">' + (c === BEST ? "⭐ " : "") + esc(c) + "</button>";
    }).join("") : "";

    var list = menu.filter(function (m) {
      if (activeCat === "Tất cả") return true;
      if (activeCat === BEST) return !!m.best;
      return (m.cat || "").trim() === activeCat;
    });
    if (!list.length) { $("#menu").innerHTML = '<div class="empty">Chưa có món nào 🍃</div>'; return; }
    $("#menu").innerHTML = list.map(function (m) {
      var off = m.available === false;
      var vs = Tables.variants(m), sized = vs[0].size !== "";
      if (!off && vs.every(function (v) { return v.off; })) off = true;
      function ctlFor(v) {
        var q = cart[v.key] ? cart[v.key].qty : 0;
        return '<div class="qty">' +
          (q > 0 ? '<button class="minus" data-act="dec" data-id="' + esc(v.key) + '" aria-label="Bớt">−</button><span>' + q + "</span>" : "") +
          '<button data-act="inc" data-id="' + esc(v.key) + '" aria-label="Thêm">+</button></div>';
      }
      var ctl = "", prices;
      if (off) ctl = '<span class="tag-off">Tạm hết</span>';
      if (sized) {
        prices = '<div class="szs">' + vs.map(function (v) {
          return '<div class="sz' + (v.off ? " szoff" : "") + '"><span class="szn">' + esc(v.size) + '</span><span class="szp">' + money(v.price) + "</span>" +
            (v.off ? '<span class="tag-off">Hết</span>' : (off || !isOpen() ? "" : ctlFor(v))) + "</div>";
        }).join("") + "</div>";
        if (!off) ctl = "";
      } else {
        prices = '<div class="pr">' + money(m.price) + "</div>";
        if (!off && isOpen()) ctl = ctlFor(vs[0]);
      }
      return '<article class="item' + (off ? " off" : "") + '">' +
        '<div class="ico">' + iconHtml(m.icon) + "</div>" +
        '<div class="meta"><div class="nm">' + esc(m.name) + Tables.starHtml(m) + "</div>" +
        (m.desc ? '<div class="ds">' + esc(m.desc) + "</div>" : "") +
        prices + "</div>" + ctl + "</article>";
    }).join("");
  }

  function renderCartBar() {
    var t = cartTotals();
    var bar = $("#cartBar");
    if (t.qty > 0 && isOpen()) {
      bar.classList.remove("hidden");
      $("#cartCount").textContent = t.qty;
      $("#cartTotal").textContent = money(t.total);
    } else bar.classList.add("hidden");
  }

  function renderAll() {
    renderHeader(); renderMenu(); renderCartBar(); renderLastPay();
    if ($("#cartDlg").open && $("#cartBody").getAttribute("data-view") === "cart") renderCart();
  }

  /* ---------- Giỏ hàng / thanh toán ---------- */
  function opt(list, sel) {
    return list.map(function (o) { return '<option' + (o === sel ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("");
  }

  function renderCart() {
    var lines = cartLines(), t = cartTotals();
    var body = $("#cartBody");
    body.setAttribute("data-view", "cart");
    if (!lines.length) {
      body.innerHTML = '<button class="x" data-act="close">✕</button><h2>Đơn của bạn</h2><div class="empty">Chưa chọn món nào 🧋</div>';
      return;
    }
    var m = urlTable ? "Uống tại quán" : (checkoutInfo.method || "Mang đi");
    body.innerHTML =
      '<button class="x" data-act="close">✕</button><h2>Đơn của bạn</h2>' +
      lines.map(function (l) {
        return '<div class="line" data-id="' + esc(l.key) + '"><div class="t"><span>' + esc(l.name) + " × " + l.qty + "</span><span>" + money(l.price * l.qty) + "</span></div>" +
          '<div class="opts"><select data-f="sugar" aria-label="Đường">' + SUGAR.map(function (s) { return "<option" + (s === l.sugar ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select>" +
          '<select data-f="ice" aria-label="Đá">' + opt(ICE, l.ice) + "</select></div></div>";
      }).join("") +
      '<div class="total"><span>Tổng cộng</span><span>' + money(t.total) + "</span></div>" +
      '<label class="f">Tên của bạn *</label><input id="cName" autocomplete="name" value="' + esc(checkoutInfo.name || "") + '" placeholder="Nguyễn Văn A">' +
      '<label class="f">Số điện thoại *</label><input id="cPhone" type="tel" autocomplete="tel" value="' + esc(checkoutInfo.phone || "") + '" placeholder="09xx xxx xxx">' +
      '<label class="f">Hình thức nhận</label><select id="cMethod">' + opt(["Mang đi", "Uống tại quán", "Giao hàng (Grab/Be…)"], m) + "</select>" +
      '<div id="tableBox" class="' + (m === "Uống tại quán" ? "" : "hidden") + '"><label class="f">Số bàn (không bắt buộc)</label><input id="cTable" maxlength="10" autocomplete="off" value="' + esc(urlTable || (checkoutInfo.tableAt && Date.now() - checkoutInfo.tableAt < 10 * 60 * 1000 ? checkoutInfo.table : "") || "") + '" placeholder="Bàn bạn đang ngồi, ví dụ: 5"><div class="hintsm">Điền số bàn để gọi thêm món sau này: quán gộp thành một hoá đơn, thanh toán một lần khi bạn xong. Để trống nếu bạn muốn thanh toán riêng đơn này ngay.</div></div>' +
      '<div id="addrBox" class="' + (m.indexOf("Giao") === 0 ? "" : "hidden") + '"><label class="f">Địa chỉ giao hàng *</label><input id="cAddr" autocomplete="street-address" value="' + esc(checkoutInfo.address || "") + '" placeholder="Số nhà, đường, phường…"></div>' +
      '<label class="f">Ghi chú</label><textarea id="cNote" placeholder="Ví dụ: ít ngọt, thêm trân châu…"></textarea>' +
      '<div style="height:14px"></div><button class="btn block" data-act="submit">Hoàn tất đặt món</button>';
  }

  /* Báo đơn mới về điện thoại chủ quán qua ntfy (không kèm tên/SĐT khách) */
  function pushNotify(order) {
    var topic = String(window.NTFY_TOPIC || "").trim();
    if (!topic) return;
    try {
      var text = order.items.map(function (i) { return i.name + " ×" + i.qty; }).join(", ");
      if (text.length > 180) text = text.slice(0, 177) + "…";
      fetch("https://ntfy.sh", {
        method: "POST",
        body: JSON.stringify({
          topic: topic,
          title: "🔔 Đơn mới #" + order.code + " – " + money(order.total),
          message: text + " (" + order.method + (order.table ? " · Bàn " + order.table : "") + ")",
          priority: 5,
          tags: ["bell"],
          click: new URL("admin.html", location.href).href
        })
      }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- Mã QR thanh toán ---------- */
  function mountPay(code, total) {
    var h = document.getElementById("payHost");
    if (h && window.Pay) window.Pay.render(h, code, total);
  }
  function loadLast() {
    try { var l = JSON.parse(localStorage.getItem("tra_last") || "null"); return l && Date.now() - l.at < 10 * 60 * 1000 ? l : null; } catch (e) { return null; }
  }
  function renderLastPay() {
    var b = $("#lastPay"), l = loadLast();
    if (l && window.Pay && window.Pay.enabled()) { b.textContent = "💳 Xem lại mã thanh toán đơn #" + l.code; b.classList.remove("hidden"); }
    else b.classList.add("hidden");
  }

  function submitOrder() {
    var name = $("#cName").value.trim();
    var phone = $("#cPhone").value.trim();
    var method = $("#cMethod").value;
    var addr = $("#cAddr") ? $("#cAddr").value.trim() : "";
    var note = $("#cNote").value.trim();
    var dine = method === "Uống tại quán";
    var tbl = dine && $("#cTable") ? Tables.norm($("#cTable").value) : "";
    if (!isOpen()) { alert("Quán đang nghỉ, bạn quay lại sau nhé!"); return; }
    if (!name) { alert("Bạn vui lòng nhập tên."); $("#cName").focus(); return; }
    if (digits(phone).length < 9) { alert("Số điện thoại chưa đúng."); $("#cPhone").focus(); return; }
    if (method.indexOf("Giao") === 0 && !addr) { alert("Bạn vui lòng nhập địa chỉ giao hàng."); $("#cAddr").focus(); return; }
    var lines = cartLines();
    if (!lines.length) return;
    var t = cartTotals();
    var code = Math.random().toString(36).slice(2, 6).toUpperCase();
    var order = {
      code: code, source: "web", status: "new", createdAt: Date.now(),
      customer: { name: name, phone: phone }, method: method, address: method.indexOf("Giao") === 0 ? addr : "",
      note: note, total: t.total,
      items: lines.map(function (l) { var it = { id: l.id, name: l.name, price: l.price, qty: l.qty, sugar: l.sugar, ice: l.ice }; if (l.size) it.size = l.size; return it; })
    };
    if (dine && tbl) { order.table = tbl; order.billStatus = "open"; }
    checkoutInfo = { name: name, phone: phone, method: method, address: addr, table: tbl, tableAt: tbl ? Date.now() : 0 }; saveInfo();
    var btn = document.querySelector('[data-act="submit"]'); btn.disabled = true; btn.textContent = "Đang gửi…";
    function send() {
    return Store.addOrder(order).then(function () {
      pushNotify(order);
      cart = {}; saveCart();
      $("#cartBody").setAttribute("data-view", "done");
      if (dine && tbl) {
        $("#cartBody").innerHTML = '<button class="x" data-act="close">✕</button><div class="success"><div class="big">🎉</div><h2>Đã ghi vào ' + esc(Tables.label(tbl)) + "</h2>" +
          "<p>Mã đơn <b>" + esc(code) + "</b> · " + money(t.total) + "<br>Bạn cứ dùng xong rồi thanh toán, nhân viên sẽ tính tiền theo số bàn.<br>Muốn gọi thêm, cứ đặt tiếp và nhập lại đúng <b>" + esc(Tables.label(tbl)) + "</b> nhé.</p>" +
          '<button class="btn block" data-act="close">Đóng</button></div>';
      } else {
        $("#cartBody").innerHTML = '<button class="x" data-act="close">✕</button><div class="success"><div class="big">🎉</div><h2>Đặt món thành công!</h2>' +
          "<p>Mã đơn <b>" + esc(code) + "</b> · " + money(t.total) + "<br>Quán sẽ liên hệ bạn qua số <b>" + esc(phone) + "</b>.</p>" +
          '<div id="payHost"></div>' +
          '<button class="btn block" data-act="close">Đóng</button></div>';
        mountPay(code, t.total);
        try { localStorage.setItem("tra_last", JSON.stringify({ code: code, total: t.total, at: Date.now() })); } catch (e) {}
        renderLastPay();
      }
      renderMenu(); renderCartBar();
    });
    }
    function fail(e) {
      console.error(e);
      var b2 = document.querySelector('[data-act="submit"]');
      if (b2) { b2.disabled = false; b2.textContent = "Hoàn tất đặt món"; }
      renderCart();
      alert("Chưa gửi được đơn, bạn thử lại hoặc gọi trực tiếp cho quán nhé.");
    }
    if (!(dine && tbl)) { send().catch(fail); return; }
    /* Uống tại quán có số bàn: bàn phải được nhân viên/chủ quán mở trước */
    Store.isTableOpen(tbl).then(function (open) {
      if (open) return send();
      return askOpenTable(tbl, name, send);
    }).catch(fail);
  }

  /* ---------- Xin mở bàn ---------- */
  var reqUnsub = null, reqSend = null;
  function stopReq() { if (reqUnsub) { reqUnsub(); reqUnsub = null; } }
  function askOpenTable(tbl, name, send) {
    reqSend = send;
    var fired = false;
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem("tra_req") || "null"); } catch (e) {}
    var reuse = saved && saved.table === tbl && Date.now() - saved.at < 10 * 60 * 1000;
    var get = reuse ? Promise.resolve(saved.id) : Store.requestTable({ table: tbl, status: "pending", createdAt: Date.now(), name: name.slice(0, 40) }).then(function (id) {
      try { localStorage.setItem("tra_req", JSON.stringify({ id: id, table: tbl, at: Date.now() })); } catch (e) {}
      pushTableReq(tbl, name);
      return id;
    });
    return get.then(function (id) {
      $("#cartBody").setAttribute("data-view", "req");
      stopReq();
      reqUnsub = Store.watchRequest(id, function (r) {
        if ($("#cartBody").getAttribute("data-view") !== "req") return;
        var head = '<button class="x" data-act="reqclose">✕</button>';
        if (!r || r.status === "pending") {
          $("#cartBody").innerHTML = head + '<div class="success"><div class="big">⏳</div><h2>Đang chờ mở ' + esc(Tables.label(tbl)) + "</h2>" +
            "<p>" + esc(Tables.label(tbl)) + " chưa được mở nên quán cần xác nhận bạn đang ngồi bàn này. Đã gửi yêu cầu cho nhân viên, bạn giữ trang này mở nhé.<br>Món bạn chọn vẫn được giữ lại.</p>" +
            '<button class="btn ghost block" data-act="reqcancel">Đổi số bàn / để trống bàn</button></div>';
        } else if (r.status === "approved") {
          stopReq();
          if (fired) return; fired = true;
          try { localStorage.removeItem("tra_req"); } catch (e) {}
          $("#cartBody").innerHTML = head + '<div class="success"><div class="big">✅</div><h2>' + esc(Tables.label(tbl)) + " đã được mở</h2><p>Đang gửi món cho quán…</p></div>";
          send().catch(function () {
            fired = false;
            $("#cartBody").innerHTML = head + '<div class="success"><div class="big">⚠️</div><h2>Chưa gửi được món</h2><p>Bạn bấm thử lại nhé.</p><button class="btn block" data-act="reqsend">Gửi lại</button></div>';
          });
        } else {
          stopReq();
          try { localStorage.removeItem("tra_req"); } catch (e) {}
          cart = {}; saveCart(); renderMenu(); renderCartBar();
          $("#cartBody").innerHTML = head + '<div class="success"><div class="big">🙏</div><h2>Đơn đã được huỷ</h2>' +
            "<p>Quán chưa mở " + esc(Tables.label(tbl)) + " nên đơn của bạn không được gửi đi. Bạn kiểm tra lại số bàn hoặc gọi nhân viên giúp nhé.</p>" +
            '<button class="btn block" data-act="close">Đóng</button></div>';
        }
      });
    });
  }
  function pushTableReq(tbl, name) {
    var topic = String(window.NTFY_TOPIC || "").trim();
    if (!topic) return;
    try {
      fetch("https://ntfy.sh", { method: "POST", body: JSON.stringify({
        topic: topic, title: "🪑 Khách xin mở " + Tables.label(tbl), message: (name || "Khách") + " đang chờ nhân viên xác nhận mở bàn.",
        priority: 5, tags: ["bell"], click: new URL("staff.html", location.href).href
      }) }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- Sự kiện ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act],[data-cat],#openCart,#lastPay");
    if (!el) return;
    if (el.id === "lastPay") {
      var l = loadLast(); if (!l) return;
      $("#cartBody").setAttribute("data-view", "pay");
      $("#cartBody").innerHTML = '<button class="x" data-act="close">✕</button><h2>Thanh toán đơn #' + esc(l.code) + '</h2><div id="payHost"></div><button class="btn block" data-act="close">Đóng</button>';
      mountPay(l.code, l.total); $("#cartDlg").showModal(); return;
    }
    if (el.id === "openCart") { renderCart(); $("#cartDlg").showModal(); return; }
    if (el.hasAttribute("data-cat")) { activeCat = el.getAttribute("data-cat"); renderMenu(); return; }
    var act = el.getAttribute("data-act"), id = el.getAttribute("data-id");
    if (act === "inc" && isOpen()) {
      var it = Tables.findVariant(shop.menu, id); if (!it || it.item.available === false) return;
      if (!cart[id]) cart[id] = { qty: 0, sugar: "100%", ice: "Đá bình thường" };
      cart[id].qty = Math.min(99, cart[id].qty + 1);
      saveCart(); renderMenu(); renderCartBar();
    } else if (act === "dec") {
      if (cart[id]) { cart[id].qty--; if (cart[id].qty <= 0) delete cart[id]; }
      saveCart(); renderMenu(); renderCartBar();
    } else if (act === "close") { $("#cartDlg").close(); }
    else if (act === "submit") { submitOrder(); }
    else if (act === "reqsend") {
      el.disabled = true; el.textContent = "Đang gửi…";
      var fn = reqSend; if (fn) fn().catch(function () { alert("Chưa gửi được đơn, bạn thử lại nhé."); renderCart(); });
    }
    else if (act === "reqcancel") { stopReq(); try { localStorage.removeItem("tra_req"); } catch (x) {} renderCart(); }
    else if (act === "reqclose") { stopReq(); $("#cartDlg").close(); }
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "cMethod") {
      $("#addrBox").classList.toggle("hidden", t.value.indexOf("Giao") !== 0);
      $("#tableBox").classList.toggle("hidden", t.value !== "Uống tại quán");
    } else if (t.matches && t.matches('.line select')) {
      var id = t.closest(".line").getAttribute("data-id");
      if (cart[id]) { cart[id][t.getAttribute("data-f")] = t.value; saveCart(); }
    }
  });
  $("#cartDlg").addEventListener("click", function (e) { if (e.target === this) this.close(); });

  /* ---------- Khởi động: nghe dữ liệu quán theo thời gian thực ---------- */
  Store.subscribeSoldOut(function (list) { Tables.setOff(list); if (shop) { syncCart(); renderAll(); } });
  Store.subscribeShop(function (s) {
    shop = s;
    syncCart();
    renderAll();
  });
})();
