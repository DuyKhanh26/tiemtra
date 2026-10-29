/* ============================================================
 *  THÔNG TIN NHẬN TIỀN — nhập tay tại đây rồi lưu file
 * ============================================================
 *  Sau khi khách bấm "Hoàn tất đặt món", web tự tạo mã QR chuyển khoản
 *  (chuẩn VietQR) đã điền sẵn: ngân hàng, số tài khoản, SỐ TIỀN của đơn
 *  và NỘI DUNG = tiền tố + mã đơn. Khách quét là xong, không phải gõ gì.
 *
 *  Để trống bankBin hoặc accountNo thì web KHÔNG hiện phần thanh toán.
 *
 *  Mã BIN một số ngân hàng (kiểm tra lại BIN của ngân hàng bạn tại
 *  https://api.vietqr.io/v2/banks  → trường "bin"):
 *    Vietcombank 970436 · VietinBank 970415 · BIDV 970418 · Agribank 970405
 *    MB Bank 970422 · Techcombank 970407 · ACB 970416 · VPBank 970432
 *    TPBank 970423 · Sacombank 970403 · HDBank 970437 · VIB 970441
 *    SHB 970443 · OCB 970448 · MSB 970426 · SeABank 970440
 *    Eximbank 970431 · LPBank 970449 · SCB 970429 · Nam A Bank 970428
 *    Bac A Bank 970409 · ABBANK 970425 · PVcomBank 970412 · NCB 970419
 * ============================================================ */
window.BANK = {
  bankBin: "",                 // mã BIN 6 số của ngân hàng, ví dụ "970436"
  bankName: "",                // tên hiển thị cho khách, ví dụ "Vietcombank"
  accountNo: "",               // số tài khoản, ví dụ "0123456789"
  accountName: "",             // tên chủ tài khoản VIẾT HOA không dấu, ví dụ "NGUYEN VAN A"
  notePrefix: "DH ",           // chữ đứng trước mã đơn trong nội dung CK → "DH A3F9"
  qrMode: "local"              // "local": web tự tạo QR (khuyên dùng, không phụ thuộc ai)
                               // "vietqr": dùng ảnh QR của img.vietqr.io (dự phòng nếu "local" không quét được)
};
