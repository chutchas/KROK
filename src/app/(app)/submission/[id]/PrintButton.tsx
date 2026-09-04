"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui";
import Icon from "@/components/Icon";

export default function PrintButton() {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      <Icon icon={Printer} className="h-4 w-4" /> พิมพ์ / บันทึกเป็น PDF
    </Button>
  );
}
