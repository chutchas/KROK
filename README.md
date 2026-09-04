# KROK — ฟอร์มดิจิทัลหน้างาน (Phase 1)

แพลตฟอร์มแทนที่ฟอร์มกระดาษในคลังสินค้าและโรงงาน แนวเดียวกับ i-Reporter แต่ **AI สร้างฟอร์มให้**
พิมพ์บอกว่าอยากตรวจอะไร หรืออัพโหลดฟอร์มกระดาษเดิม → ได้ฟอร์มดิจิทัลพร้อมใช้บนมือถือ
คนหน้างานกรอกทีละขั้นแบบล็อคลำดับ ข้อมูลถึงศูนย์แบบ realtime

Stack: **Next.js (App Router, TS) + Supabase (Postgres/Auth/Storage/Realtime) + Claude API** · deploy บน **Vercel**

---

## สิ่งที่มีใน Phase 1

- **AI Form Studio** — สร้างฟอร์มจาก prompt, อัพโหลดฟอร์มเดิม (รูป), ปรับแก้ด้วยภาษาคน
- **Mobile Fill** — กรอกจากมือถือ/แท็บเล็ต ล็อคลำดับขั้น, ถ่ายรูป + AI ตรวจรูป, สแกน barcode, ลายเซ็น, ค่านอกช่วงถูกแจ้งเป็นปัญหา
- **Realtime Dashboard** — เห็นทุก submission ทันที สรุป pass/fail กดดูรายละเอียด+รูปได้
- **Multi-tenant + RLS** — แยกข้อมูลต่อองค์กรที่ระดับ database พร้อมขายเป็น SaaS
- **Audit log + soft delete** — รองรับการตรวจสอบย้อนหลัง (ISO)

ฟิลด์ที่รองรับ: text, number (มี min/max/unit), select, checkbox, pass/fail, photo, barcode/QR, signature, datetime

## สิ่งที่เพิ่มใน Phase 2

- **Workflow อนุมัติ** — ติ๊ก “ต้องผ่านการอนุมัติ” ตอนสร้างฟอร์ม → submission เข้าคิวที่หน้า **อนุมัติ** ให้ owner/admin/designer อนุมัติหรือตีกลับพร้อมเหตุผล
- **ศูนย์แจ้งเตือน (🔔)** — realtime: แจ้งผู้อนุมัติเมื่อมีงานรอ/พบปัญหา และแจ้งผู้ส่งเมื่อถูกอนุมัติ/ตีกลับ
- **เชิญสมาชิก + จัดการ role** — หน้า **ทีม**: เชิญด้วยอีเมล (สมัครด้วยอีเมลนั้นแล้วเข้าองค์กรอัตโนมัติ), เปลี่ยน role, นำออก (กัน owner คนสุดท้าย)
- **Paper view + PDF** — หน้า `/submission/[id]` แสดง submission เป็นเอกสารพร้อมรูป/ลายเซ็น/สถานะอนุมัติ กดพิมพ์หรือบันทึกเป็น PDF ได้

> **สำคัญ:** ถ้าเคยตั้ง Supabase ตาม Phase 1 แล้ว ให้รัน migration เพิ่ม **`0004_workflow_invites_notifications.sql`** ใน SQL Editor

---

## ตั้งค่าให้รันได้ (ครั้งแรก ~15 นาที)

### 1) โคลนและติดตั้ง
```bash
git clone https://github.com/chutchas/KROK.git
cd KROK
npm install
```

### 2) สร้าง Supabase project
1. ไปที่ https://supabase.com → **New project** (เลือก region สิงคโปร์ใกล้ไทยสุด)
2. รอ project พร้อม แล้วไปที่ **SQL Editor** → **New query**
3. เปิดไฟล์ในโฟลเดอร์ `supabase/migrations/` แล้ว **รันตามลำดับ**:
   - `0001_init.sql`
   - `0002_helpers_and_rls.sql`
   - `0003_storage.sql`

   (วาง SQL ทีละไฟล์แล้วกด Run)

### 3) ตั้งค่า Auth (สำคัญสำหรับเทสต์เร็ว)
- ไปที่ **Authentication → Providers → Email** เปิดใช้งาน
- ระหว่างพัฒนา แนะนำปิด **"Confirm email"** (Authentication → Providers → Email → ปิด Confirm email) เพื่อสมัครแล้วล็อกอินได้ทันทีโดยไม่ต้องยืนยันอีเมล
- ตอนขึ้น production ค่อยเปิดกลับ

### 4) ใส่คีย์ลง `.env.local`
```bash
cp .env.example .env.local
```
แก้ค่าใน `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY` → เอาจาก Supabase **Project Settings → API**
- `ANTHROPIC_API_KEY` → เอาจาก https://console.anthropic.com/settings/keys

### 5) รัน
```bash
npm run dev
```
เปิด http://localhost:3000 → **สมัครองค์กรใหม่** → ระบบสร้าง workspace ให้อัตโนมัติ คุณเป็น owner

> ทดสอบบนมือถือในวง LAN เดียวกัน: `npm run dev -- -H 0.0.0.0` แล้วเปิด `http://<ip เครื่อง Mac>:3000`

---

## Deploy ขึ้น Vercel
1. เข้า https://vercel.com → **Add New → Project** → เลือก repo `chutchas/KROK`
2. ใส่ Environment Variables 3 ตัวเดียวกับ `.env.local` (URL, ANON_KEY, ANTHROPIC_API_KEY)
3. Deploy — Vercel จะ build และให้ URL มา
4. กลับไปที่ Supabase → **Authentication → URL Configuration** ใส่ Vercel URL ใน Site URL / Redirect URLs

---

## โครงสร้างโปรเจกต์
```
supabase/migrations/   SQL: schema, RLS, storage (รันตามลำดับเลข)
supabase/seed.sql      (ไม่บังคับ) ฟอร์มตัวอย่าง
src/lib/
  form-schema.ts       type + sanitizer ของ form schema (หัวใจระบบ)
  ai.ts                เรียก Claude: สร้าง/อ่าน/ปรับฟอร์ม + ตรวจรูป
  supabase/            client / server / proxy helpers
  session.ts           ดึง user + tenant + role
src/app/
  login/               สมัคร + เข้าสู่ระบบ
  (app)/studio/        AI Form Studio (owner/admin/designer)
  (app)/forms/         รายการฟอร์มให้กรอก
  (app)/fill/[formId]/ ตัวกรอกฟอร์มบนมือถือ (ล็อคขั้นตอน)
  (app)/dashboard/     realtime dashboard
  api/ai/*             route handlers เรียก Claude (ฝั่ง server)
```

## Role
- **owner** (คนสมัคร) / **admin** / **designer** — สร้างและจัดการฟอร์มได้
- **operator** — กรอกฟอร์มและดู dashboard (การเชิญสมาชิก + เปลี่ยน role เป็นงาน Phase 2)

## ยังไม่ทำ (roadmap ถัดไป)
Offline sync, workflow อนุมัติหลายขั้น/กำหนดผู้อนุมัติเฉพาะราย, ส่งอีเมลเชิญจริง (ตอนนี้เชิญแล้วให้สมัครเอง), billing SaaS, ถาม dashboard ด้วยภาษาคน

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
