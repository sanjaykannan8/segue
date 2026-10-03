import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/segue/staff-shell";

export const metadata: Metadata = { title: "Staff" };

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <StaffShell>{children}</StaffShell>;
}
