# Web bán trà — trang khách + trang chủ quán

Web tĩnh (HTML/CSS/JS thuần), chạy được trên **GitHub Pages**. Dữ liệu dùng **Firebase** (miễn phí) để khi chủ quán bấm *Lưu* thì trang khách cập nhật ngay trên mọi thiết bị.

- `index.html` — trang khách (không cần đăng nhập): xem thực đơn, chọn món, chọn đường/đá, đặt món.
- `admin.html` — trang chủ quán (đăng nhập Google bằng `duykhanh2605.pq@gmail.com`):
  - Bật/tắt **Quán đang bán / Quán đang nghỉ**
  - Sửa tên quán, địa chỉ, số điện thoại, giờ mở cửa, thông báo
  - Thêm/sửa/xoá/sắp xếp món, đổi giá, đánh dấu *Còn bán / Tạm hết*
  - Xem **doanh thu** (hôm nay, 7 ngày, 30 ngày, tất cả), món bán chạy, danh sách đơn; xác nhận/huỷ đơn; ghi đơn bán tại quán

> GitHub Pages chỉ chứa file tĩnh nên không lưu được dữ liệu và không đăng nhập được. Vì vậy cần Firebase (bước 1–3 bên dưới, mất khoảng 10 phút).

## Xem thử ngay (chế độ demo)

Mở `index.html` và `admin.html` trực tiếp (hoặc `python3 -m http.server`). Khi chưa cấu hình Firebase, dữ liệu chỉ lưu trong trình duyệt của bạn — chỉ để xem thử, **không đồng bộ giữa các máy**.

## Triển khai thật

### 1. Tạo Firebase
1. Vào https://console.firebase.google.com → **Add project** (tắt Google Analytics cũng được).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**, chọn email hỗ trợ, Save.
3. **Build → Firestore Database → Create database** (chọn *Production mode*, vị trí gần Việt Nam, ví dụ `asia-southeast1`).
4. Tab **Rules** của Firestore: dán toàn bộ nội dung file `firestore.rules` → **Publish**.
5. **Project settings (⚙) → General → Your apps → Web (`</>`)** → đặt tên → copy đoạn `firebaseConfig`.

### 2. Dán cấu hình
Mở `js/firebase-config.js`, bỏ dấu `//` ở khối `window.FIREBASE_CONFIG = {...}` và dán thông tin vừa copy (xoá dòng `window.FIREBASE_CONFIG = null;`).

### 3. Đẩy lên GitHub Pages
1. Tạo repo mới trên GitHub, upload toàn bộ thư mục này (giữ nguyên cấu trúc).
2. Repo → **Settings → Pages → Branch: `main` / root → Save**.
3. Chờ 1–2 phút, web có địa chỉ `https://<tên-github>.github.io/<tên-repo>/`.
4. **Quan trọng:** quay lại Firebase → **Authentication → Settings → Authorized domains → Add domain** → thêm `<tên-github>.github.io`. Nếu không đăng nhập Google sẽ báo lỗi.

### 4. Dùng
- Khách vào: `https://<tên-github>.github.io/<tên-repo>/`
- Chủ quán vào: `.../admin.html` (có nút “Trang chủ quán” nhỏ ở góc trang khách) → đăng nhập Google → sửa → **💾 Lưu thay đổi**.

## Bảo mật
- Chỉ tài khoản `duykhanh2605.pq@gmail.com` (đã xác minh) ghi được thông tin quán và đọc/sửa đơn hàng — được chặn ở **Firestore Rules** (phía máy chủ), không chỉ ở giao diện.
- Khách chỉ được *tạo* đơn mới, không đọc được đơn của người khác.
- Cấu hình Firebase trong `firebase-config.js` là thông tin công khai theo thiết kế của Firebase, không phải mật khẩu; an toàn nhờ Rules.
- Muốn đổi chủ quán: sửa email ở `js/firebase-config.js` **và** trong `firestore.rules`.

## Ghi chú
- Doanh thu chỉ tính các đơn ở trạng thái **Hoàn thành**.
- Đơn khách đặt có trạng thái *Chờ xử lý*, hiện số đỏ trên tab “Doanh thu”. Trang quản lý cập nhật theo thời gian thực nên không cần tải lại.
- **QR chuyển khoản (VietQR):** nhập ngân hàng, số tài khoản, tên chủ tài khoản vào `js/bank-config.js`. Sau khi khách đặt món, web tự tạo mã QR cho từng đơn, đã điền sẵn số tiền và nội dung = `DH ` + mã đơn (ví dụ `DH A3F9`). Khách quét là xong.
- Web **không tự biết** khách đã chuyển tiền chưa. Bạn đối chiếu nội dung chuyển khoản trong app ngân hàng với mã đơn `#A3F9` ở trang quản lý, rồi bấm *Hoàn thành* để tính doanh thu.
