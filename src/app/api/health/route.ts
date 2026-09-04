// ให้ ALB / ECS ยิงเช็คว่าแอปยังมีชีวิตอยู่ไหม
// ตั้ง Health check path ที่ Target Group เป็น /api/health
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, ts: new Date().toISOString() });
}
