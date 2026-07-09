import { redirect } from "next/navigation";
import { canManageDataSources } from "@/lib/access-control";
import { getServerSession } from "@/lib/session";

export default async function DataCenterLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();

  if (!session) redirect("/login");
  if (!canManageDataSources(session.role) && !session.platformAdmin) redirect("/advisor");

  return children;
}
