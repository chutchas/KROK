// ============================================================
// KROK · ตัววาดไอคอนฟอร์ม (กล่องสีหลัก + ไอคอนเส้น) — ใช้ได้ทั้ง server และ client component
//   <FormIcon value={form.icon} />            กล่อง 40px
//   <FormIcon value={form.icon} size={28} />  เล็ก · <FormIcon value=... bare /> ไอคอนเปล่าไม่มีกล่อง
// value รับได้ทั้ง "i:package" และอีโมจิเก่า (แปลงอัตโนมัติ) — ดู lib/form-icons.ts
// ============================================================
import type { LucideIcon } from "lucide-react";
import { Activity, Anchor, Apple, BadgeCheck, Banknote, Barcode, BatteryCharging, BedDouble, BookOpen, Boxes, BrickWall, Building2, Bus, Calculator, CalendarDays, Camera, Car, ChartLine, ChefHat, ClipboardCheck, ClipboardList, Cog, ConciergeBell, Construction, Container, CookingPot, Cpu, Drill, Droplets, Eye, Factory, Fan, FileText, Flame, FlaskConical, Forklift, Fuel, Gauge, GraduationCap, Hammer, Handshake, HardHat, Headset, HeartPulse, Hospital, Hotel, IdCard, KeyRound, Laptop, Layers, Leaf, Lightbulb, ListChecks, Mail, MapPin, Microscope, Package, PackageCheck, Pill, Plane, PlugZap, Receipt, Recycle, Route, Ruler, Scale, ScanLine, School, SearchCheck, ShieldCheck, Ship, ShoppingBag, ShoppingCart, Signature, Siren, Snowflake, Sparkles, SprayCan, Sprout, Stethoscope, Store, Sun, Syringe, Tag, Target, Thermometer, Timer, Tractor, Trash2, TriangleAlert, Truck, UserCheck, Users, Utensils, Warehouse, Waves, Wheat, Wifi, Workflow, Wrench, Zap } from "lucide-react";
import { resolveIconKey } from "@/lib/form-icons";

export const ICON_COMPONENTS: Record<string, LucideIcon> = {
  "clipboard-list": ClipboardList,
  "clipboard-check": ClipboardCheck,
  "list-checks": ListChecks,
  "search-check": SearchCheck,
  "scan-line": ScanLine,
  "eye": Eye,
  "shield-check": ShieldCheck,
  "hard-hat": HardHat,
  "triangle-alert": TriangleAlert,
  "flame": Flame,
  "siren": Siren,
  "heart-pulse": HeartPulse,
  "badge-check": BadgeCheck,
  "microscope": Microscope,
  "ruler": Ruler,
  "gauge": Gauge,
  "target": Target,
  "scale": Scale,
  "wrench": Wrench,
  "cog": Cog,
  "hammer": Hammer,
  "drill": Drill,
  "plug-zap": PlugZap,
  "fan": Fan,
  "package": Package,
  "package-check": PackageCheck,
  "boxes": Boxes,
  "warehouse": Warehouse,
  "forklift": Forklift,
  "truck": Truck,
  "car": Car,
  "route": Route,
  "container": Container,
  "barcode": Barcode,
  "factory": Factory,
  "layers": Layers,
  "workflow": Workflow,
  "timer": Timer,
  "cpu": Cpu,
  "users": Users,
  "user-check": UserCheck,
  "id-card": IdCard,
  "calendar-days": CalendarDays,
  "graduation-cap": GraduationCap,
  "sparkles": Sparkles,
  "spray-can": SprayCan,
  "trash-2": Trash2,
  "recycle": Recycle,
  "thermometer": Thermometer,
  "snowflake": Snowflake,
  "droplets": Droplets,
  "activity": Activity,
  "zap": Zap,
  "chart-line": ChartLine,
  "file-text": FileText,
  "receipt": Receipt,
  "calculator": Calculator,
  "shopping-cart": ShoppingCart,
  "signature": Signature,
  "mail": Mail,
  "handshake": Handshake,
  "headset": Headset,
  "camera": Camera,
  "key-round": KeyRound,
  "construction": Construction,
  "building-2": Building2,
  "brick-wall": BrickWall,
  "utensils": Utensils,
  "chef-hat": ChefHat,
  "cooking-pot": CookingPot,
  "apple": Apple,
  "store": Store,
  "shopping-bag": ShoppingBag,
  "tag": Tag,
  "banknote": Banknote,
  "hotel": Hotel,
  "bed-double": BedDouble,
  "concierge-bell": ConciergeBell,
  "waves": Waves,
  "stethoscope": Stethoscope,
  "hospital": Hospital,
  "pill": Pill,
  "syringe": Syringe,
  "flask-conical": FlaskConical,
  "sprout": Sprout,
  "tractor": Tractor,
  "wheat": Wheat,
  "leaf": Leaf,
  "sun": Sun,
  "battery-charging": BatteryCharging,
  "fuel": Fuel,
  "ship": Ship,
  "anchor": Anchor,
  "plane": Plane,
  "school": School,
  "book-open": BookOpen,
  "bus": Bus,
  "laptop": Laptop,
  "wifi": Wifi,
  "map-pin": MapPin,
  "lightbulb": Lightbulb,
};

export default function FormIcon({ value, size = 40, bare = false, title }: { value: string | null | undefined; size?: number; bare?: boolean; title?: string }) {
  const key = resolveIconKey(value);
  const Ic = ICON_COMPONENTS[key] || ClipboardList;
  const glyph = Math.round(size * (bare ? 1 : 0.5));
  const svg = <Ic width={glyph} height={glyph} strokeWidth={1.9} aria-hidden={title ? undefined : true} aria-label={title} />;
  if (bare) return svg;
  return (
    <span style={{ width: size, height: size, flex: "0 0 auto", borderRadius: Math.round(size * 0.26), display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: "var(--accent-soft)", color: "var(--accent)" }} title={title}>
      {svg}
    </span>
  );
}

/** ไอคอนเปล่าวางหน้าข้อความ (หัวข้อ/ชื่อฟอร์มในบรรทัด) — สีตามข้อความรอบข้าง */
export function InlineFormIcon({ value, size = 18 }: { value: string | null | undefined; size?: number }) {
  return (
    <span style={{ display: "inline-flex", verticalAlign: "-0.15em", marginRight: 6, opacity: 0.85 }}>
      <FormIcon value={value} size={size} bare />
    </span>
  );
}
