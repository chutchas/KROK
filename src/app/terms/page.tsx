import type { Metadata } from "next";
import Link from "next/link";
import LegalContact from "@/components/LegalContact";
import LegalDoc, { type LegalSection } from "@/components/LegalDoc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "ข้อกำหนดการใช้งาน" };

// ร่างข้อกำหนดการใช้งาน + ข้อตกลงการประมวลผลข้อมูล (มาตรา 40 พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล) — ควรให้ที่ปรึกษากฎหมายตรวจก่อนใช้จริง
export default function TermsPage() {

  const sections: LegalSection[] = [
    {
      id: "service",
      title: "บริการ",
      body: <p>KROK ({LEGAL.name} — “ผู้ให้บริการ”) ให้บริการระบบสร้างแบบฟอร์มดิจิทัล เก็บข้อมูล เอกสาร การอนุมัติ และการเชื่อมต่อระบบ ผ่านเว็บไซต์และแอป การสมัครหรือใช้บริการถือว่าคุณ (“ผู้ใช้” และองค์กรที่คุณเป็นตัวแทน — “ลูกค้า”) ยอมรับข้อกำหนดนี้</p>,
    },
    {
      id: "account",
      title: "บัญชีและความปลอดภัย",
      body: (
        <ul>
          <li>ผู้ใช้ต้องให้ข้อมูลที่ถูกต้อง เก็บรหัสผ่านเป็นความลับ และรับผิดชอบการใช้งานภายใต้บัญชีของตน</li>
          <li>ผู้สร้าง workspace เป็นเจ้าของบัญชี (billing owner) มีอำนาจจัดการสมาชิก สิทธิ์ แพ็กเกจ และข้อมูลของ workspace</li>
          <li>แจ้งเราทันทีหากพบการเข้าถึงบัญชีโดยไม่ได้รับอนุญาต</li>
        </ul>
      ),
    },
    {
      id: "use",
      title: "การใช้งานที่ยอมรับได้",
      body: (
        <ul>
          <li>ห้ามใช้บริการเพื่อการที่ผิดกฎหมาย หลอกลวง (เช่น ฟอร์มหลอกเอารหัสผ่านหรือข้อมูลบัตร) ละเมิดสิทธิผู้อื่น หรือส่งมัลแวร์</li>
          <li>ห้ามพยายามเข้าถึงข้อมูลขององค์กรอื่น ทดสอบเจาะระบบโดยไม่ได้รับอนุญาต หรือใช้งานจนกระทบผู้ใช้อื่น</li>
          <li>เราอาจระงับการใช้งานที่ฝ่าฝืนเพื่อปกป้องระบบและผู้ใช้อื่น โดยจะแจ้งให้ทราบเท่าที่ทำได้</li>
        </ul>
      ),
    },
    {
      id: "content",
      title: "ข้อมูลของลูกค้า",
      body: (
        <ul>
          <li>ข้อมูลที่ลูกค้าสร้างหรือเก็บผ่านบริการ (ฟอร์ม คำตอบ ไฟล์) เป็นของลูกค้า เราใช้เพื่อให้บริการตามข้อกำหนดนี้เท่านั้น</li>
          <li>ลูกค้าส่งออกข้อมูลได้ตลอดเวลาผ่านรายงาน/ไฟล์ Excel/PDF/API ตามแพ็กเกจ</li>
          <li>ลูกค้ารับรองว่ามีสิทธิและฐานทางกฎหมายในการเก็บข้อมูลที่ให้ผู้อื่นกรอก และจะแจ้งวัตถุประสงค์การเก็บข้อมูล (privacy notice) แก่ผู้กรอกฟอร์ม — ฟอร์มสาธารณะมีช่องให้ใส่ประกาศของลูกค้าเอง</li>
          <li>หลีกเลี่ยงการเก็บข้อมูลส่วนบุคคลอ่อนไหว (เช่น ข้อมูลสุขภาพ ศาสนา ข้อมูลชีวภาพ ประวัติอาชญากรรม) เว้นแต่มีฐานตามมาตรา 26 และได้รับความยินยอมโดยชัดแจ้งเมื่อกฎหมายกำหนด</li>
        </ul>
      ),
    },
    {
      id: "dpa",
      title: "ข้อตกลงการประมวลผลข้อมูลส่วนบุคคล",
      body: (
        <>
          <p>สำหรับข้อมูลส่วนบุคคลที่อยู่ในข้อมูลของลูกค้า ลูกค้าเป็นผู้ควบคุมข้อมูล และผู้ให้บริการเป็นผู้ประมวลผลข้อมูลตามมาตรา 40 โดยผู้ให้บริการจะ:</p>
          <ul>
            <li>ประมวลผลตามคำสั่งของลูกค้าเท่านั้น (การตั้งค่าและการใช้งานระบบของลูกค้าถือเป็นคำสั่ง) และไม่ใช้เพื่อวัตถุประสงค์อื่น</li>
            <li>ให้บุคลากรที่เข้าถึงข้อมูลมีหน้าที่รักษาความลับ และเข้าถึงเท่าที่จำเป็นต่อการให้บริการหรือแก้ปัญหาที่ลูกค้าร้องขอ</li>
            <li>จัดให้มีมาตรการรักษาความปลอดภัยที่เหมาะสม ตามที่ระบุใน<Link href="/privacy#security">นโยบายความเป็นส่วนตัว</Link></li>
            <li>ใช้ผู้ประมวลผลช่วงตามรายการใน<Link href="/privacy#share">นโยบายความเป็นส่วนตัว</Link> และแจ้งล่วงหน้าเมื่อเพิ่มหรือเปลี่ยนรายที่สำคัญ โดยผูกพันผู้ประมวลผลช่วงด้วยหน้าที่คุ้มครองข้อมูลไม่น้อยกว่าข้อตกลงนี้</li>
            <li>ช่วยลูกค้าตอบคำขอใช้สิทธิของเจ้าของข้อมูล เท่าที่ระบบและข้อมูลที่มีเอื้ออำนวย</li>
            <li>แจ้งลูกค้าโดยไม่ชักช้าเมื่อทราบเหตุละเมิดข้อมูลส่วนบุคคลที่เกี่ยวกับข้อมูลของลูกค้า พร้อมรายละเอียดเท่าที่มี เพื่อให้ลูกค้าแจ้ง สคส. ได้ภายใน 72 ชั่วโมง</li>
            <li>จัดทำบันทึกรายการกิจกรรมการประมวลผลตามมาตรา 40 วรรคสาม</li>
            <li>เมื่อสิ้นสุดบริการ ลบข้อมูลของลูกค้าภายใน 90 วัน (ลูกค้าส่งออกข้อมูลก่อนได้) เว้นแต่กฎหมายกำหนดให้เก็บ</li>
          </ul>
        </>
      ),
    },
    {
      id: "ai",
      title: "ฟีเจอร์ AI",
      body: <p>ผลลัพธ์จาก AI (ฟอร์มที่สร้าง ผลตรวจรูป ค่าที่อ่านจากเอกสาร) เป็นข้อเสนอแนะ อาจคลาดเคลื่อน ผู้ใช้ต้องตรวจสอบก่อนใช้งาน การใช้ฟีเจอร์ AI นับเครดิตตามแพ็กเกจ และส่งข้อมูลที่เกี่ยวข้องไปยังผู้ให้บริการโมเดลตามที่ระบุในนโยบายความเป็นส่วนตัว</p>,
    },
    {
      id: "fees",
      title: "แพ็กเกจและค่าบริการ",
      body: (
        <ul>
          <li>โควตาและฟีเจอร์เป็นไปตามแพ็กเกจที่เลือก ข้อมูลเดิมที่เกินโควตายังใช้ได้ แต่เพิ่มใหม่ไม่ได้จนกว่าจะอัปเกรดหรือลดการใช้งาน</li>
          <li>ค่าบริการชำระล่วงหน้าตามรอบ เมื่อหมดอายุและพ้นระยะผ่อนผัน บัญชีจะกลับเป็นแพ็กเกจฟรีโดยข้อมูลไม่ถูกลบ</li>
          <li>เราอาจปรับราคาโดยแจ้งล่วงหน้าไม่น้อยกว่า 30 วัน การเปลี่ยนแปลงมีผลในรอบถัดไป</li>
        </ul>
      ),
    },
    {
      id: "availability",
      title: "ความพร้อมให้บริการ",
      body: <p>เราพยายามให้บริการต่อเนื่อง แต่อาจมีการหยุดเพื่อบำรุงรักษาหรือเหตุสุดวิสัย บริการให้ “ตามสภาพ” ลูกค้าควรส่งออกข้อมูลสำคัญเก็บไว้ตามความจำเป็นของตน</p>,
    },
    {
      id: "liability",
      title: "ข้อจำกัดความรับผิด",
      body: <p>เท่าที่กฎหมายอนุญาต ผู้ให้บริการไม่รับผิดในความเสียหายทางอ้อมหรือการสูญเสียกำไร และความรับผิดรวมไม่เกินค่าบริการที่ลูกค้าชำระในช่วง 12 เดือนก่อนเกิดเหตุ ทั้งนี้ไม่จำกัดความรับผิดที่กฎหมายห้ามจำกัด</p>,
    },
    {
      id: "termination",
      title: "การยกเลิก",
      body: <p>ลูกค้ายกเลิกได้ตลอดเวลาโดยติดต่อเราหรือหยุดต่ออายุ ผู้ให้บริการอาจยกเลิกเมื่อลูกค้าฝ่าฝืนข้อกำหนดอย่างร้ายแรงและไม่แก้ไขภายในเวลาที่แจ้ง ข้อมูลจะถูกจัดการตามหัวข้อข้อตกลงการประมวลผลข้อมูล</p>,
    },
    {
      id: "law",
      title: "กฎหมายที่ใช้บังคับ",
      body: <p>ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย ข้อพิพาทให้อยู่ในเขตอำนาจศาลไทย</p>,
    },
    {
      id: "contact",
      title: "ติดต่อ",
      body: <LegalContact />,
    },
  ];

  const sectionsEn: LegalSection[] = [
    { id: "service", title: "The service", body: <p>KROK ({LEGAL.name} — the “Provider”) provides a system for building digital forms, collecting data, documents, approvals and integrations through its website and app. By signing up or using the service, you (the “User”, and the organisation you represent — the “Customer”) accept these terms.</p> },
    { id: "account", title: "Accounts and security", body: (
      <ul>
        <li>Users must provide accurate information, keep passwords confidential and are responsible for activity under their account.</li>
        <li>The person who creates a workspace is its account owner (billing owner) and can manage its members, permissions, plan and data.</li>
        <li>Tell us immediately if you notice unauthorised access to your account.</li>
      </ul>
    ) },
    { id: "use", title: "Acceptable use", body: (
      <ul>
        <li>Do not use the service for anything unlawful or deceptive (e.g. forms that phish for passwords or card details), to infringe others&apos; rights, or to distribute malware.</li>
        <li>Do not try to access other organisations&apos; data, run unauthorised penetration tests, or use the service in a way that degrades it for others.</li>
        <li>We may suspend usage that breaches these rules to protect the system and other users, with notice where practicable.</li>
      </ul>
    ) },
    { id: "content", title: "Customer data", body: (
      <ul>
        <li>Data the Customer creates or collects through the service (forms, answers, files) belongs to the Customer. We use it only to provide the service under these terms.</li>
        <li>The Customer can export data at any time via reports, Excel/PDF files or the API, depending on the plan.</li>
        <li>The Customer warrants it has the right and a lawful basis to collect the data it asks others to enter, and will give respondents a privacy notice — public forms include a field for the Customer&apos;s own notice.</li>
        <li>Avoid collecting sensitive personal data (e.g. health, religion, biometrics, criminal records) unless permitted under Section 26 and with explicit consent where the law requires.</li>
      </ul>
    ) },
    { id: "dpa", title: "Personal data processing terms", body: (
      <>
        <p>For personal data within Customer data, the Customer is the data controller and the Provider is the data processor under Section 40. The Provider will:</p>
        <ul>
          <li>Process data only on the Customer&apos;s instructions (the Customer&apos;s configuration and use of the system are its instructions) and for no other purpose.</li>
          <li>Ensure personnel with access are bound by confidentiality and access data only as needed to provide the service or resolve issues the Customer raises.</li>
          <li>Maintain appropriate security measures as described in the <Link href="/privacy#security">Privacy Policy</Link>.</li>
          <li>Use the sub-processors listed in the <Link href="/privacy#share">Privacy Policy</Link>, give advance notice of material additions or changes, and bind sub-processors to obligations no less protective than these terms.</li>
          <li>Help the Customer respond to data subject requests, as far as the system and available data allow.</li>
          <li>Notify the Customer without undue delay after becoming aware of a personal data breach involving Customer data, with available details, so the Customer can notify the PDPC within 72 hours.</li>
          <li>Keep records of processing activities under Section 40, paragraph three.</li>
          <li>Delete Customer data within 90 days after the service ends (the Customer may export it first), unless the law requires retention.</li>
        </ul>
      </>
    ) },
    { id: "ai", title: "AI features", body: <p>AI output (generated forms, photo checks, values read from documents) is a suggestion and may be wrong; users must review it before use. AI usage consumes credits according to the plan and sends the relevant data to the model provider as described in the Privacy Policy.</p> },
    { id: "fees", title: "Plans and fees", body: (
      <ul>
        <li>Quotas and features follow the selected plan. Existing data over a quota remains usable, but new items cannot be added until the plan is upgraded or usage is reduced.</li>
        <li>Fees are paid in advance per billing cycle. After expiry and the grace period, the account returns to the free plan without deleting data.</li>
        <li>We may change prices with at least 30 days&apos; notice, effective from the next cycle.</li>
      </ul>
    ) },
    { id: "availability", title: "Availability", body: <p>We aim to keep the service running continuously but it may be interrupted for maintenance or force majeure. The service is provided “as is”; Customers should export important data as their own needs require.</p> },
    { id: "liability", title: "Limitation of liability", body: <p>To the extent permitted by law, the Provider is not liable for indirect losses or loss of profit, and total liability is capped at the fees the Customer paid in the 12 months before the event. This does not limit liability that cannot be limited by law.</p> },
    { id: "termination", title: "Termination", body: <p>The Customer may cancel at any time by contacting us or not renewing. The Provider may terminate if the Customer materially breaches these terms and does not remedy the breach within the notified period. Data is then handled as set out in the data processing terms.</p> },
    { id: "law", title: "Governing law", body: <p>These terms are governed by Thai law, and disputes fall under the jurisdiction of the Thai courts.</p> },
    { id: "contact", title: "Contact", body: <LegalContact en /> },
  ];

  return (
    <LegalDoc docs={{
      th: {
        title: "ข้อกำหนดการใช้งาน",
        intro: <p>โปรดอ่านข้อกำหนดนี้ก่อนใช้บริการ KROK ข้อกำหนดนี้รวมถึงข้อตกลงการประมวลผลข้อมูลส่วนบุคคลระหว่างลูกค้าและผู้ให้บริการ</p>,
        sections,
        other: { href: "/privacy", label: "นโยบายความเป็นส่วนตัว" },
      },
      en: {
        title: "Terms of Service",
        intro: <p>Please read these terms before using KROK. They include the personal data processing terms between the Customer and the Provider.</p>,
        sections: sectionsEn,
        other: { href: "/privacy", label: "Privacy Policy" },
      },
    }} />
  );
}
