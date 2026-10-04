import type { ReactNode } from "react";
import { AuthorityProvider } from "./authority-list";

export default function AuthorityLayout({ children }: { children: ReactNode }) {
  return <AuthorityProvider>{children}</AuthorityProvider>;
}
