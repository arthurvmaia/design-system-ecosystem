import { getIdentity } from "@/lib/auth";
import {
  buyTokens,
  createVersion,
  deleteProject,
  deleteTheme,
  duplicateProject,
  ensureUser,
  publishProject,
  restoreVersion,
  saveProject,
  toggleFavorite,
  unlockTheme,
} from "@/lib/data";
import { actionSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const viewer = await ensureUser(identity);
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
    }

    const payload = parsed.data;
    switch (payload.action) {
      case "buyTokens":
        return Response.json({ data: await buyTokens(viewer, payload.packageId, payload.idempotencyKey) });
      case "unlockTheme":
        return Response.json(await unlockTheme(viewer, payload.themeId, payload.idempotencyKey));
      case "saveProject":
        return Response.json(await saveProject(viewer, payload.projectId, payload.customization));
      case "createVersion":
        return Response.json(await createVersion(viewer, payload.projectId, payload.label));
      case "restoreVersion":
        return Response.json({ data: await restoreVersion(viewer, payload.projectId, payload.versionId) });
      case "duplicateProject":
        return Response.json({ data: await duplicateProject(viewer, payload.projectId) });
      case "deleteProject":
        return Response.json({ data: await deleteProject(viewer, payload.projectId) });
      case "deleteTheme":
        return Response.json({ data: await deleteTheme(viewer, payload.themeId) });
      case "toggleFavorite":
        return Response.json({ data: await toggleFavorite(viewer, payload.themeId, payload.favorite) });
      case "publishProject":
        return Response.json({ data: await publishProject(viewer, payload.projectId) });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNEXPECTED_ERROR";
    const status = message === "FORBIDDEN" ? 403 : message.includes("NOT_FOUND") ? 404 : message.includes("UNLOCK") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
