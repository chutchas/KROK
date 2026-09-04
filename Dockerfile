# =============================================================
#  KROK — Dockerfile (multi-stage)
#  ทำไมแบ่งเป็น 3 ชั้น? เพื่อให้ image สุดท้ายเล็กและปลอดภัย
#  ชั้น deps/builder มี source + dev tools แต่ทิ้งไป
#  เหลือแค่ชั้น runner ที่มีเฉพาะของที่ต้องใช้ตอนรันจริง
# =============================================================

# ---------- ชั้นที่ 1: ติดตั้ง dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app

# copy แค่ 2 ไฟล์นี้ก่อน เพื่อให้ Docker cache ชั้นนี้ไว้
# แก้โค้ดแล้ว build ใหม่จะไม่ต้อง npm ci ซ้ำ (เร็วขึ้นมาก)
COPY package.json package-lock.json ./
RUN npm ci

# ---------- ชั้นที่ 2: build Next.js ----------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ⚠️ ตัวแปร NEXT_PUBLIC_* ถูกฝังลงใน JS ฝั่ง browser ตอน "build"
# เพราะฉะนั้นต้องส่งเข้ามาตอน build ไม่ใช่ตอนรัน
# (ค่าพวกนี้ไม่ลับอยู่แล้ว — anon key ตั้งใจให้ browser เห็น)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- ชั้นที่ 3: image ที่เอาไปรันจริง ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# ต้องเป็น 0.0.0.0 ไม่งั้นรับ request จากนอก container ไม่ได้
ENV HOSTNAME=0.0.0.0

# ไม่รันด้วย root — best practice ด้านความปลอดภัย
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# server.js มาจาก output: "standalone" ใน next.config.ts
CMD ["node", "server.js"]
