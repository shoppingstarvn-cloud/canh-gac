# Canh gác 24/7 — hệ sinh thái ShopMartAI

Mỗi 5 phút, GitHub Actions kiểm tra các website và database trong `muc-tieu.json`.
- Hỏng 3 lần liên tiếp → mở phiếu (Issue) nhãn `su-co`, GitHub gửi email báo.
- Hồi phục → tự đóng phiếu.
- Trạng thái mới nhất: `trang-thai.json`.

Sửa danh sách: chỉnh `muc-tieu.json` (tên, url, mã trạng thái chấp nhận, chữ phải có).
Kho này không chứa mật khẩu hay khóa nào.
