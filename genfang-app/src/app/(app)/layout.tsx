import { redirect } from "next/navigation";
import { TabBar } from "@/components/tabbar";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getOverview } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  if (s.role === "superadmin") redirect("/ejer"); // platformens ejer ser aldrig virksomhedernes sager
  const o = getOverview(s.tid, s.uid);
  if (!o) redirect("/login");
  return (
    <div className="shell">
      <TabBar pending={o.counts.urgent + o.counts.pendingApprovals - o.pending.filter((p) => p.urgency === "akut").length} tenant={o.tenant.name} isOwner={can(s.role, "view_analytics")} />
      <div>{children}</div>
    </div>
  );
}
