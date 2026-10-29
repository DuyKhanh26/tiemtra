/* Tạo mã QR chuyển khoản VietQR cho từng đơn: đã gồm ngân hàng, số tài khoản, số tiền, nội dung = mã đơn */
(function () {
  "use strict";
  var B = window.BANK || {};
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var money = function (n) { return (Number(n) || 0).toLocaleString("vi-VN") + "đ"; };

  function enabled() {
    return /^\d{6}$/.test(String(B.bankBin || "").trim()) && /^[0-9A-Za-z]{4,25}$/.test(String(B.accountNo || "").trim());
  }
  function clean(str, max) {
    var s = String(str || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
    s = s.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    return s.slice(0, max);
  }
  function tlv(id, v) { var l = String(v.length); if (l.length < 2) l = "0" + l; return id + l + v; }
  function crc16(s) {   // CRC-16/CCITT-FALSE
    var c = 0xFFFF;
    for (var i = 0; i < s.length; i++) {
      c ^= s.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) : (c << 1);
      c &= 0xFFFF;
    }
    return ("000" + c.toString(16).toUpperCase()).slice(-4);
  }
  function contentFor(code) { return clean(String(B.notePrefix == null ? "DH " : B.notePrefix) + code, 25); }

  function payload(amount, content) {
    var bank = tlv("00", String(B.bankBin).trim()) + tlv("01", String(B.accountNo).trim());
    var merchant = tlv("00", "A000000727") + tlv("01", bank) + tlv("02", "QRIBFTTA");
    var amt = Math.round(Number(amount) || 0);
    var s = tlv("00", "01") + tlv("01", amt > 0 ? "12" : "11") + tlv("38", merchant) + tlv("53", "704");
    if (amt > 0) s += tlv("54", String(amt));
    s += tlv("58", "VN");
    if (content) s += tlv("62", tlv("08", content));
    s += "6304";
    return s + crc16(s);
  }

  function drawCanvas(text) {
    var q = new window.QRLib(-1, window.QRLevel.M); q.addData(text); q.make();
    var n = q.getModuleCount(), quiet = 4, cell = Math.max(4, Math.ceil(560 / (n + quiet * 2)));
    var size = (n + quiet * 2) * cell;
    var cv = document.createElement("canvas"); cv.width = cv.height = size;
    var c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, size, size); c.fillStyle = "#000";
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
    cv.style.cssText = "width:min(100%,280px);height:auto;display:block;margin:0 auto;border-radius:12px;image-rendering:pixelated";
    cv.setAttribute("aria-label", "Mã QR chuyển khoản");
    return cv;
  }

  function row(label, value, copy) {
    return '<div class="prow"><span>' + label + "</span><b>" + esc(value) + "</b>" +
      (copy ? '<button type="button" class="btn ghost sm" data-copy="' + esc(copy) + '">Chép</button>' : "") + "</div>";
  }

  function render(host, code, total) {
    host.innerHTML = "";
    if (!enabled()) return;
    var content = contentFor(code);
    var html = '<div class="paybox qr"><b>Chuyển khoản bằng mã QR</b><div class="qrwrap"></div>' +
      '<div class="prows">' +
      (B.bankName ? row("Ngân hàng", B.bankName) : "") +
      row("Số tài khoản", B.accountNo, B.accountNo) +
      (B.accountName ? row("Chủ tài khoản", B.accountName) : "") +
      row("Số tiền", money(total), String(Math.round(total))) +
      row("Nội dung", content, content) + "</div>" +
      '<a class="btn ghost sm dl" target="_blank" rel="noopener">⬇ Lưu ảnh QR</a>' +
      '<div class="hint">Quét bằng app ngân hàng: số tài khoản, số tiền và nội dung đã điền sẵn. ' +
      "Đang dùng chính điện thoại này? Bấm “Lưu ảnh QR”, mở app ngân hàng → Quét QR → chọn ảnh từ thư viện.</div></div>";
    host.innerHTML = html;
    var wrap = host.querySelector(".qrwrap"), dl = host.querySelector(".dl");
    if (String(B.qrMode) === "vietqr") {
      var url = "https://img.vietqr.io/image/" + encodeURIComponent(String(B.bankBin).trim()) + "-" + encodeURIComponent(String(B.accountNo).trim()) +
        "-compact2.png?amount=" + Math.round(total) + "&addInfo=" + encodeURIComponent(content) +
        (B.accountName ? "&accountName=" + encodeURIComponent(B.accountName) : "");
      wrap.innerHTML = '<img alt="Mã QR chuyển khoản" style="width:min(100%,300px);display:block;margin:0 auto;border-radius:12px;background:#fff">';
      wrap.firstChild.src = url; dl.href = url; dl.textContent = "Mở ảnh QR";
    } else if (window.QRLib) {
      var cv = drawCanvas(payload(total, content));
      wrap.appendChild(cv);
      dl.href = cv.toDataURL("image/png"); dl.setAttribute("download", "qr-" + content.replace(/ /g, "-") + ".png"); dl.removeAttribute("target");
    } else wrap.textContent = "Chưa tạo được mã QR, vui lòng chuyển khoản theo thông tin bên dưới.";
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-copy]");
    if (!b) return;
    var t = b.getAttribute("data-copy"), old = b.textContent;
    var ok = function () { b.textContent = "Đã chép ✓"; setTimeout(function () { b.textContent = old; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function () {});
    else { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch (x) {} ta.remove(); }
  });

  window.Pay = { enabled: enabled, render: render, payload: payload, crc16: crc16, contentFor: contentFor };
})();
