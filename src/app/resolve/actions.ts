"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { recordResult, today } from "@/lib/resolve";
import { toCard, toRecord } from "@/lib/resolve-cards";

export async function markResolve(input: {
  examId: string;
  qNumber: number;
  result: "solved" | "failed";
}): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/login");

  const store = getStore();
  const rows = await store.listResolveCards(user.id);
  const row = rows.find((r) => r.exam_id === input.examId && r.q_number === input.qNumber);
  // Gone or already answered on another device: nothing to do, and re-adding it
  // would silently resurrect a card the student has finished with.
  if (!row) return;

  const updated = recordResult(toCard(row), input.result, today());
  await store.upsertResolveCards(user.id, [toRecord(updated, user.id)]);

  revalidatePath("/resolve");
  revalidatePath("/");
}
