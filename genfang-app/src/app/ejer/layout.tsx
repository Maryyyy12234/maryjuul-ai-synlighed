import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ejerpanel" };

// Kun GENFANG-platformens ejer. Alle andre får 404 (afslører ikke, at panelet findes).
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  if (s.role !== "superadmin" || s.tid !== "__platform__") notFound();
  return <div className="admin-shell">{children}</div>;
}
