-- ============================================================
-- KROK · 0038_storage_limits
-- จำกัดชนิด/ขนาดไฟล์ที่ bucket (บังคับฝั่ง Storage — ไม่พึ่งการตรวจในแอปอย่างเดียว)
--
-- - avatars (อ่านได้สาธารณะ): รูปเท่านั้น ≤ 2MB — กันอัป HTML/SVG ไปฝากเปิดจากโดเมน storage
-- - submissions / drafts / cases: แอปอัปเฉพาะ JPEG/PNG (รูปถ่าย, ลายเซ็น, รูปเอกสาร) ≤ 10MB
-- ไฟล์ที่อยู่แล้วไม่ถูกแตะ มีผลกับการอัปโหลดใหม่เท่านั้น
-- (attachments ไม่แตะ: แนบ PDF/วิดีโอ/รูปได้ตามที่ตั้งไว้ในแอป)
-- ============================================================

update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      file_size_limit = 2 * 1024 * 1024
  where id = 'avatars';

update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png'],
      file_size_limit = 10 * 1024 * 1024
  where id in ('submissions', 'drafts', 'cases');
