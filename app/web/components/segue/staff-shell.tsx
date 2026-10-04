"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Gauge, LogOut, Menu, PlaneLanding, Radio, Route, ShieldCheck, Truck, UserRound, X, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/arc/avatar/avatar";
import { Button } from "@/components/arc/button/button";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { api, isStatus, useResource, type Role } from "@/lib/api";
import { PageTitle } from "@/lib/i18n";
import { ErrorState, LogoTile } from "./ui";
import styles from "./shell.module.css";

type Group = "admin" | "team" | "account";
type SubPage = { href: string; label: string };
type Page = { href: string; label: string; title: string; icon: LucideIcon; roles: Role[]; group: Group; pages?: SubPage[] };

/** Every staff page. A role's own page opens on its dashboard; its other pages sit under it in the sidebar. */
const PAGES: Page[] = [
  { href: "/console", label: "Control panel", title: "Control panel", icon: Gauge, roles: ["admin"], group: "admin", pages: [
    { href: "/console/flights", label: "Tracked flights" },
    { href: "/console/dead-letters", label: "Dead letters" },
    { href: "/console/audit", label: "Audit log" },
  ] },
  { href: "/demo", label: "Live demo", title: "Live demo", icon: Activity, roles: ["admin"], group: "admin" },
  { href: "/ops", label: "Ops board", title: "Ops controller", icon: Route, roles: ["ops", "admin"], group: "team", pages: [
    { href: "/ops/connections", label: "Connections" },
    { href: "/ops/actions", label: "Suggested actions" },
  ] },
  { href: "/crew", label: "Crew list", title: "Cabin crew", icon: PlaneLanding, roles: ["crew", "admin"], group: "team", pages: [
    { href: "/crew/list", label: "Call-off list" },
  ] },
  { href: "/ground", label: "Ground queue", title: "Ground handler", icon: Truck, roles: ["ground", "admin"], group: "team", pages: [
    { href: "/ground/open", label: "Open jobs" },
    { href: "/ground/done", label: "Done" },
  ] },
  { href: "/authority", label: "Fast-track", title: "Airport authority", icon: ShieldCheck, roles: ["authority", "admin"], group: "team", pages: [
    { href: "/authority/requests", label: "Requests" },
  ] },
  { href: "/account", label: "Account", title: "Your account", icon: UserRound, roles: ["ops", "crew", "ground", "authority", "admin"], group: "account" },
];

const ROLE_HOME: Record<Role, string> = { ops: "/ops", crew: "/crew", ground: "/ground", authority: "/authority", admin: "/console" };
const ROLE_LABEL: Record<Role, string> = { ops: "Ops controller", crew: "Cabin crew", ground: "Ground handler", authority: "Airport authority", admin: "Admin" };

export function homeFor(role: string): string {
  return ROLE_HOME[role as Role] ?? "/login";
}

/** Sidebar groups: an admin sees the admin tools, then every team's view; everyone else sees their own workspace. */
function groupsFor(role: Role): { label: string; pages: Page[] }[] {
  const mine = PAGES.filter((entry) => entry.roles.includes(role));
  const pick = (group: Group) => mine.filter((entry) => entry.group === group);
  return [
    ...(role === "admin" ? [{ label: "Admin", pages: pick("admin") }] : []),
    { label: role === "admin" ? "Team views" : "Workspace", pages: pick("team") },
    { label: "You", pages: pick("account") },
  ].filter((group) => group.pages.length > 0);
}

export function StaffShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useResource(api.authMe);
  const [leaving, setLeaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const page = PAGES.find((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`));
  const subPage = page?.pages?.find((entry) => entry.href === pathname);

  const user = auth.data;
  const signedOut = isStatus(auth.error, 401, 403);
  const allowed = !!user && !!page && page.roles.includes(user.role);
  useEffect(() => {
    if (signedOut) router.replace("/login");
    else if (user && !allowed) router.replace(homeFor(user.role));
  }, [signedOut, user, allowed, router]);

  // The phone menu closes on Escape; links close it themselves.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  async function logout() {
    setLeaving(true);
    try { await api.logout(); } catch { /* the session is dropped locally either way */ }
    router.replace("/login");
  }

  const groups = user ? groupsFor(user.role) : [];

  return (
    <div className={styles.app}>
      <PageTitle title={subPage ? `${subPage.label} · ${page?.title}` : page?.title ?? "Staff"} />
      <a href="#main" className={styles.skip}>Skip to content</a>
      <header className={styles.topbar}>
        {user ? (
          <button type="button" className={styles.menuButton} aria-expanded={menuOpen} aria-controls="staff-nav" onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X width={20} height={20} aria-hidden="true" /> : <Menu width={20} height={20} aria-hidden="true" />}
            <span className="sr-only">Menu</span>
          </button>
        ) : null}
        <Link href={user ? homeFor(user.role) : "/login"} className={styles.brand} aria-label="Segue home">
          <LogoTile size={30} decorative />
          <span className={styles.wordmark} aria-hidden="true">Segue</span>
        </Link>
        {user ? <span className={`${styles.roleChip} way`}>{ROLE_LABEL[user.role] ?? user.role}</span> : null}
        {user ? (
          <div className={styles.user}>
            <Avatar name={user.email.split("@")[0]?.replace(/[._-]+/g, " ") || user.email} size="sm" />
            <span className={styles.email}>{user.email}</span>
            <Button variant="ghost" size="sm" onClick={logout} loading={leaving}>
              <LogOut width={16} height={16} aria-hidden="true" /> Log out
            </Button>
          </div>
        ) : null}
      </header>

      <div className={styles.frame}>
        {user ? (
          <aside id="staff-nav" className={styles.sidebar} data-open={menuOpen || undefined}>
            <nav aria-label="Staff pages">
              {groups.map((group) => (
                <div key={group.label} className={styles.group}>
                  <p className={`${styles.groupLabel} way`}>{group.label}</p>
                  <ul className={styles.navList}>
                    {group.pages.map((entry) => {
                      const active = entry.href === page?.href;
                      // A role's own pages are always listed; an admin sees a team's pages once inside that team's view.
                      const showPages = entry.pages && (user.role !== "admin" || active || entry.group === "admin");
                      return (
                        <li key={entry.href}>
                          <Link href={entry.href} className={styles.navLink} data-active={active || undefined} aria-current={pathname === entry.href ? "page" : undefined} onClick={() => setMenuOpen(false)}>
                            <entry.icon width={18} height={18} aria-hidden="true" />
                            {entry.label}
                          </Link>
                          {showPages ? (
                            <ul className={styles.subList}>
                              {entry.pages!.map((sub) => (
                                <li key={sub.href}>
                                  <Link href={sub.href} className={styles.subLink} aria-current={pathname === sub.href ? "page" : undefined} onClick={() => setMenuOpen(false)}>{sub.label}</Link>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>
        ) : null}
        {menuOpen ? <div className={styles.scrim} aria-hidden="true" onClick={() => setMenuOpen(false)} /> : null}

        <main id="main" tabIndex={-1} className={styles.content}>
          {user && allowed ? (
            <Suspense fallback={<div className={styles.wait}><Skeleton label="Loading" lines={4} /></div>}>{children}</Suspense>
          ) : auth.loading || signedOut || user ? (
            <div className={styles.wait}><Skeleton label="Checking your sign-in" lines={4} /></div>
          ) : (
            <ErrorState error={auth.error} onRetry={() => void auth.reload()} title="We couldn't check your sign-in" />
          )}
        </main>
      </div>
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
  return <span className={`${styles.liveState} way`} role="status" data-state={state}><Radio width={14} height={14} aria-hidden="true" />{state === "open" ? "Live" : state === "connecting" ? "Connecting…" : "Reconnecting…"}</span>;
}
