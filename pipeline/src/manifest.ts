import type { Competition, ExamRef, Form, Scoring } from "./types.js";

const WIKI = "https://artofproblemsolving.com/wiki/index.php";

/**
 * Blank-answer credit changed over the years. These are the intended values, but
 * every generated exam carries needsVerification until `fetch` confirms them against
 * the contest's own page — a wrong blank value silently shifts every score we report.
 */
function scoringFor(competition: Competition, year: number): Scoring {
  if (competition === "AMC8") {
    return { correct: 1, blank: 0, wrong: 0, needsVerification: true };
  }
  const blank = year <= 2001 ? 2 : year <= 2006 ? 2.5 : 1.5;
  return { correct: 6, blank, wrong: 0, needsVerification: true };
}

function examRef(
  competition: Competition,
  year: number,
  form: Form,
  season: "spring" | "fall" | null,
): ExamRef {
  const contestName = competition === "AMC8" ? "AMC_8" : `AMC_${competition.slice(3)}${form ?? ""}`;
  const seasonPart = season === "fall" ? "Fall_" : "";
  const wikiPage = `${year}_${seasonPart}${contestName}_Problems`;
  const idSeason = season === "fall" ? "F" : "";
  const idForm = form ? `-${form}` : "";
  return {
    id: `${competition.toLowerCase()}-${year}${idSeason}${idForm}`,
    competition,
    year,
    season,
    form,
    wikiPage,
    sourceUrl: `${WIKI}/${wikiPage}`,
    numQuestions: 25,
    scoring: scoringFor(competition, year),
  };
}

/**
 * Candidate exams. Some will not exist (cancelled years, single-form early years);
 * `fetch` probes each page and records misses rather than us hardcoding the gaps.
 */
export function candidateExams(): ExamRef[] {
  const out: ExamRef[] = [];

  for (let year = 1999; year <= 2026; year++) {
    out.push(examRef("AMC8", year, null, null));
  }

  for (const competition of ["AMC10", "AMC12"] as const) {
    for (let year = 2000; year <= 2025; year++) {
      // 2000-2001 ran a single unlettered form; A/B split began in 2002.
      const forms: Form[] = year <= 2001 ? [null] : ["A", "B"];
      for (const form of forms) {
        out.push(examRef(competition, year, form, null));
      }
      // 2021 alone has a second, "Fall" sitting after the calendar move to November.
      if (year === 2021) {
        for (const form of ["A", "B"] as const) {
          out.push(examRef(competition, year, form, "fall"));
        }
      }
    }
  }

  return out;
}

/** Exams to seed first, so there is usable AMC 10 data before the full backfill. */
export function priorityExams(): ExamRef[] {
  return candidateExams().filter(
    (e) => e.competition === "AMC10" && e.year >= 2015,
  );
}
