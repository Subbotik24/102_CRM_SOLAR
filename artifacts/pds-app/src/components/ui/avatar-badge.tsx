import { cn } from '@/lib/utils';

export const AVATAR_PRESETS: Record<string, { bg: string; label: string }> = {
  '1': { bg: 'bg-blue-500',    label: 'Синій' },
  '2': { bg: 'bg-emerald-500', label: 'Зелений' },
  '3': { bg: 'bg-violet-500',  label: 'Фіолетовий' },
  '4': { bg: 'bg-orange-500',  label: 'Помаранчевий' },
  '5': { bg: 'bg-rose-500',    label: 'Рожевий' },
  '6': { bg: 'bg-amber-500',   label: 'Бурштиновий' },
};

interface AvatarBadgeProps {
  name: string;
  avatarKey?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export function AvatarBadge({ name, avatarKey = '1', size = 'md', className, onClick }: AvatarBadgeProps) {
  const preset = AVATAR_PRESETS[avatarKey ?? '1'] ?? AVATAR_PRESETS['1'];
  const sizeClass = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
  }[size];

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-white shrink-0 select-none',
        preset.bg,
        sizeClass,
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity',
        className
      )}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

interface AvatarPickerProps {
  current?: string | null;
  onChange: (key: string) => void;
  className?: string;
}

export function AvatarPicker({ current = '1', onChange, className }: AvatarPickerProps) {
  return (
    <div className={cn('flex gap-2 flex-wrap', className)}>
      {Object.entries(AVATAR_PRESETS).map(([key, preset]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          title={preset.label}
          className={cn(
            'h-8 w-8 rounded-full transition-all duration-150',
            preset.bg,
            current === key
              ? 'ring-2 ring-offset-2 ring-foreground scale-110'
              : 'opacity-60 hover:opacity-100 hover:scale-105'
          )}
        />
      ))}
    </div>
  );
}
