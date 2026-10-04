import type { ReactNode } from "react";
import { TripProvider } from "./trip-data";

export default function TripLayout({ children }: { children: ReactNode }) {
  return <TripProvider>{children}</TripProvider>;
}
