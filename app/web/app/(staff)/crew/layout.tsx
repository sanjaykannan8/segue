import type { ReactNode } from "react";
import { CrewProvider } from "./crew-list";

export default function CrewLayout({ children }: { children: ReactNode }) {
  return <CrewProvider>{children}</CrewProvider>;
}
