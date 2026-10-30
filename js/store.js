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
    menu: [
      { id: "m1", name: "Trà đào cam sả", price: 35000, priceM: 35000, priceL: 42000, best: true, cat: "Trà trái cây", icon: "🍑", desc: "Trà đào thơm, cam tươi, sả", available: true },
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
      subscribeOrdersSince: function (since, cb) {
        return db.collection("orders").where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(500).onSnapshot(
          function (sn) { cb(sn.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; })); },
          function (e) { console.error(e); }
        );
      },
      subscribeStaff: function (cb) {
        return db.collection("staff").onSnapshot(
          function (sn) { cb(sn.docs.map(function (d) { var x = d.data(); x.email = (x.email || d.id).toLowerCase(); return x; })); },
          function (e) { console.error(e); }
        );
      },
      addStaff: function (email, name) {
        email = String(email).trim().toLowerCase();
        return db.doc("staff/" + email).set({ email: email, name: name || "", addedAt: Date.now() });
      },
      removeStaff: function (email) { return db.doc("staff/" + String(email).trim().toLowerCase()).delete(); },
      isStaff: function (email) {
        return db.doc("staff/" + String(email).trim().toLowerCase()).get().then(function (s) { return s.exists; });
      },
      isOwner: function (email) {
        email = String(email).trim().toLowerCase();
        if (email === OWNER) return Promise.resolve(true);
        return db.doc("owners/" + email).get().then(function (s) { return s.exists; }).catch(function () { return false; });
      },
      subscribeOwners: function (cb) {
        return db.collection("owners").onSnapshot(
          function (sn) { cb(sn.docs.map(function (d) { var x = d.data(); x.email = (x.email || d.id).toLowerCase(); return x; })); },
          function (e) { console.error(e); }
        );
      },
      addOwner: function (email, name) {
        email = String(email).trim().toLowerCase();
        return db.doc("owners/" + email).set({ email: email, name: name || "", addedAt: Date.now() });
      },
      removeOwner: function (email) { return db.doc("owners/" + String(email).trim().toLowerCase()).delete(); },
      subscribeOrders: function (cb) {
        return db.collection("orders").orderBy("createdAt", "desc").limit(2000).onSnapshot(
          function (sn) { cb(sn.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; })); },
          function (e) { console.error(e); }
        );
      },
      updateOrder: function (id, patch) { return db.collection("orders").doc(id).update(patch); },
      updateOrders: function (ids, patch) {
        var chunks = []; for (var i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
        return chunks.reduce(function (p, ch) {
          return p.then(function () {
            var b = db.batch(); ch.forEach(function (id) { b.update(db.collection("orders").doc(id), patch); }); return b.commit();
          });
        }, Promise.resolve());
      },
      deleteOrder: function (id) { return db.collection("orders").doc(id).delete(); },
      /* Mở bàn: bàn chỉ nhận món từ khách khi có tài liệu openTables/<số bàn> */
      isTableOpen: function (t) { return db.doc("openTables/" + t).get().then(function (s) { return s.exists; }); },
      openTable: function (t, by) { return db.doc("openTables/" + t).set({ table: t, openedAt: Date.now(), openedBy: by || "" }); },
      closeTable: function (t) { return db.doc("openTables/" + t).delete(); },
      requestTable: function (r) { return db.collection("tableRequests").add(r).then(function (d) { return d.id; }); },
      watchRequest: function (id, cb) {
        return db.doc("tableRequests/" + id).onSnapshot(function (s) { cb(s.exists ? s.data() : null); }, function () {});
      },
      subscribeRequests: function (cb) {
        return db.collection("tableRequests").where("status", "==", "pending").onSnapshot(
          function (sn) { cb(sn.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }).sort(function (a, b) { return a.createdAt - b.createdAt; })); },
          function (e) { console.error(e); }
        );
      },
      answerRequest: function (r, ok, by) {
        var p = ok ? db.doc("openTables/" + r.table).set({ table: r.table, openedAt: Date.now(), openedBy: by || "" }) : Promise.resolve();
        return p.then(function () { return db.doc("tableRequests/" + r.id).update({ status: ok ? "approved" : "rejected", handledBy: by || "", handledAt: Date.now() }); });
      },
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
      subscribeOrdersSince: function (since, cb) {
        return sub("tra_orders", function () { return read("tra_orders", []).filter(function (o) { return (o.createdAt || 0) >= since; }).sort(function (a, b) { return b.createdAt - a.createdAt; }); }, cb);
      },
      subscribeStaff: function (cb) { return sub("tra_staff", function () { return read("tra_staff", []); }, cb); },
      addStaff: function (email, name) {
        email = String(email).trim().toLowerCase();
        var l = read("tra_staff", []).filter(function (x) { return x.email !== email; });
        l.push({ email: email, name: name || "", addedAt: Date.now() }); write("tra_staff", l); return Promise.resolve();
      },
      removeStaff: function (email) {
        email = String(email).trim().toLowerCase();
        write("tra_staff", read("tra_staff", []).filter(function (x) { return x.email !== email; })); return Promise.resolve();
      },
      isStaff: function (email) {
        email = String(email).trim().toLowerCase();
        return Promise.resolve(read("tra_staff", []).some(function (x) { return x.email === email; }));
      },
      isOwner: function (email) {
        email = String(email).trim().toLowerCase();
        return Promise.resolve(email === OWNER || read("tra_owners", []).some(function (x) { return x.email === email; }));
      },
      subscribeOwners: function (cb) { return sub("tra_owners", function () { return read("tra_owners", []); }, cb); },
      addOwner: function (email, name) {
        email = String(email).trim().toLowerCase();
        var l = read("tra_owners", []).filter(function (x) { return x.email !== email; });
        l.push({ email: email, name: name || "", addedAt: Date.now() }); write("tra_owners", l); return Promise.resolve();
      },
      removeOwner: function (email) {
        email = String(email).trim().toLowerCase();
        write("tra_owners", read("tra_owners", []).filter(function (x) { return x.email !== email; })); return Promise.resolve();
      },
      subscribeOrders: function (cb) {
        return sub("tra_orders", function () { return read("tra_orders", []).sort(function (a, b) { return b.createdAt - a.createdAt; }); }, cb);
      },
      updateOrders: function (ids, patch) {
        var list = read("tra_orders", []);
        list.forEach(function (o) { if (ids.indexOf(o.id) >= 0) Object.assign(o, patch); });
        write("tra_orders", list); return Promise.resolve();
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
      isTableOpen: function (t) { return Promise.resolve(!!read("tra_open", {})[t]); },
      openTable: function (t, by) { var m = read("tra_open", {}); m[t] = { table: t, openedAt: Date.now(), openedBy: by || "" }; write("tra_open", m); return Promise.resolve(); },
      closeTable: function (t) { var m = read("tra_open", {}); delete m[t]; write("tra_open", m); return Promise.resolve(); },
      requestTable: function (r) {
        var l = read("tra_requests", []), x = clone(r); x.id = "r" + Date.now() + Math.random().toString(36).slice(2, 6);
        l.push(x); write("tra_requests", l); return Promise.resolve(x.id);
      },
      watchRequest: function (id, cb) {
        return sub("tra_requests", function () { return read("tra_requests", []).filter(function (r) { return r.id === id; })[0] || null; }, cb);
      },
      subscribeRequests: function (cb) {
        return sub("tra_requests", function () { return read("tra_requests", []).filter(function (r) { return r.status === "pending"; }); }, cb);
      },
      answerRequest: function (r, ok, by) {
        if (ok) { var m = read("tra_open", {}); m[r.table] = { table: r.table, openedAt: Date.now(), openedBy: by || "" }; write("tra_open", m); }
        var l = read("tra_requests", []);
        l.forEach(function (x) { if (x.id === r.id) { x.status = ok ? "approved" : "rejected"; x.handledBy = by || ""; x.handledAt = Date.now(); } });
        write("tra_requests", l); return Promise.resolve();
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
