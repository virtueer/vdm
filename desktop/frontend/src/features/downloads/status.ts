import type { VariantProps } from 'class-variance-authority';
import type { badgeVariants } from '@/components/ui/badge';
import type { DownloadItem } from '@/features/downloads/types';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

interface StatusMeta {
  label: string;
  badge: BadgeVariant;
  /** Progress indicator tone, applied to the Radix indicator child. */
  bar: string;
  dot: string;
}

const STATUS_META: Record<DownloadItem['status'], StatusMeta> = {
  downloading: { label: 'İndiriliyor', badge: 'info', bar: '[&>div]:bg-info', dot: 'bg-info' },
  paused: { label: 'Duraklatıldı', badge: 'warning', bar: '[&>div]:bg-warning', dot: 'bg-warning' },
  completed: {
    label: 'Tamamlandı',
    badge: 'success',
    bar: '[&>div]:bg-success',
    dot: 'bg-success',
  },
  error: { label: 'Hata', badge: 'destructive', bar: '[&>div]:bg-danger', dot: 'bg-danger' },
  queued: {
    label: 'Kuyrukta',
    badge: 'secondary',
    bar: '[&>div]:bg-muted-foreground/50',
    dot: 'bg-muted-foreground/60',
  },
  pending: {
    label: 'Bekliyor',
    badge: 'secondary',
    bar: '[&>div]:bg-muted-foreground/50',
    dot: 'bg-muted-foreground/60',
  },
  cancelled: {
    label: 'İptal',
    badge: 'outline',
    bar: '[&>div]:bg-muted-foreground/40',
    dot: 'bg-muted-foreground/40',
  },
};

const FALLBACK: StatusMeta = STATUS_META.pending;

export function statusMeta(status: DownloadItem['status']): StatusMeta {
  return STATUS_META[status] ?? FALLBACK;
}
