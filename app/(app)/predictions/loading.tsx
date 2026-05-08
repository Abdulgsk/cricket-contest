import { Skeleton } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-72" />
    </div>
  );
}
