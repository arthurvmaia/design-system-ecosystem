import { z } from "zod";

const idempotencyKey = z.string().min(8).max(120).regex(/^[a-zA-Z0-9:_-]+$/);

export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("buyTokens"), packageId: z.string().min(1).max(60), idempotencyKey }),
  z.object({ action: z.literal("unlockTheme"), themeId: z.string().min(1).max(60), idempotencyKey }),
  z.object({ action: z.literal("saveProject"), projectId: z.string().uuid(), customization: z.record(z.unknown()) }),
  z.object({ action: z.literal("createVersion"), projectId: z.string().uuid(), label: z.string().trim().min(1).max(60) }),
  z.object({ action: z.literal("restoreVersion"), projectId: z.string().uuid(), versionId: z.string().uuid() }),
  z.object({ action: z.literal("duplicateProject"), projectId: z.string().uuid() }),
  z.object({ action: z.literal("deleteProject"), projectId: z.string().uuid() }),
  z.object({ action: z.literal("deleteTheme"), themeId: z.string().min(1).max(60) }),
  z.object({ action: z.literal("toggleFavorite"), themeId: z.string().min(1).max(60), favorite: z.boolean() }),
  z.object({ action: z.literal("publishProject"), projectId: z.string().uuid() }),
]);
