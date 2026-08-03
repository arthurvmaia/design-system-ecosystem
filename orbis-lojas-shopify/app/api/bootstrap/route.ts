import { getIdentity } from "@/lib/auth";
import { ensureUser, getBootstrap } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const identity = await getIdentity();
    if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const viewer = await ensureUser(identity);
    return Response.json(await getBootstrap(viewer));
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "UNEXPECTED_ERROR";
}
