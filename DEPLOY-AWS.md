# KROK — Deploy ด้วย Docker → AWS ECS Fargate

## แนวคิดใน 30 วินาที

`Dockerfile` = สูตร → `docker build` → **image** (กล่องปิดผนึก) → `docker run` → **container** (กล่องที่กำลังทำงาน)

image เดียวเอาไปรันที่ไหนก็เหมือนกันเป๊ะ ทั้งบน Mac คุณและบน AWS

---

## ส่วนที่ 1 — ลองในเครื่องก่อน (ไม่ต้องแตะ AWS)

### เตรียมครั้งเดียว
ติดตั้ง **Docker Desktop** → https://www.docker.com/products/docker-desktop
เปิดโปรแกรมทิ้งไว้ แล้วเช็คว่าใช้ได้:
```bash
docker --version
```

### 1) Build image

```bash
cd ~/Project/KROK

docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGci..." \
  -t krok:local .
```

> ครั้งแรกจะนานหน่อย (~2-4 นาที) เพราะต้องโหลด base image
> ครั้งต่อไปเร็วขึ้นมาก เพราะ Docker จำ (cache) ชั้นที่ไม่ได้แก้ไว้

**ทำไมต้องใส่ `--build-arg`?** ตัวแปรที่ขึ้นต้นด้วย `NEXT_PUBLIC_` ถูกฝังลงในไฟล์ JS ที่ browser โหลด **ตอน build** ไม่ใช่ตอนรัน ถ้าไม่ส่งเข้าไปตอนนี้ แอปจะหา Supabase ไม่เจอ

### 2) รัน container

```bash
docker run --rm -p 3000:3000 \
  -e SUPABASE_SERVICE_ROLE_KEY="eyJhbGci...service-role" \
  --name krok krok:local
```

เปิด http://localhost:3000

> `SUPABASE_SERVICE_ROLE_KEY` ส่ง**ตอนรัน** (`-e`) ไม่ใช่ตอน build — เพราะเป็นคีย์ลับ ห้ามฝังใน image เด็ดขาด ใครได้ image ไปจะอ่านเจอ

### 3) เช็คว่ารอด

```bash
curl http://localhost:3000/api/health
# → {"ok":true,"ts":"..."}
```

### คำสั่งที่ใช้บ่อย

```bash
docker ps                  # ดู container ที่กำลังรัน
docker logs -f krok        # ดู log แบบ realtime
docker stop krok           # หยุด
docker images              # ดู image ที่มี
docker rmi krok:local      # ลบ image
```

---

## ส่วนที่ 2 — ขึ้น AWS (ทำตอนพร้อมจริง)

### 1) ดันคีย์ลับเข้า Secrets Manager

```bash
aws secretsmanager create-secret \
  --name krok/supabase-service-role \
  --secret-string "eyJhbGci...service-role"
```

ECS จะดึงค่านี้ยัดเข้า container ตอนรันให้เอง — ไม่ต้องเก็บใน image หรือ task definition

### 2) สร้าง ECR (คลังเก็บ image) แล้ว push

```bash
AWS_REGION=ap-southeast-1          # สิงคโปร์ ใกล้ไทยสุด
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPO=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/krok

aws ecr create-repository --repository-name krok --region $AWS_REGION

aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# ⚠️ Mac M-series ต้อง build เป็น amd64 ไม่งั้น Fargate รันไม่ได้
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGci..." \
  -t $REPO:v1 .

docker push $REPO:v1
```

### 3) ECS Fargate

สร้าง cluster → task definition (ชี้ไปที่ `$REPO:v1`, port 3000, CPU 0.5 vCPU / RAM 1 GB พอสำหรับเริ่ม) → service หลัง **Application Load Balancer**

ตั้งที่ Target Group:

| ช่อง | ค่า |
|---|---|
| Health check path | `/api/health` |
| Port | 3000 |
| Success codes | 200 |

Environment variables ใน task definition:
- `SUPABASE_SERVICE_ROLE_KEY` → ผูกกับ **Secrets Manager** (ไม่ใช่ plain text)
- ที่เหลือฝังมากับ image ตอน build แล้ว

### 4) ปิดท้าย

- ต่อโดเมน + HTTPS ด้วย **ACM** ที่ ALB
- กลับไป Supabase → **Authentication → URL Configuration** ใส่โดเมนใหม่ใน Site URL / Redirect URLs
- (ทีหลัง) วาง **CloudFront** หน้า ALB เพื่อ cache static asset ให้เร็วและถูกลง

---

## ค่าใช้จ่ายคร่าว ๆ ต่อเดือน

| รายการ | ประมาณ |
|---|---|
| Fargate 0.5 vCPU / 1 GB รัน 24 ชม. | ~$18 |
| ALB | ~$18 |
| ECR + data transfer | ~$2-5 |
| **รวม** | **~$40** |

ลดได้โดยรัน 1 task และปิด ALB ใช้ Fargate public IP ตรง ๆ ตอนยังไม่มีลูกค้าจริง (ประหยัด ~$18 แต่ไม่มี HTTPS ให้ฟรี)

---

## Deploy เวอร์ชันใหม่

```bash
docker build --platform linux/amd64 --build-arg ... -t $REPO:v2 .
docker push $REPO:v2
aws ecs update-service --cluster krok --service krok --force-new-deployment
```

ทำอัตโนมัติได้ด้วย GitHub Actions ตอนพร้อม
