/**
 * The exam's page, anchored at one problem. Shows only the statement, unlike a
 * problem's own page (Problem.sourceUrl), which includes worked solutions below it —
 * this is the one safe to show while a paper is still in progress.
 */
export function problemLink(wikiPage: string, n: number): string {
  return `https://artofproblemsolving.com/wiki/index.php?title=${wikiPage}#Problem_${n}`;
}
