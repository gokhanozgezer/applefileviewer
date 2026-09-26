import { cn } from '@renderer/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // shadcn bg-primary/10 → MASTER bg-surface-2 (YOL B)
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} {...props} />;
}

export { Skeleton };
