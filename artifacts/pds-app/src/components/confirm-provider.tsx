import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Confirmation = { title: string; description?: string };
type Confirm = (confirmation: Confirmation) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Accessible replacement for browser confirm(), shared by all destructive actions. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const resolver = useRef<((accepted: boolean) => void) | null>(null);

  const confirm: Confirm = (next) => new Promise((resolve) => {
    resolver.current = resolve;
    setConfirmation(next);
  });

  function settle(accepted: boolean) {
    resolver.current?.(accepted);
    resolver.current = null;
    setConfirmation(null);
  }

  return <ConfirmContext.Provider value={confirm}>
    {children}
    <Dialog open={confirmation !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirmation?.title}</DialogTitle>
          {confirmation?.description ? <DialogDescription>{confirmation.description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => settle(false)}>{t("actions.cancel")}</Button>
          <Button type="button" variant="destructive" onClick={() => settle(true)}>{t("actions.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </ConfirmContext.Provider>;
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used within ConfirmProvider");
  return confirm;
}
