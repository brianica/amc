import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { supabaseConfigured, supabaseServer } from "./auth";

export type ErrorCategory = "careless" | "concept" | "no_path" | "triage";
export type ResponseStatus = "incorrect" | "blank";
export type TimeBucket = "under1" | "1to3" | "3to6" | "over6";

export interface AttemptRecord {
  id: string;
  user_id: string;
  exam_id: string;
  taken_on: string;
  mode: "paper" | "online";
  answers: string;
  duration_min: number | null;
  score: number;
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

export interface Store {
  listAttempts(userId: string): Promise<AttemptRecord[]>;
  listLogs(userId: string): Promise<ProblemLogRecord[]>;
  createAttempt(input: Omit<AttemptRecord, "id" | "created_at">): Promise<string>;
  replaceLogs(userId: string, attemptId: string, logs: ProblemLogRecord[]): Promise<void>;
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

  async replaceLogs(userId: string, attemptId: string, logs: ProblemLogRecord[]): Promise<void> {
    const db = await supabaseServer();
    const del = await db.from("problem_logs").delete().eq("attempt_id", attemptId);
    if (del.error) throw new Error(del.error.message);
    if (logs.length === 0) return;
    const { error } = await db.from("problem_logs").insert(logs);
    if (error) throw new Error(error.message);
  }
}

/** File-backed store for local development only; never reachable in production. */
class DevStore implements Store {
  private readonly path = join(process.cwd(), ".dev-data", "db.json");

  private async read(): Promise<{ attempts: AttemptRecord[]; logs: ProblemLogRecord[] }> {
    try {
      return JSON.parse(await readFile(this.path, "utf8"));
    } catch {
      return { attempts: [], logs: [] };
    }
  }

  private async write(db: { attempts: AttemptRecord[]; logs: ProblemLogRecord[] }): Promise<void> {
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

  async replaceLogs(userId: string, attemptId: string, logs: ProblemLogRecord[]): Promise<void> {
    const db = await this.read();
    db.logs = db.logs.filter((l) => !(l.attempt_id === attemptId && l.user_id === userId));
    db.logs.push(...logs);
    await this.write(db);
  }
}

export function getStore(): Store {
  return supabaseConfigured() ? new SupabaseStore() : new DevStore();
}
