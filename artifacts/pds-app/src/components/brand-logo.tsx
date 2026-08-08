import { APP_NAME } from '@/lib/branding';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  compact?: boolean;
}

/** A neutral, code-owned logo that works on light and dark surfaces. */
export function BrandLogo({ className, compact = false }: BrandLogoProps) {
  return (
    <div className={cn('inline-flex items-center gap-2 text-primary', className)} aria-label={APP_NAME}>
      <svg viewBox="0 0 48 48" className="h-8 w-8 shrink-0" role="img" aria-hidden="true">
        <circle cx="24" cy="24" r="10" fill="currentColor" opacity=".16" />
        <circle cx="24" cy="24" r="6" fill="currentColor" />
        <path d="M24 3v6M24 39v6M3 24h6M39 24h6M9.15 9.15l4.24 4.24M34.61 34.61l4.24 4.24M38.85 9.15l-4.24 4.24M13.39 34.61l-4.24 4.24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M19 21h10v10H19zM24 16v5M24 31v1M16 24h3M29 24h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {!compact && <span className="font-mono text-xl font-bold tracking-tight">{APP_NAME}</span>}
    </div>
  );
}
