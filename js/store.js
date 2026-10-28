/* Lớp dữ liệu dùng chung cho trang khách và trang chủ quán.
 * - Có FIREBASE_CONFIG  -> dùng Firebase Auth + Firestore (đồng bộ thật giữa mọi thiết bị)
 * - Không có            -> chế độ demo bằng localStorage */
(function () {
  "use strict";

  var OWNER = (window.OWNER_EMAIL || "").toLowerCase();
  var cfg = window.FIREBASE_CONFIG;
  var useFirebase = !!(cfg && cfg.apiKey && window.firebase);

  var DEFAULT_SHOP = {
    name: "Tiệm trà của bạn",
    tagline: "Trà trái cây · Trà sữa · Sữa chua",
    notice: "",
    address: "Số nhà, đường, phường, quận/huyện, tỉnh/thành",
    phone: "0900000000",
    hours: "08:00 – 21:00 mỗi ngày",
    isOpen: true,
    closedNote: "Quán đang nghỉ, hẹn gặp lại bạn sớm nhé!",
    payNote: "",
    menu: [
      { id: "m1", name: "Trà đào cam sả", price: 35000, cat: "Trà trái cây", icon: "🍑", desc: "Trà đào thơm, cam tươi, sả", available: true },
      { id: "m2", name: "Trà vải hoa hồng", price: 35000, cat: "Trà trái cây", icon: "🌹", desc: "Vị vải ngọt nhẹ, thoang thoảng hoa hồng", available: true },
      { id: "m3", name: "Trà Yaki matcha", price: 35000, cat: "Trà Yaki", icon: "🍵", desc: "Matcha đậm vị, béo nhẹ", available: true },
      { id: "m4", name: "Sữa chua dâu", price: 35000, cat: "Sữa chua", icon: "🍓", desc: "Sữa chua dẻo mịn với dâu tươi", available: true }
    ]
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function withDefaults(d) {
    var base = clone(DEFAULT_SHOP);
    if (!d) return base;
    for (var k in d) { if (d[k] !== undefined) base[k] = d[k]; }
    if (!Array.isArray(base.menu)) base.menu = [];
    return base;
  }

  var impl;

  if (useFirebase) {
    firebase.initializeApp(cfg);
    var db = firebase.firestore();
    var auth = firebase.auth();
    impl = {
      mode: "firebase",
      subscribeShop: function (cb) {
        return db.doc("shop/main").onSnapshot(
          function (s) { cb(withDefaults(s.exists ? s.data() : null)); },
          function () { cb(withDefaults(null)); }
        );
      },
      saveShop: function (d) {
        var data = clone(d); data.updatedAt = Date.now();
        return db.doc("shop/main").set(data);
      },
      addOrder: function (o) { return db.collection("orders").add(o); },
      subscribeOrders: function (cb) {
        return db.collection("orders").orderBy("createdAt", "desc").limit(2000).onSnapshot(
          function (sn) { cb(sn.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; })); },
          function (e) { console.error(e); }
        );
      },
      updateOrder: function (id, patch) { return db.collection("orders").doc(id).update(patch); },
      deleteOrder: function (id) { return db.collection("orders").doc(id).delete(); },
      onAuth: function (cb) {
        return auth.onAuthStateChanged(function (u) {
          cb(u ? { email: u.email || "", verified: !!u.emailVerified } : null);
        });
      },
      login: function () {
        var p = new firebase.auth.GoogleAuthProvider();
        return auth.signInWithPopup(p);
      },
      logout: function () { return auth.signOut(); }
    };
  } else {
    /* ---------- Chế độ demo: localStorage ---------- */
    var bus = new EventTarget();
    var read = function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
    var write = function (k, v) { localStorage.setItem(k, JSON.stringify(v)); bus.dispatchEvent(new Event(k)); };
    var sub = function (k, getter, cb) {
      var f = function () { cb(getter()); };
      var g = function (e) { if (e.key === k) f(); };
      bus.addEventListener(k, f);
      window.addEventListener("storage", g);
      f();
      return function () { bus.removeEventListener(k, f); window.removeEventListener("storage", g); };
    };
    impl = {
      mode: "demo",
      subscribeShop: function (cb) { return sub("tra_shop", function () { return withDefaults(read("tra_shop", null)); }, cb); },
      saveShop: function (d) { var data = clone(d); data.updatedAt = Date.now(); write("tra_shop", data); return Promise.resolve(); },
      addOrder: function (o) {
        var list = read("tra_orders", []); var x = clone(o);
        x.id = "o" + Date.now() + Math.random().toString(36).slice(2, 6);
        list.unshift(x); write("tra_orders", list); return Promise.resolve();
      },
      subscribeOrders: function (cb) {
        return sub("tra_orders", function () { return read("tra_orders", []).sort(function (a, b) { return b.createdAt - a.createdAt; }); }, cb);
      },
      updateOrder: function (id, patch) {
        var list = read("tra_orders", []);
        list.forEach(function (o) { if (o.id === id) Object.assign(o, patch); });
        write("tra_orders", list); return Promise.resolve();
      },
      deleteOrder: function (id) {
        write("tra_orders", read("tra_orders", []).filter(function (o) { return o.id !== id; }));
        return Promise.resolve();
      },
      onAuth: function (cb) { return sub("tra_user", function () { return read("tra_user", null); }, cb); },
      login: function () {
        var e = prompt("CHẾ ĐỘ DEMO — nhập email chủ quán để vào:");
        if (!e) return Promise.resolve();
        write("tra_user", { email: e.trim(), verified: true });
        return Promise.resolve();
      },
      logout: function () { write("tra_user", null); return Promise.resolve(); }
    };
  }

  impl.OWNER = OWNER;
  impl.DEFAULT_SHOP = DEFAULT_SHOP;
  window.Store = impl;
})();
