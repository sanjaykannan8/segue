import type { ReactNode } from "react";
import { OpsProvider } from "./ops-board";

export default function OpsLayout({ children }: { children: ReactNode }) {
  return <OpsProvider>{children}</OpsProvider>;
}
