"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { homeFor } from "@/components/segue/staff-shell";
import { FormError, LogoTile, Mascot } from "@/components/segue/ui";
import { api, isStatus } from "@/lib/api";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Already signed in: go to the right screen.
  useEffect(() => {
    let alive = true;
    api.authMe().then((user) => { if (alive) router.replace(homeFor(user.role)); }).catch(() => {});
    return () => { alive = false; };
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) { setError(new Error("Enter your email and password.")); return; }
    setBusy(true);
    setError(null);
    try {
      const user = await api.login(email.trim(), password);
      router.replace(homeFor(user.role));
    } catch (caught) {
      setError(isStatus(caught, 400, 401, 403, 422) ? new Error("That email and password don't match.") : caught);
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.head}>
          <LogoTile size={48} />
          <Mascot pose="wink" size={56} />
        </div>
        <h1 className={styles.title}>Staff sign-in</h1>
        <p className={styles.intro}>For ops, crew, ground and airport teams.</p>
        <form className={styles.form} onSubmit={submit} noValidate>
          <Input label="Email" type="email" name="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Input label="Password" type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <FormError error={error} />
          <Button type="submit" size="lg" loading={busy}>Sign in</Button>
        </form>
      </div>
    </main>
  );
}
