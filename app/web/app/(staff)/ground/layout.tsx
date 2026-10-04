import type { ReactNode } from "react";
import { GroundProvider } from "./ground-queue";

export default function GroundLayout({ children }: { children: ReactNode }) {
  return <GroundProvider>{children}</GroundProvider>;
}
