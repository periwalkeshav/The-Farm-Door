import { Skeleton } from "@/components/ui";

export function ListingSkeleton() {
  return (
    <div>
      <Skeleton className="mb-6 h-12" />
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4]" />
        ))}
      </div>
    </div>
  );
}
