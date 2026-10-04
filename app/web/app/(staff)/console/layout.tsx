import type { ReactNode } from "react";
import { ConsoleProvider } from "./console-data";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <ConsoleProvider>{children}</ConsoleProvider>;
}
