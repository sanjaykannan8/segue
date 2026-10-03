"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Radio } from "lucide-react";
import { Avatar } from "@/components/arc/avatar/avatar";
import { Button } from "@/components/arc/button/button";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { api, isStatus, useResource, type Role, type StaffUser } from "@/lib/api";
import { ErrorState, LogoTile } from "./ui";
import styles from "./shell.module.css";

const PAGES: { href: string; label: string; roles: Role[] }[] = [
  { href: "/ops", label: "Ops board", roles: ["ops", "admin"] },
  { href: "/crew", label: "Crew list", roles: ["crew", "admin"] },
  { href: "/ground", label: "Ground queue", roles: ["ground", "admin"] },
  { href: "/authority", label: "Fast-track", roles: ["authority", "admin"] },
  { href: "/demo", label: "Demo", roles: ["admin"] },
  { href: "/console", label: "Control panel", roles: ["admin"] },
];

export const ROLE_HOME: Record<Role, string> = { ops: "/ops", crew: "/crew", ground: "/ground", authority: "/authority", admin: "/console" };
const ROLE_LABEL: Record<Role, string> = { ops: "Ops controller", crew: "Cabin crew", ground: "Ground handler", authority: "Airport authority", admin: "Admin" };

export function homeFor(role: string): string {
  return ROLE_HOME[role as Role] ?? "/login";
}

const StaffContext = createContext<StaffUser | null>(null);

/** The signed-in staff member. Only used under the staff layout, which guards it. */
export function useStaff(): StaffUser {
  const user = useContext(StaffContext);
  if (!user) throw new Error("useStaff must be used inside the staff layout");
  return user;
}

export function StaffShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useResource(api.authMe);
  const [leaving, setLeaving] = useState(false);
  const page = PAGES.find((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`));

  const user = auth.data;
  const signedOut = isStatus(auth.error, 401, 403);
  const allowed = !!user && !!page && page.roles.includes(user.role);
  useEffect(() => {
    if (signedOut) router.replace("/login");
    else if (user && !allowed) router.replace(homeFor(user.role));
  }, [signedOut, user, allowed, router]);

  async function logout() {
    setLeaving(true);
    try { await api.logout(); } catch { /* the session is dropped locally either way */ }
    router.replace("/login");
  }

  const links = user ? PAGES.filter((entry) => entry.roles.includes(user.role)) : [];

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={`${styles.barInner} ${styles.wide}`}>
          <Link href={user ? homeFor(user.role) : "/login"} className={styles.brand} aria-label="Segue home">
            <LogoTile size={36} />
          </Link>
          <nav className={styles.nav} aria-label="Staff pages">
            {links.map((entry) => (
              <Link key={entry.href} href={entry.href} className={styles.link} aria-current={entry.href === page?.href ? "page" : undefined}>{entry.label}</Link>
            ))}
          </nav>
          {user ? (
            <div className={styles.user}>
              <Avatar name={user.email.split("@")[0]?.replace(/[._-]+/g, " ") || user.email} size="sm" />
              <div className={styles.userCopy}>
                <span className={styles.email}>{user.email}</span>
                <span className={styles.role}>{ROLE_LABEL[user.role] ?? user.role}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={logout} loading={leaving}>
                <LogOut width={16} height={16} aria-hidden="true" /> Log out
              </Button>
            </div>
          ) : null}
        </div>
      </header>
      <main className={`${styles.main} ${styles.wide}`}>
        {user && allowed ? (
          <StaffContext.Provider value={user}>{children}</StaffContext.Provider>
        ) : auth.loading || signedOut || user ? (
          <div className={styles.wait}><Skeleton label="Checking your sign-in" lines={4} /></div>
        ) : (
          <ErrorState error={auth.error} onRetry={() => void auth.reload()} title="We couldn't check your sign-in" />
        )}
      </main>
    </div>
  );
}

/** Page title row used by every staff screen. */
export function StaffHeading({ title, hint, aside }: { title: string; hint?: ReactNode; aside?: ReactNode }) {
  return (
    <div className={styles.heading}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {hint ? <p className={styles.hint}>{hint}</p> : null}
      </div>
      {aside ? <div className={styles.aside}>{aside}</div> : null}
    </div>
  );
}

/** Small "live" marker for pages that refresh from the staff stream. */
export function LiveState({ state }: { state: "connecting" | "open" | "retrying" }) {
  return <span className={styles.liveState} role="status"><Radio width={14} height={14} aria-hidden="true" />{state === "open" ? "Live" : state === "connecting" ? "Connecting…" : "Reconnecting…"}</span>;
}
