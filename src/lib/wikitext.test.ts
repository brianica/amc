import { describe, expect, it } from "vitest";
import { renderStatement } from "./wikitext";

describe("renderStatement — safety", () => {
  it("escapes HTML in the source rather than passing it through", () => {
    const { html } = renderStatement('How many <script>alert("x")</script> ways?');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes an attribute-injection attempt", () => {
    const { html } = renderStatement(`<img src=x onerror="steal()">`);
    expect(html).not.toContain("onerror=\"");
    expect(html).toContain("&lt;img");
  });

  it("does not let a malformed math tag smuggle markup out", () => {
    const { html } = renderStatement("<math>x</math><b>bold</b>");
    expect(html).toContain("&lt;b&gt;");
  });
});

describe("renderStatement — maths", () => {
  it("renders inline math with KaTeX", () => {
    const { html } = renderStatement("Find <math>x^2 + 1</math> exactly.");
    expect(html).toContain("katex");
    expect(html).not.toContain("<math>");
  });

  it("renders cmath as display maths", () => {
    const { html } = renderStatement("<cmath>\\frac{1}{2}</cmath>");
    expect(html).toContain("katex-display");
  });

  it("renders imath inline, the tag AoPS actually uses in problem statements", () => {
    const { html } = renderStatement("Let <imath>S(n)</imath> equal the sum of digits.");
    expect(html).toContain("katex");
    expect(html).not.toContain("<imath>");
    expect(html).not.toContain("katex-display");
  });

  it("renders bare dollar maths, which some pages use", () => {
    const { html } = renderStatement("The value $n+1$ is even.");
    expect(html).toContain("katex");
  });

  it("treats an escaped dollar sign as a literal dollar, not a maths delimiter", () => {
    // AMC 8 problems are full of these ("Granny Smith has \$63") — \$ is TeX for a
    // literal dollar, and must not be read as the opening of a $...$ maths span
    // that swallows everything up to the next dollar sign in the sentence.
    const { html } = renderStatement("Granny Smith has \\$63. Elberta has \\$2 more.");
    expect(html).toContain("$63");
    expect(html).toContain("$2");
    expect(html).not.toContain("katex");
  });

  it("does not let an escaped dollar consume real maths later in the sentence", () => {
    const { html } = renderStatement("It costs \\$5, and $n+1$ is even.");
    expect(html).toContain("$5");
    expect(html).toContain("katex");
  });

  it("renders a real LaTeX macro rather than leaving it as text", () => {
    const { html } = renderStatement(String.raw`<cmath>r = \frac{a+b-c}{2}</cmath>`);
    // KaTeX emits a fraction element; the raw source also survives in its
    // <annotation>, which is why the check is for the rendered output.
    expect(html).toContain("mfrac");
    expect(html).toContain("katex-display");
  });

  it("keeps unparseable formulas visible instead of dropping them", () => {
    const { html } = renderStatement("<math>\\thisIsNotAMacro{</math>");
    expect(html.length).toBeGreaterThan(10);
  });

  it("leaves prose outside the maths untouched", () => {
    const { html } = renderStatement("Let <math>n</math> be a positive integer.");
    expect(html).toContain("Let");
    expect(html).toContain("be a positive integer.");
  });
});

describe("renderStatement — diagrams", () => {
  it("flags an Asymptote diagram instead of silently dropping it", () => {
    const { html, hasDiagram } = renderStatement(
      "In the figure below, [asy]draw((0,0)--(1,1));[/asy] find the area.",
    );
    expect(hasDiagram).toBe(true);
    expect(html).toContain("statement-diagram");
    expect(html).not.toContain("draw((0,0)");
  });

  it("handles <asy>...</asy> angle-bracket variant", () => {
    const { html, hasDiagram } = renderStatement(
      "In the figure, <asy>draw((0,0)--(1,1));</asy> find the area.",
    );
    expect(hasDiagram).toBe(true);
    expect(html).toContain("statement-diagram");
    expect(html).not.toContain("draw((0,0)");
  });

  it("reports no diagram when there is none", () => {
    expect(renderStatement("A purely verbal problem.").hasDiagram).toBe(false);
  });

  it("links the diagram notice to the original problem when a link is given", () => {
    const { html } = renderStatement(
      "In the figure below, [asy]draw((0,0)--(1,1));[/asy] find the area.",
      "https://artofproblemsolving.com/wiki/index.php?title=2022_AMC_8_Problems#Problem_1",
    );
    expect(html).toContain('<a class="statement-diagram"');
    expect(html).toContain(
      'href="https://artofproblemsolving.com/wiki/index.php?title=2022_AMC_8_Problems#Problem_1"',
    );
    expect(html).toContain('target="_blank"');
  });

  it("falls back to a plain span when no link is given", () => {
    const { html, diagramRendered } = renderStatement("In the figure, [asy]draw((0,0)--(1,1));[/asy] find the area.");
    expect(html).toContain('<span class="statement-diagram"');
    expect(diagramRendered).toBe(false);
  });

  it("embeds a pre-rendered SVG in place of the link when one is given", () => {
    const svg = "<svg><circle r='1'/></svg>";
    const { html, hasDiagram, diagramRendered } = renderStatement(
      "In the figure, [asy]draw((0,0)--(1,1));[/asy] find the area.",
      "https://artofproblemsolving.com/wiki/index.php?title=2022_AMC_8_Problems#Problem_1",
      svg,
    );
    expect(html).toContain('<span class="statement-diagram-svg">');
    expect(html).toContain(svg);
    expect(html).not.toContain('<a class="statement-diagram"');
    expect(hasDiagram).toBe(true);
    expect(diagramRendered).toBe(true);
  });
});

describe("renderStatement — wiki furniture", () => {
  it("drops navigation templates", () => {
    const { html } = renderStatement("Real text.\n\n{{AMC10 box|year=2023|ab=A|num-b=13}}");
    expect(html).toContain("Real text.");
    expect(html).not.toContain("AMC10 box");
  });

  it("drops section headings and file embeds", () => {
    const { html } = renderStatement("== Problem ==\n[[File:diagram.png]]\nThe question.");
    expect(html).not.toContain("Problem ==");
    expect(html).not.toContain("File:");
    expect(html).toContain("The question.");
  });

  it("splits blank-line-separated paragraphs but not wrapped lines", () => {
    const { html } = renderStatement("First line\nwrapped.\n\nSecond para.");
    expect(html).toBe("<p>First line wrapped.</p>\n<p>Second para.</p>");
  });

  it("is empty-safe", () => {
    expect(renderStatement("").html).toBe("");
    expect(renderStatement("   \n\n  ").html).toBe("");
  });
});

describe("renderStatement — a realistic page", () => {
  // Shaped like a real AoPS problem page, since the real thing cannot be fetched here.
  const page = `== Problem ==
What is the value of <math>\\frac{11!-10!}{9!}</math>?

<math>\\textbf{(A) }99\\qquad\\textbf{(B) }100\\qquad\\textbf{(C) }110\\qquad</math>

{{AMC10 box|year=2019|ab=A|before=First Problem|num-a=2}}
{{MAA Notice}}`;

  it("keeps the question and the choices, drops the boxes", () => {
    const { html, hasDiagram } = renderStatement(page);
    expect(html).toContain("What is the value of");
    expect(html).toContain("katex");
    expect(html).not.toContain("MAA Notice");
    expect(html).not.toContain("num-a");
    expect(hasDiagram).toBe(false);
  });
});
