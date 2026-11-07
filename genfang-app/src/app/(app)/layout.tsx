import { TabBar } from "@/components/tabbar";
import { requireSession } from "@/lib/auth";
import { getOverview } from "@/lib/store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const o = getOverview(s.tid, s.uid);
  if (!o) redirect("/login");
  return (
    <div className="shell">
      <TabBar pending={o.counts.pendingApprovals} tenant={o.tenant.name} />
      <div>{children}</div>
    </div>
  );
}
