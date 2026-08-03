import { AppShell } from "@/app/AppShell";
import { getIdentity } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const identity = await getIdentity();
  return <AppShell identity={identity} />;
}
