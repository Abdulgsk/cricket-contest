import { Skeleton } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Skeleton className="h-32 md:col-span-1" />
        <Skeleton className="h-32 md:col-span-2" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
