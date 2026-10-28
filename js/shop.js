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

  var SUGAR = ["100%", "70%", "50%", "30%", "0%"];
  var ICE = ["Đá bình thường", "Ít đá", "Đá riêng", "Không đá"];

  var shop = null;
  var cart = loadCart();      // { itemId: {qty, sugar, ice} }
  var activeCat = "Tất cả";
  var checkoutInfo = loadInfo();

  function loadCart() { try { return JSON.parse(localStorage.getItem("tra_cart") || "{}"); } catch (e) { return {}; } }
  function saveCart() { try { localStorage.setItem("tra_cart", JSON.stringify(cart)); } catch (e) {} }
  function loadInfo() { try { return JSON.parse(localStorage.getItem("tra_info") || "{}"); } catch (e) { return {}; } }
  function saveInfo() { try { localStorage.setItem("tra_info", JSON.stringify(checkoutInfo)); } catch (e) {} }

  function isOpen() { return shop && shop.isOpen !== false; }
  function itemById(id) { return (shop.menu || []).filter(function (m) { return m.id === id; })[0]; }

  /* Đồng bộ giỏ hàng với thực đơn mới nhất (đổi giá, hết món, xoá món…) */
  function syncCart() {
    Object.keys(cart).forEach(function (id) {
      var it = itemById(id);
      if (!it || it.available === false || !(cart[id].qty > 0)) delete cart[id];
    });
    saveCart();
  }
  function cartLines() {
    return Object.keys(cart).map(function (id) {
      var it = itemById(id), c = cart[id];
      return { id: id, name: it.name, price: Number(it.price) || 0, qty: c.qty, sugar: c.sugar, ice: c.ice };
    });
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
    menu.forEach(function (m) { var c = (m.cat || "").trim(); if (c && cats.indexOf(c) < 0) cats.push(c); });
    if (cats.indexOf(activeCat) < 0) activeCat = "Tất cả";
    $("#cats").innerHTML = cats.length > 2 ? cats.map(function (c) {
      return '<button class="cat' + (c === activeCat ? " on" : "") + '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("") : "";

    var list = menu.filter(function (m) { return activeCat === "Tất cả" || (m.cat || "").trim() === activeCat; });
    if (!list.length) { $("#menu").innerHTML = '<div class="empty">Chưa có món nào 🍃</div>'; return; }
    $("#menu").innerHTML = list.map(function (m) {
      var off = m.available === false;
      var q = cart[m.id] ? cart[m.id].qty : 0;
      var ctl;
      if (off) ctl = '<span class="tag-off">Tạm hết</span>';
      else if (!isOpen()) ctl = "";
      else ctl = '<div class="qty">' +
        (q > 0 ? '<button class="minus" data-act="dec" data-id="' + esc(m.id) + '" aria-label="Bớt">−</button><span>' + q + "</span>" : "") +
        '<button data-act="inc" data-id="' + esc(m.id) + '" aria-label="Thêm">+</button></div>';
      return '<article class="item' + (off ? " off" : "") + '">' +
        '<div class="ico">' + iconHtml(m.icon) + "</div>" +
        '<div class="meta"><div class="nm">' + esc(m.name) + "</div>" +
        (m.desc ? '<div class="ds">' + esc(m.desc) + "</div>" : "") +
        '<div class="pr">' + money(m.price) + "</div></div>" + ctl + "</article>";
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
    renderHeader(); renderMenu(); renderCartBar();
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
    var m = checkoutInfo.method || "Mang đi";
    body.innerHTML =
      '<button class="x" data-act="close">✕</button><h2>Đơn của bạn</h2>' +
      lines.map(function (l) {
        return '<div class="line" data-id="' + esc(l.id) + '"><div class="t"><span>' + esc(l.name) + " × " + l.qty + "</span><span>" + money(l.price * l.qty) + "</span></div>" +
          '<div class="opts"><select data-f="sugar" aria-label="Đường">' + SUGAR.map(function (s) { return "<option" + (s === l.sugar ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select>" +
          '<select data-f="ice" aria-label="Đá">' + opt(ICE, l.ice) + "</select></div></div>";
      }).join("") +
      '<div class="total"><span>Tổng cộng</span><span>' + money(t.total) + "</span></div>" +
      '<label class="f">Tên của bạn *</label><input id="cName" autocomplete="name" value="' + esc(checkoutInfo.name || "") + '" placeholder="Nguyễn Văn A">' +
      '<label class="f">Số điện thoại *</label><input id="cPhone" type="tel" autocomplete="tel" value="' + esc(checkoutInfo.phone || "") + '" placeholder="09xx xxx xxx">' +
      '<label class="f">Hình thức nhận</label><select id="cMethod">' + opt(["Mang đi", "Uống tại quán", "Giao hàng (Đảm bảo bạn đã gọi và quán đã đồng ý)"], m) + "</select>" +
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
          message: text + " (" + order.method + ")",
          priority: 5,
          tags: ["bell"],
          click: new URL("admin.html", location.href).href
        })
      }).catch(function () {});
    } catch (e) {}
  }

  function submitOrder() {
    var name = $("#cName").value.trim();
    var phone = $("#cPhone").value.trim();
    var method = $("#cMethod").value;
    var addr = $("#cAddr") ? $("#cAddr").value.trim() : "";
    var note = $("#cNote").value.trim();
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
      items: lines.map(function (l) { return { id: l.id, name: l.name, price: l.price, qty: l.qty, sugar: l.sugar, ice: l.ice }; })
    };
    checkoutInfo = { name: name, phone: phone, method: method, address: addr }; saveInfo();
    var btn = document.querySelector('[data-act="submit"]'); btn.disabled = true; btn.textContent = "Đang gửi…";
    Store.addOrder(order).then(function () {
      pushNotify(order);
      cart = {}; saveCart();
      $("#cartBody").setAttribute("data-view", "done");
      $("#cartBody").innerHTML = '<button class="x" data-act="close">✕</button><div class="success"><div class="big">🎉</div><h2>Đặt món thành công!</h2>' +
        "<p>Mã đơn <b>" + esc(code) + "</b> · " + money(t.total) + "<br>Quán sẽ liên hệ bạn qua số <b>" + esc(phone) + "</b>.</p>" +
        (shop.payNote ? '<div class="paybox">' + esc(shop.payNote) + "</div>" : "") +
        '<button class="btn block" data-act="close">Đóng</button></div>';
      renderMenu(); renderCartBar();
    }).catch(function (e) {
      console.error(e);
      btn.disabled = false; btn.textContent = "Hoàn tất đặt món";
      alert("Chưa gửi được đơn, bạn thử lại hoặc gọi trực tiếp cho quán nhé.");
    });
  }

  /* ---------- Sự kiện ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act],[data-cat],#openCart");
    if (!el) return;
    if (el.id === "openCart") { renderCart(); $("#cartDlg").showModal(); return; }
    if (el.hasAttribute("data-cat")) { activeCat = el.getAttribute("data-cat"); renderMenu(); return; }
    var act = el.getAttribute("data-act"), id = el.getAttribute("data-id");
    if (act === "inc" && isOpen()) {
      var it = itemById(id); if (!it || it.available === false) return;
      if (!cart[id]) cart[id] = { qty: 0, sugar: "100%", ice: "Đá bình thường" };
      cart[id].qty = Math.min(99, cart[id].qty + 1);
      saveCart(); renderMenu(); renderCartBar();
    } else if (act === "dec") {
      if (cart[id]) { cart[id].qty--; if (cart[id].qty <= 0) delete cart[id]; }
      saveCart(); renderMenu(); renderCartBar();
    } else if (act === "close") { $("#cartDlg").close(); }
    else if (act === "submit") { submitOrder(); }
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "cMethod") {
      $("#addrBox").classList.toggle("hidden", t.value.indexOf("Giao") !== 0);
    } else if (t.matches && t.matches('.line select')) {
      var id = t.closest(".line").getAttribute("data-id");
      if (cart[id]) { cart[id][t.getAttribute("data-f")] = t.value; saveCart(); }
    }
  });
  $("#cartDlg").addEventListener("click", function (e) { if (e.target === this) this.close(); });

  /* ---------- Khởi động: nghe dữ liệu quán theo thời gian thực ---------- */
  Store.subscribeShop(function (s) {
    shop = s;
    syncCart();
    renderAll();
  });
})();
