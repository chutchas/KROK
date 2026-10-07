import type { Metadata } from "next";
import Link from "next/link";
import LegalContact from "@/components/LegalContact";
import LegalDoc, { type LegalSection } from "@/components/LegalDoc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "นโยบายความเป็นส่วนตัว · KROK" };

// ร่างนโยบายความเป็นส่วนตัวตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (มาตรา 23) — ควรให้ที่ปรึกษากฎหมายตรวจก่อนใช้จริง
export default function PrivacyPage() {
  const contact = LEGAL.email
    ? <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
    : <span>〔อีเมลติดต่อเรื่องข้อมูลส่วนบุคคล〕</span>;

  const sections: LegalSection[] = [
    {
      id: "roles",
      title: "บทบาทของเราต่อข้อมูลของคุณ",
      body: (
        <>
          <p>KROK เป็นระบบแบบฟอร์มดิจิทัลที่องค์กรใช้สร้างฟอร์ม เก็บข้อมูล และอนุมัติเอกสาร ข้อมูลในระบบจึงแบ่งเป็น 2 กลุ่ม:</p>
          <ul>
            <li><b>ข้อมูลบัญชีผู้ใช้และการใช้บริการ</b> (เช่น ชื่อ อีเมล ประวัติการใช้งาน การชำระเงิน) — {LEGAL.name} เป็น <b>ผู้ควบคุมข้อมูลส่วนบุคคล</b></li>
            <li><b>ข้อมูลที่กรอกในแบบฟอร์มขององค์กรลูกค้า</b> (เช่น คำตอบ รูปถ่าย ลายเซ็น) — องค์กรที่เป็นเจ้าของฟอร์มเป็น <b>ผู้ควบคุมข้อมูลส่วนบุคคล</b> และ KROK เป็น <b>ผู้ประมวลผลข้อมูลส่วนบุคคล</b> ที่ประมวลผลตามคำสั่งขององค์กรนั้นเท่านั้น ตาม<Link href="/terms#dpa">ข้อตกลงการประมวลผลข้อมูล</Link></li>
          </ul>
          <p>หากคุณกรอกฟอร์มขององค์กรใด และต้องการใช้สิทธิเกี่ยวกับข้อมูลที่กรอก โปรดติดต่อองค์กรนั้นโดยตรง เราจะช่วยองค์กรดำเนินการตามคำขอของคุณ</p>
        </>
      ),
    },
    {
      id: "collect",
      title: "ข้อมูลที่เราเก็บรวบรวม",
      body: (
        <ul>
          <li><b>ข้อมูลบัญชี:</b> ชื่อที่แสดง อีเมล รหัสผ่าน (เก็บแบบเข้ารหัสทางเดียว เราไม่เห็นรหัสผ่านจริง) รูปโปรไฟล์ ชื่อองค์กร/workspace บทบาทและทีม</li>
          <li><b>ข้อมูลการใช้งาน:</b> ประวัติการทำรายการ (audit log) เช่น สร้าง/แก้ไขฟอร์ม ส่งเอกสาร อนุมัติ พร้อมเวลา รหัสอุปกรณ์ (กรณีองค์กรเปิดใช้การล็อกอุปกรณ์) และหมายเลข IP ที่ใช้ชั่วคราวเพื่อกันการใช้งานผิดปกติ</li>
          <li><b>บันทึกข้อผิดพลาดของระบบ:</b> เมื่อหน้าเว็บหรือระบบเกิด error เราบันทึกหน้าที่เปิด ข้อความ error ชนิดเบราว์เซอร์ และรหัสผู้ใช้ (ถ้าล็อกอิน) ไว้ในระบบของเราเองเพื่อแก้ปัญหา เก็บ 30 วัน ไม่รวมข้อมูลที่กรอกในฟอร์ม</li>
          <li><b>ข้อมูลการชำระเงิน:</b> แพ็กเกจ ใบแจ้งหนี้ สถานะการชำระ — ข้อมูลบัตรหรือบัญชีธนาคารถูกกรอกและเก็บโดยผู้ให้บริการรับชำระเงินโดยตรง เราไม่เก็บเลขบัตร</li>
          <li><b>ข้อมูลที่กรอกในฟอร์ม:</b> ตามที่องค์กรออกแบบฟอร์ม อาจมีชื่อ ข้อความ ตัวเลข รูปถ่าย ลายเซ็น เอกสารที่สแกน และชื่อผู้กรอก (กรณีฟอร์มสาธารณะ)</li>
          <li><b>ตำแหน่ง (GPS):</b> เฉพาะฟอร์มที่องค์กรเปิดใช้ “เก็บพิกัด” — เบราว์เซอร์จะขออนุญาตก่อนทุกครั้ง เราเก็บพิกัด ค่าความคลาดเคลื่อน และเวลา ณ ตอนส่งเอกสาร และอาจประทับพิกัดลงบนรูปถ่ายในฟอร์มนั้น ระบบอ่านตำแหน่งเฉพาะระหว่างเปิดฟอร์มอยู่ ไม่ติดตามตำแหน่งเบื้องหลัง ไม่อนุญาตก็ยังส่งได้ เว้นแต่องค์กรตั้งให้ฟอร์มนั้นบังคับระบุตำแหน่ง</li>
          <li><b>การแจ้งเตือนบนอุปกรณ์:</b> เมื่อคุณเปิด “แจ้งเตือนเด้ง” เราเก็บรหัสการสมัครรับแจ้งเตือนของเบราว์เซอร์ (endpoint) และชนิดอุปกรณ์ เพื่อส่งแจ้งเตือนถึงเครื่องนั้น ปิดได้ทุกเมื่อที่หน้าโปรไฟล์</li>
          <li><b>การสื่อสาร:</b> ข้อความที่คุณติดต่อเรา รวมถึงชื่อ อีเมล เบอร์โทร และบริษัทที่กรอกในฟอร์ม “ติดต่อเรา”</li>
        </ul>
      ),
    },
    {
      id: "location",
      title: "ข้อมูลตำแหน่ง (GPS)",
      body: (
        <ul>
          <li><b>เก็บเมื่อไร:</b> เฉพาะเมื่อองค์กรเปิดใช้ “เก็บพิกัด” ในฟอร์มนั้น และเบราว์เซอร์ของผู้กรอกอนุญาตให้เข้าถึงตำแหน่ง ระบบอ่านตำแหน่งเฉพาะขณะเปิดฟอร์มอยู่ ไม่ติดตามตำแหน่งเบื้องหลังหรือหลังส่งเอกสาร</li>
          <li><b>เก็บอะไร:</b> ละติจูด ลองจิจูด ค่าความคลาดเคลื่อน (เมตร) และเวลาที่อ่านตำแหน่ง ผูกกับเอกสารที่ส่ง หากฟอร์มเปิด “ลายน้ำบนรูป” พิกัดและเวลาจะถูกประทับลงในรูปถ่ายอย่างถาวร</li>
          <li><b>เพื่ออะไร:</b> ยืนยันว่างานถูกทำ ณ สถานที่จริง ตามที่องค์กรผู้ควบคุมข้อมูลกำหนด (ฐานประโยชน์โดยชอบด้วยกฎหมายหรือสัญญาจ้างขององค์กรนั้น) KROK ประมวลผลในฐานะผู้ประมวลผลข้อมูลตามคำสั่งขององค์กรเท่านั้น</li>
          <li><b>ใครเห็น:</b> ผู้ที่มีสิทธิ์ดูเอกสารนั้นในองค์กร รวมถึงในรายงาน ไฟล์ PDF/Excel และข้อมูลที่องค์กรส่งออกผ่าน Webhook/API ลิงก์แผนที่จะเปิด Google Maps เฉพาะเมื่อผู้ใช้กดเอง</li>
          <li><b>เก็บนานเท่าไร:</b> เท่ากับเอกสารที่แนบ — ลบเมื่อองค์กรลบเอกสาร หรือตามระยะเวลาในหัวข้อระยะเวลาเก็บรักษา</li>
          <li><b>ปฏิเสธหรือถอนได้:</b> ไม่อนุญาตตำแหน่งในเบราว์เซอร์ก็ยังส่งฟอร์มได้ เว้นแต่องค์กรตั้งให้ฟอร์มนั้นบังคับระบุตำแหน่ง ถอนการอนุญาตได้ที่การตั้งค่าเบราว์เซอร์/อุปกรณ์ หากต้องการลบพิกัดในเอกสารที่ส่งไปแล้ว ติดต่อองค์กรเจ้าของฟอร์ม</li>
        </ul>
      ),
    },
    {
      id: "purpose",
      title: "วัตถุประสงค์และฐานทางกฎหมาย",
      body: (
        <ul>
          <li>ให้บริการตามสัญญา: สร้างบัญชี เข้าสู่ระบบ จัดการ workspace สมาชิก ฟอร์ม เอกสาร การอนุมัติ การแจ้งเตือน (ฐานสัญญา — มาตรา 24(3))</li>
          <li>ความปลอดภัยของระบบ: ตรวจจับและป้องกันการใช้งานผิดปกติ จำกัดความถี่ บันทึกประวัติเพื่อตรวจสอบย้อนหลัง (ฐานประโยชน์โดยชอบด้วยกฎหมาย — มาตรา 24(5))</li>
          <li>เรียกเก็บค่าบริการและออกเอกสารทางบัญชี (ฐานสัญญาและหน้าที่ตามกฎหมาย — มาตรา 24(3), 24(6))</li>
          <li>ปรับปรุงบริการจากสถิติการใช้งานแบบภาพรวม (ฐานประโยชน์โดยชอบด้วยกฎหมาย)</li>
          <li>ปฏิบัติตามกฎหมายหรือคำสั่งของหน่วยงานรัฐที่มีอำนาจ (มาตรา 24(6))</li>
        </ul>
      ),
    },
    {
      id: "ai",
      title: "ฟีเจอร์ AI",
      body: (
        <p>เมื่อผู้ใช้กดใช้ฟีเจอร์ AI (สร้างฟอร์มจากข้อความ/รูป ตรวจรูปถ่าย อ่านข้อมูลจากเอกสาร) ข้อความหรือรูปที่เกี่ยวข้องจะถูกส่งไปยังผู้ให้บริการโมเดลภาษา (LLM) ที่เราใช้ เพื่อประมวลผลและส่งผลลัพธ์กลับเท่านั้น เราเลือกใช้บริการที่ไม่นำข้อมูลผ่าน API ไปฝึกโมเดลตามเงื่อนไขของผู้ให้บริการ ผลลัพธ์จาก AI อาจคลาดเคลื่อน ผู้ใช้ควรตรวจสอบก่อนยืนยัน องค์กรที่ไม่ต้องการส่งข้อมูลให้ AI สามารถไม่ใช้ฟีเจอร์นี้ได้</p>
      ),
    },
    {
      id: "share",
      title: "การเปิดเผยข้อมูลให้ผู้อื่น",
      body: (
        <>
          <p>เราไม่ขายข้อมูลส่วนบุคคล เราเปิดเผยข้อมูลเท่าที่จำเป็นต่อผู้ให้บริการที่ช่วยให้บริการ (ผู้ประมวลผลช่วง) ซึ่งมีหน้าที่รักษาความลับและความปลอดภัย:</p>
          <ul>
            <li>โครงสร้างพื้นฐานฐานข้อมูล การยืนยันตัวตน และพื้นที่เก็บไฟล์ (Supabase)</li>
            <li>โฮสต์เว็บไซต์และเครือข่ายส่งข้อมูล (Vercel)</li>
            <li>ผู้ให้บริการโมเดล AI (เฉพาะเมื่อใช้ฟีเจอร์ AI)</li>
            <li>ผู้ให้บริการรับชำระเงิน (เช่น Stripe, Omise, 2C2P, PromptPay ตามที่เปิดใช้)</li>
            <li>ผู้ให้บริการส่งอีเมลยืนยันตัวตน/แจ้งเตือน</li>
            <li>บริการแจ้งเตือนของเบราว์เซอร์ (เช่น Google, Apple, Mozilla) — เฉพาะเมื่อเปิดแจ้งเตือนเด้ง ส่งเพียงหัวข้อและข้อความแจ้งเตือนสั้น ๆ</li>
          </ul>
          <p>นอกจากนี้ องค์กรลูกค้าอาจตั้งค่าส่งข้อมูลไปยังระบบของตนเอง (เช่น LINE, อีเมล, Webhook, API) ซึ่งเป็นการเปิดเผยตามคำสั่งขององค์กรนั้น</p>
        </>
      ),
    },
    {
      id: "transfer",
      title: "การส่งข้อมูลไปต่างประเทศ",
      body: (
        <p>ผู้ให้บริการโครงสร้างพื้นฐานบางรายอาจจัดเก็บหรือประมวลผลข้อมูลบนเซิร์ฟเวอร์นอกประเทศไทย เราเลือกผู้ให้บริการที่มีมาตรฐานการคุ้มครองข้อมูลที่เพียงพอ และมีข้อสัญญาคุ้มครองข้อมูล (เช่น Standard Contractual Clauses) ตามมาตรา 28–29 แห่ง พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล และประกาศของคณะกรรมการที่เกี่ยวข้อง</p>
      ),
    },
    {
      id: "retention",
      title: "ระยะเวลาเก็บรักษา",
      body: (
        <ul>
          <li>ข้อมูลบัญชี: ตลอดระยะเวลาที่มีบัญชี และลบหรือทำให้ไม่ระบุตัวตนภายใน 90 วันหลังปิดบัญชี เว้นแต่กฎหมายกำหนดให้เก็บนานกว่า</li>
          <li>ข้อมูลในฟอร์มและเอกสาร: ตามที่องค์กรเจ้าของฟอร์มกำหนด และลบเมื่อองค์กรลบ หรือภายใน 90 วันหลังสิ้นสุดการใช้บริการ</li>
          <li>แบบร่างการกรอกฟอร์ม: ลบอัตโนมัติเมื่อไม่ได้แก้ไขเกิน 30 วัน</li>
          <li>พิกัด GPS: เท่ากับเอกสารที่แนบ</li>
          <li>ข้อความจากฟอร์มติดต่อเรา: ไม่เกิน 2 ปีนับจากวันที่ติดต่อ หรือเร็วกว่าเมื่อไม่จำเป็นแล้ว</li>
          <li>การสมัครรับแจ้งเตือนบนอุปกรณ์: จนกว่าคุณจะปิด หรือเบราว์เซอร์ยกเลิก</li>
          <li>เอกสารทางบัญชี/ภาษี: ตามระยะเวลาที่กฎหมายกำหนด (โดยทั่วไป 5–10 ปี)</li>
          <li>ข้อมูลสำรอง (backup): ถูกเขียนทับตามรอบของผู้ให้บริการ</li>
        </ul>
      ),
    },
    {
      id: "rights",
      title: "สิทธิของเจ้าของข้อมูล",
      body: (
        <>
          <p>คุณมีสิทธิตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 ได้แก่ สิทธิขอเข้าถึงและรับสำเนา สิทธิขอให้โอนย้ายข้อมูล สิทธิคัดค้าน สิทธิขอให้ลบหรือทำให้ไม่ระบุตัวตน สิทธิขอให้ระงับการใช้ สิทธิขอให้แก้ไขให้ถูกต้อง และสิทธิถอนความยินยอม (กรณีใช้ความยินยอมเป็นฐาน)</p>
          <p>ส่งคำขอได้ที่ {contact} เราจะตอบภายใน 30 วันนับจากได้รับคำขอ และอาจขอข้อมูลเพื่อยืนยันตัวตนก่อนดำเนินการ ข้อมูลโปรไฟล์บางส่วนแก้ไขเองได้ที่หน้า <Link href="/settings/profile">โปรไฟล์</Link></p>
          <p>หากเห็นว่ามีการฝ่าฝืนกฎหมาย คุณมีสิทธิร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.)</p>
        </>
      ),
    },
    {
      id: "security",
      title: "การรักษาความปลอดภัย",
      body: (
        <ul>
          <li>เข้ารหัสการรับส่งข้อมูล (HTTPS/TLS) และใช้การเข้ารหัสข้อมูลขณะจัดเก็บของผู้ให้บริการโครงสร้างพื้นฐาน</li>
          <li>แยกข้อมูลแต่ละองค์กรด้วยการควบคุมสิทธิ์ระดับฐานข้อมูล (Row Level Security) และจำกัดสิทธิ์ตามบทบาท</li>
          <li>บันทึกประวัติการทำรายการสำคัญ จำกัดความถี่การเรียกใช้ และตรวจสอบความปลอดภัยเป็นระยะ</li>
          <li>หากเกิดเหตุละเมิดข้อมูลส่วนบุคคลที่มีความเสี่ยง เราจะแจ้งสำนักงาน สคส. ภายใน 72 ชั่วโมงนับจากทราบเหตุ และแจ้งผู้ได้รับผลกระทบหรือองค์กรลูกค้าโดยไม่ชักช้าตามที่กฎหมายกำหนด</li>
        </ul>
      ),
    },
    {
      id: "cookies",
      title: "คุกกี้และการจัดเก็บบนอุปกรณ์",
      body: (
        <p>เราใช้เฉพาะคุกกี้และพื้นที่จัดเก็บบนเบราว์เซอร์ที่จำเป็นต่อการทำงาน ได้แก่ คุกกี้ยืนยันการเข้าสู่ระบบ workspace ที่เลือก ภาษาและธีม และคิวงานออฟไลน์ (เก็บเอกสารที่ยังส่งไม่สำเร็จไว้ในเครื่องจนกว่าจะออนไลน์) เราไม่ใช้คุกกี้โฆษณาหรือคุกกี้ติดตามของบุคคลที่สาม</p>
      ),
    },
    {
      id: "minors",
      title: "ผู้เยาว์",
      body: <p>บริการนี้ออกแบบสำหรับองค์กรและผู้ใช้ที่บรรลุนิติภาวะ เราไม่มีเจตนาเก็บข้อมูลของผู้เยาว์โดยตรง หากองค์กรลูกค้าใช้ฟอร์มเก็บข้อมูลผู้เยาว์ องค์กรนั้นมีหน้าที่ขอความยินยอมจากผู้ใช้อำนาจปกครองตามกฎหมาย</p>,
    },
    {
      id: "contact",
      title: "ติดต่อเรา",
      body: (
        <LegalContact />
      ),
    },
    {
      id: "changes",
      title: "การเปลี่ยนแปลงนโยบาย",
      body: <p>เราอาจปรับปรุงนโยบายนี้เป็นครั้งคราว หากมีการเปลี่ยนแปลงสาระสำคัญ เราจะแจ้งผ่านระบบหรืออีเมลก่อนมีผล วันที่มีผลและฉบับจะแสดงที่ด้านบนของหน้านี้</p>,
    },
  ];

  const contactEn = LEGAL.email ? <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> : <span>[privacy contact email]</span>;
  const sectionsEn: LegalSection[] = [
    { id: "roles", title: "Our role regarding your data", body: (
      <>
        <p>KROK is a digital forms system that organisations use to build forms, collect data and approve documents. Data in the system falls into two groups:</p>
        <ul>
          <li><b>Account and service-usage data</b> (e.g. name, email, activity history, payments) — {LEGAL.name} is the <b>data controller</b>.</li>
          <li><b>Data entered into a customer organisation&apos;s forms</b> (e.g. answers, photos, signatures) — the organisation that owns the form is the <b>data controller</b> and KROK is a <b>data processor</b> acting only on that organisation&apos;s instructions, under the <Link href="/terms#dpa">data processing terms</Link>.</li>
        </ul>
        <p>If you filled in an organisation&apos;s form and want to exercise your rights over that data, please contact that organisation. We will help them handle your request.</p>
      </>
    ) },
    { id: "collect", title: "Data we collect", body: (
      <ul>
        <li><b>Account data:</b> display name, email, password (one-way hashed; we never see it), profile photo, organisation/workspace name, role and teams.</li>
        <li><b>Usage data:</b> an activity log (creating/editing forms, submitting, approving) with timestamps, a device ID when the organisation enables device lock, and IP addresses used temporarily to prevent abuse.</li>
        <li><b>Error logs:</b> when a page or the system fails, we record the page, the error message, browser type and user ID (if signed in) in our own system to fix problems, kept for 30 days. Form answers are not included.</li>
        <li><b>Payment data:</b> plan, invoices and payment status. Card or bank details are entered into and stored by the payment provider; we do not store card numbers.</li>
        <li><b>Form data:</b> whatever the organisation&apos;s form asks for, which may include names, text, numbers, photos, signatures, scanned documents and the respondent&apos;s name (public forms).</li>
        <li><b>Location (GPS):</b> only for forms where the organisation turns on location capture. The browser always asks first. We store coordinates, accuracy and the time at submission, and may stamp them onto photos in that form. Location is read only while the form is open, never in the background. If you refuse, you can still submit unless the organisation requires location for that form.</li>
        <li><b>Device notifications:</b> when you turn on push notifications we store your browser&apos;s push subscription (endpoint) and device type to deliver notifications to that device. Turn it off any time on your Profile page.</li>
        <li><b>Communications:</b> messages you send us, including the name, email, phone and company entered in the Contact form.</li>
      </ul>
    ) },
    { id: "location", title: "Location data (GPS)", body: (
      <ul>
        <li><b>When:</b> only when the organisation enables location capture on that form and the respondent&apos;s browser grants permission. Location is read only while the form is open — never tracked in the background or after submission.</li>
        <li><b>What:</b> latitude, longitude, accuracy (metres) and the time it was read, attached to the submitted document. If the form enables photo watermarks, coordinates and time are permanently stamped onto the photos.</li>
        <li><b>Why:</b> to confirm work was done on site, as decided by the organisation that controls the data (its legitimate interests or employment contract). KROK processes it as a processor on that organisation&apos;s instructions only.</li>
        <li><b>Who sees it:</b> people in the organisation allowed to view that document, including in reports, PDF/Excel files and data the organisation exports via webhooks/API. Map links open Google Maps only when a user clicks them.</li>
        <li><b>How long:</b> as long as the document it belongs to — deleted when the organisation deletes the document or per the Retention section.</li>
        <li><b>Refusing or withdrawing:</b> you can deny location in your browser and still submit, unless the organisation requires it for that form. Withdraw permission in your browser/device settings. To remove coordinates from a document already submitted, contact the organisation that owns the form.</li>
      </ul>
    ) },
    { id: "purpose", title: "Purposes and legal bases", body: (
      <ul>
        <li>Providing the service under contract: accounts, sign-in, workspaces, members, forms, documents, approvals and notifications (contract — Section 24(3)).</li>
        <li>Security: detecting and preventing abuse, rate limiting, keeping audit logs (legitimate interests — Section 24(5)).</li>
        <li>Billing and accounting records (contract and legal obligation — Sections 24(3), 24(6)).</li>
        <li>Improving the service using aggregated usage statistics (legitimate interests).</li>
        <li>Complying with the law or orders of competent authorities (Section 24(6)).</li>
      </ul>
    ) },
    { id: "ai", title: "AI features", body: (
      <p>When a user chooses an AI feature (generate a form from text/images, check a photo, read data from a document), the relevant text or images are sent to the large language model (LLM) provider we use, only to process them and return the result. We choose services whose terms do not use API data to train models. AI output can be wrong and should be checked before confirming. Organisations that do not want data sent to AI can simply not use these features.</p>
    ) },
    { id: "share", title: "Sharing with others", body: (
      <>
        <p>We do not sell personal data. We share data only as needed with providers that help run the service (sub-processors), who are bound to confidentiality and security:</p>
        <ul>
          <li>Database, authentication and file storage infrastructure (Supabase)</li>
          <li>Web hosting and delivery network (Vercel)</li>
          <li>AI model providers (only when AI features are used)</li>
          <li>Payment providers (e.g. Stripe, Omise, 2C2P, PromptPay, as enabled)</li>
          <li>Email delivery for sign-in confirmations and notifications</li>
          <li>Browser push services (e.g. Google, Apple, Mozilla) — only when push notifications are on; they carry only the short notification title and text</li>
        </ul>
        <p>A customer organisation may also configure data to be sent to its own systems (e.g. LINE, email, webhooks, API). Such disclosures follow that organisation&apos;s instructions.</p>
      </>
    ) },
    { id: "transfer", title: "International transfers", body: (
      <p>Some infrastructure providers may store or process data on servers outside Thailand. We choose providers with adequate data protection standards and contractual safeguards (e.g. Standard Contractual Clauses) in line with Sections 28–29 of the Personal Data Protection Act and related notifications.</p>
    ) },
    { id: "retention", title: "Retention", body: (
      <ul>
        <li>Account data: for as long as the account exists, then deleted or anonymised within 90 days of closure unless the law requires longer.</li>
        <li>Form data and documents: as set by the organisation that owns the form; deleted when the organisation deletes it or within 90 days after the service ends.</li>
        <li>Form drafts: deleted automatically after 30 days without edits.</li>
        <li>GPS coordinates: as long as the document they are attached to.</li>
        <li>Contact form messages: up to 2 years from contact, or sooner when no longer needed.</li>
        <li>Device push subscriptions: until you turn them off or the browser revokes them.</li>
        <li>Accounting and tax records: for the period required by law (generally 5–10 years).</li>
        <li>Backups: overwritten on the provider&apos;s rotation cycle.</li>
      </ul>
    ) },
    { id: "rights", title: "Your rights", body: (
      <>
        <p>Under the Personal Data Protection Act B.E. 2562 (2019) you have the right to access and obtain a copy, data portability, to object, to erasure or anonymisation, to restriction, to rectification, and to withdraw consent where consent is the basis.</p>
        <p>Send requests to {contactEn}. We respond within 30 days and may ask you to verify your identity first. You can edit some profile data yourself on the <Link href="/settings/profile">Profile</Link> page.</p>
        <p>If you believe the law has been breached, you may complain to the Office of the Personal Data Protection Committee (PDPC).</p>
      </>
    ) },
    { id: "security", title: "Security", body: (
      <ul>
        <li>Encryption in transit (HTTPS/TLS) and the infrastructure providers&apos; encryption at rest.</li>
        <li>Each organisation&apos;s data is separated by database-level access control (Row Level Security) and role-based permissions.</li>
        <li>Audit logs for key actions, rate limiting and periodic security reviews.</li>
        <li>If a personal data breach poses a risk, we notify the PDPC within 72 hours of becoming aware and notify affected people or customer organisations without undue delay, as the law requires.</li>
      </ul>
    ) },
    { id: "cookies", title: "Cookies and on-device storage", body: (
      <p>We use only cookies and browser storage that are strictly necessary: sign-in cookies, the selected workspace, language and theme, and an offline queue that keeps unsent documents on the device until it is back online. We do not use advertising or third-party tracking cookies.</p>
    ) },
    { id: "minors", title: "Minors", body: <p>The service is designed for organisations and adult users. We do not intend to collect minors&apos; data directly. If a customer organisation uses a form to collect minors&apos; data, that organisation must obtain consent from the holder of parental responsibility as the law requires.</p> },
    { id: "contact", title: "Contact us", body: <LegalContact en /> },
    { id: "changes", title: "Changes to this policy", body: <p>We may update this policy from time to time. For material changes we will notify you in the app or by email before they take effect. The effective date and version are shown at the top of this page.</p> },
  ];

  return (
    <LegalDoc docs={{
      th: {
        title: "นโยบายความเป็นส่วนตัว",
        intro: <p>นโยบายนี้อธิบายว่าเราเก็บ ใช้ เปิดเผย และคุ้มครองข้อมูลส่วนบุคคลอย่างไรเมื่อคุณใช้ KROK รวมถึงสิทธิของคุณตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562</p>,
        sections,
        other: { href: "/terms", label: "ข้อกำหนดการใช้งาน" },
      },
      en: {
        title: "Privacy Policy",
        intro: <p>This policy explains how we collect, use, disclose and protect personal data when you use KROK, and your rights under Thailand&apos;s Personal Data Protection Act B.E. 2562 (2019).</p>,
        sections: sectionsEn,
        other: { href: "/terms", label: "Terms of Service" },
      },
    }} />
  );
}
