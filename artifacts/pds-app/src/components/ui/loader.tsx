import { Loader2 } from "lucide-react";

export function FullPageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background" data-testid="loader-full-page">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
