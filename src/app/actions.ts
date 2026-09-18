"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { getStore } from "@/lib/store";

/** Change whether a recorded sitting counts toward the analytics. */
export async function setAttemptCounted(attemptId: string, counted: boolean): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/login");

  await getStore().setAttemptIncluded(user.id, attemptId, counted);
  revalidatePath("/");
  revalidatePath("/dashboard");
}
