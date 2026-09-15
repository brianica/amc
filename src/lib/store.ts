import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { supabaseConfigured, supabaseServer } from "./auth";

import type { QuestionTiming } from "./timed";

export type ErrorCategory = "careless" | "concept" | "no_path" | "triage";
export type ResponseStatus = "incorrect" | "blank";
export type TimeBucket = "under1" | "1to3" | "3to6" | "over6";

export interface AttemptRecord {
  id: string;
  user_id: string;
  exam_id: string;
  taken_on: string;
  mode: "paper" | "timed";
  answers: string;
  duration_min: number | null;
  score: number;
  /** False for a sitting the student chose to keep out of the analytics. */
  include_in_stats: boolean;
  /** Per-question seconds and visits; null for a paper sitting logged afterwards. */
  timings: QuestionTiming[] | null;
  created_at: string;
}

export interface ProblemLogRecord {
  attempt_id: string;
  user_id: string;
  q_number: number;
  status: ResponseStatus;
  error_category: ErrorCategory | null;
  time_bucket: TimeBucket | null;
  note: string | null;
}

export interface ResolveCardRecord {
  user_id: string;
  exam_id: string;
  q_number: number;
  stage: number;
  due_on: string | null;
  attempts: number;
  last_result: "solved" | "failed" | null;
}

export interface Store {
  listAttempts(userId: string): Promise<AttemptRecord[]>;
  listLogs(userId: string): Promise<ProblemLogRecord[]>;
  createAttempt(input: Omit<AttemptRecord, "id" | "created_at">): Promise<string>;
  setAttemptIncluded(userId: string, attemptId: string, include: boolean): Promise<void>;
  replaceLogs(userId: string, attemptId: string, logs: ProblemLogRecord[]): Promise<void>;
  listResolveCards(userId: string): Promise<ResolveCardRecord[]>;
  /** Insert or update by (user, exam, question) — a reopened card is the same card. */
  upsertResolveCards(userId: string, cards: ResolveCardRecord[]): Promise<void>;
}

class SupabaseStore implements Store {
  async listAttempts(userId: string): Promise<AttemptRecord[]> {
    const db = await supabaseServer();
    // No user_id filter: row-level security already restricts this to the caller,
    // and relying on the policy rather than the query is the point of using it.
    const { data, error } = await db.from("attempts").select("*").order("taken_on", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as AttemptRecord[];
  }

  async listLogs(userId: string): Promise<ProblemLogRecord[]> {
    const db = await supabaseServer();
    const { data, error } = await db.from("problem_logs").select("*");
    if (error) throw new Error(error.message);
    return (data ?? []) as ProblemLogRecord[];
  }

  async createAttempt(input: Omit<AttemptRecord, "id" | "created_at">): Promise<string> {
    const db = await supabaseServer();
    const { data, error } = await db.from("attempts").insert(input).select("id").single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }

  async setAttemptIncluded(userId: string, attemptId: string, include: boolean): Promise<void> {
    const db = await supabaseServer();
    const { error } = await db.from("attempts").update({ include_in_stats: include }).eq("id", attemptId);
    if (error) throw new Error(error.message);
  }

  async replaceLogs(userId: string, attemptId: string, logs: ProblemLogRecord[]): Promise<void> {
    const db = await supabaseServer();
    const del = await db.from("problem_logs").delete().eq("attempt_id", attemptId);
    if (del.error) throw new Error(del.error.message);
    if (logs.length === 0) return;
    const { error } = await db.from("problem_logs").insert(logs);
    if (error) throw new Error(error.message);
  }

  async listResolveCards(userId: string): Promise<ResolveCardRecord[]> {
    const db = await supabaseServer();
    const { data, error } = await db.from("resolve_cards").select("*");
    if (error) throw new Error(error.message);
    return (data ?? []) as ResolveCardRecord[];
  }

  async upsertResolveCards(userId: string, cards: ResolveCardRecord[]): Promise<void> {
    if (cards.length === 0) return;
    const db = await supabaseServer();
    const { error } = await db
      .from("resolve_cards")
      .upsert(cards.map((c) => ({ ...c, updated_at: new Date().toISOString() })), {
        onConflict: "user_id,exam_id,q_number",
      });
    if (error) throw new Error(error.message);
  }
}

interface DevDb {
  attempts: AttemptRecord[];
  logs: ProblemLogRecord[];
  resolveCards: ResolveCardRecord[];
}

/** File-backed store for local development only; never reachable in production. */
class DevStore implements Store {
  private readonly path = join(process.cwd(), ".dev-data", "db.json");

  private async read(): Promise<DevDb> {
    try {
      const db = JSON.parse(await readFile(this.path, "utf8")) as Partial<DevDb>;
      // resolve_cards arrived after the first seeded files, so tolerate its absence.
      return {
        // include_in_stats arrived later; rows without it were all counted.
        attempts: (db.attempts ?? []).map((a) => ({ ...a, include_in_stats: a.include_in_stats ?? true })),
        logs: db.logs ?? [],
        resolveCards: db.resolveCards ?? [],
      };
    } catch {
      return { attempts: [], logs: [], resolveCards: [] };
    }
  }

  private async write(db: DevDb): Promise<void> {
    await mkdir(join(process.cwd(), ".dev-data"), { recursive: true });
    await writeFile(this.path, JSON.stringify(db, null, 2));
  }

  async listAttempts(userId: string): Promise<AttemptRecord[]> {
    const db = await this.read();
    return db.attempts.filter((a) => a.user_id === userId).sort((a, b) => b.taken_on.localeCompare(a.taken_on));
  }

  async listLogs(userId: string): Promise<ProblemLogRecord[]> {
    return (await this.read()).logs.filter((l) => l.user_id === userId);
  }

  async createAttempt(input: Omit<AttemptRecord, "id" | "created_at">): Promise<string> {
    const db = await this.read();
    const id = randomUUID();
    db.attempts.push({ ...input, id, created_at: new Date().toISOString() });
    await this.write(db);
    return id;
  }

  async setAttemptIncluded(userId: string, attemptId: string, include: boolean): Promise<void> {
    const db = await this.read();
    const found = db.attempts.find((a) => a.id === attemptId && a.user_id === userId);
    if (found) found.include_in_stats = include;
    await this.write(db);
  }

  async replaceLogs(userId: string, attemptId: string, logs: ProblemLogRecord[]): Promise<void> {
    const db = await this.read();
    db.logs = db.logs.filter((l) => !(l.attempt_id === attemptId && l.user_id === userId));
    db.logs.push(...logs);
    await this.write(db);
  }

  async listResolveCards(userId: string): Promise<ResolveCardRecord[]> {
    return (await this.read()).resolveCards.filter((c) => c.user_id === userId);
  }

  async upsertResolveCards(userId: string, cards: ResolveCardRecord[]): Promise<void> {
    const db = await this.read();
    for (const card of cards) {
      const i = db.resolveCards.findIndex(
        (c) => c.user_id === userId && c.exam_id === card.exam_id && c.q_number === card.q_number,
      );
      if (i >= 0) db.resolveCards[i] = card;
      else db.resolveCards.push(card);
    }
    await this.write(db);
  }
}

export function getStore(): Store {
  return supabaseConfigured() ? new SupabaseStore() : new DevStore();
}
