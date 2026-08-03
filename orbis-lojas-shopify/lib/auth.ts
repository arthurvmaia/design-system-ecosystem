import { getChatGPTUser } from "@/app/chatgpt-auth";
import type { Viewer } from "@/lib/types";

export async function getIdentity(): Promise<Omit<Viewer, "role"> | null> {
  const platformUser = await getChatGPTUser();
  if (platformUser) {
    return {
      id: platformUser.userId,
      email: platformUser.email,
      name: platformUser.displayName,
    };
  }

  if (process.env.NODE_ENV === "development" || process.env.APP_DEMO_MODE === "true") {
    return {
      id: "local-demo-owner",
      email: "demo@orbis.local",
      name: "Loja Demo",
    };
  }

  return null;
}
