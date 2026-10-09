"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUserWorkspace } from "@/lib/queries";
import { checkRateLimit, mutationRateLimit } from "@/lib/rate-limit";
import { deleteSubscriber } from "@/lib/subscribers";

/** Permanently delete one subscriber from the owner's list. */
export async function deleteSubscriberAction(subscriberId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  const rl = await checkRateLimit(mutationRateLimit, session.user.id);
  if (!rl.success) return { error: "Too many requests. Please slow down." };

  if (!z.uuid().safeParse(subscriberId).success) return { error: "Invalid input" };

  const workspace = await getUserWorkspace(session.user.id);
  if (!workspace) return { error: "Unauthorized" };

  const deleted = await deleteSubscriber(db, { workspaceId: workspace.id, id: subscriberId });
  if (!deleted) return { error: "Subscriber not found" };

  revalidatePath("/dashboard/subscribers");
  return { success: true };
}
