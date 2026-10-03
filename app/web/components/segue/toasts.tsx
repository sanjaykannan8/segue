"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import Toast from "@/components/arc/toast/toast";
import styles from "./toasts.module.css";

type Item = { id: number; title: string; description?: string; open: boolean };
type Notify = (title: string, description?: string) => void;

const ToastContext = createContext<Notify>(() => {});

/** Raise a toast from anywhere: `const notify = useToast(); notify("Saved")`. */
export function useToast(): Notify {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const next = useRef(1);

  const notify = useCallback<Notify>((title, description) => {
    const id = next.current++;
    // Keep the stack short so it never covers the screen.
    setItems((current) => [...current.slice(-2), { id, title, description, open: true }]);
  }, []);

  const close = useCallback((id: number) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, open: false } : item)));
    // The toast plays its own exit; drop it once that has finished.
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 500);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className={styles.host}>
        {items.map((item) => (
          <div className={styles.slot} key={item.id}>
            <Toast title={item.title} description={item.description} open={item.open} onOpenChange={(open) => { if (!open) close(item.id); }} duration={5000} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
