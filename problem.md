The most effective method used by competitive math students is an **AMC Error & Diagnostic Matrix** (typically maintained in a simple spreadsheet or Notion table).

Instead of just recording the overall score (e.g., "94.5"), this system decomposes every missed or skipped problem to uncover whether the issue is **subject knowledge**, **problem-solving heuristics**, or **test-taking mechanics**.

---

### 1. The Core Tracking Matrix Structure

For every past exam completed, log every question that was either **Incorrect** or left **Blank** using the following columns:

| Column | What to Record | Example Entry |
| --- | --- | --- |
| **Exam & Problem** | Year, Form, and Number | 2023 AMC 10A, #14 |
| **Topic** | Algebra, Geometry, Number Theory, Combinatorics | Number Theory (Modular Arithmetic) |
| **Status** | Incorrect vs. Blank | Incorrect |
| **Error Taxonomy** | The root cause category (see below) | Careless / Arithmetic |
| **Time Spent** | Estimated minutes spent on this question | 6 min |
| **Key Insight / Lesson** | 1 sentence explaining the core trick or mistake | "Checked parity, but missed that $p=2$ is the only even prime." |
| **Re-solve Status** | Successfully solved unassisted 3 days later? | Yes |

---

### 2. The 4-Category Error Taxonomy

When reviewing missed questions, classify each error into one of four distinct categories:

1. **Category A: Careless / Execution Error (Knew the math, lost the points)**
* *Examples:* Misread "positive integers" as "integers," sign error, arithmetic mistake, off-by-one error.
* *Diagnostic meaning:* Rushing through early questions (Q1–12). The fix is slowing down and double-checking work before moving past Problem 12.


2. **Category B: Conceptual / Knowledge Gap (Didn't know the tool)**
* *Examples:* Did not know the Power of a Point theorem, Stars and Bars formula, or Vieta’s formulas for higher-degree polynomials.
* *Diagnostic meaning:* A clean factual gap. The fix is reading the AoPS chapter or drilling that specific Alcumus module.


3. **Category C: Problem-Solving / Strategic Block (Knew the tools, couldn't find the path)**
* *Examples:* Knew synthetic geometry formulas, but didn't see the auxiliary line to draw; knew combinatorics, but chose a casework structure that was too messy.
* *Diagnostic meaning:* Needs exposure to standard competition patterns and heuristics.


4. **Category D: Triage / Time Management Error**
* *Examples:* Spent 9 minutes stuck on Problem 11 and never had time to read Problem 16 (which was an easy Algebra problem).
* *Diagnostic meaning:* Lack of discipline in abandoning dead-end approaches after 2–3 minutes.



---

### 3. How to Read the Patterns (After 3–4 Mock Exams)

Once 3 to 4 past exams are logged, group the data by **Topic** and **Problem Difficulty Range**:

* **Evaluate by Problem Tier:**
* **Q1–Q10:** Accuracy here should be near **100%**. If there are 2 or more Category A errors here per test, that indicates pacing issues—the student is leaving 15+ points on the table due to rushing.
* **Q11–Q18 (The "AIME Qualifying Zone"):** This is where qualification is decided. Look at which subjects have the highest conversion rate here. If Algebra conversion is 80% but Geometry is 20%, Geometry is the clear bottleneck.
* **Q19–Q25:** Blanks here are completely normal. The only concern is if the student wasted more than 4–5 minutes attempting these instead of securing Q11–Q18.


* **Evaluate by Subject Area:**
* Calculate the accuracy rate for each of the four areas:

$$\text{Accuracy Rate} = \frac{\text{Correct Attempts}}{\text{Total Questions Seen in that Subject}}$$


* Focus the next week's 3–5 hours of targeted practice strictly on the lowest-performing subject.



---

### 4. The "Three-Day Re-solve" Rule

Simply reading the written AoPS solution creates an illusion of understanding.

* On the day of the test, read the solution and record the key insight in the log.
* **Three days later**, without looking at the notes, re-solve the problem from a blank page.
* Only mark the problem as mastered once it can be solved cleanly and quickly without hints.


### 1. Existing Online Solutions

Currently, **no dedicated, standalone commercial software specifically implements this exact AMC Error & Diagnostic Matrix workflow end-to-end**. However, several adjacent solutions and workflows exist across different categories:

#### A. The Current Standard: DIY Spreadsheets & Notion Templates

* The vast majority of serious AMC/AIME competitors build custom tracking tools using **Google Sheets, Airtable, or Notion**.
* On community platforms such as the [Art of Problem Solving (AoPS) Community](https://artofproblemsolving.com/) and math competition forums, students frequently share templates that track test year, problem number, topic, and whether an error was careless or conceptual.
* **Limitations**: High manual data-entry friction (typing problem descriptions, LaTeX formulas, topics, and timestamps), lack of automated spaced-repetition reminders, and no built-in database of historical AMC problem metadata.

#### B. General Test-Prep Error Logging Platforms

* Platforms like [21st Night](https://get21stnight.com/) provide dedicated error-tracking software built on spaced-repetition algorithms. They allow students to screenshot missed problems, tag error types, write key takeaways, and automatically schedule re-solves.
* **Limitations**: These tools are geared toward standardized tests (MCAT, GRE, SAT, GMAT). They lack contest-math metadata, AMC difficulty tiers (e.g., Q1–10 vs. Q11–18 AIME qualification zone), and integration with AoPS solution archives.

#### C. Competition Math Platforms

* **[MathDash](https://mathdash.com/)**: Provides competitive live rounds, calibrated ratings predicting AIME qualification, topic-tagged problem sets, and coach dashboards. However, its primary focus is contest hosting, live practice, and matchmaking rather than serving as a diagnostic post-mortem tracker for external past papers.
* **[Art of Problem Solving (Alcumus)](https://artofproblemsolving.com/)**: Tracks accuracy across subjects (Algebra, Geometry, Number Theory, Counting & Probability) and adjusts difficulty dynamically, but it operates as an individual problem drill engine rather than a 75-minute, 25-question timed mock exam diagnostic tool.
* **Coaching Academy Portals (e.g., Think Academy, Random Math, AlphaStar)**: Many institutional programs offer mock testing with diagnostic score reports. However, these systems are closed, proprietary tools bundled with expensive coursework ($1,000–$3,000+).

---

### 2. Market Analysis

#### A. Market Size & Demographics

* **Top-of-Funnel Reach (TAM)**: According to the [Mathematical Association of America (MAA)](https://maa.org/student-programs/amc/), more than **300,000 students** across 6,000+ schools participate annually in the AMC 8, AMC 10, and AMC 12 competitions.
* **Serviceable Addressable Market (SAM)**: The core segment aiming for AIME qualification (top ~2.5% on AMC 10, top ~5% on AMC 12, plus the top ~10% pursuing Mathcounts state/national rounds). This represents a concentrated global user base of approximately **30,000 to 50,000 active, competitive students** in North America and international prep hubs (China, South Korea, India, Singapore, Canada).
* **Target Personas**:
1. **Competitive Middle & High School Students**: Motivated by STEM admissions, AIME/USA(J)MO qualification, and summer math camp applications (e.g., PROMYS, Ross, AwesomeMath).
2. **Parents ("Tiger STEM" demographic)**: Heavily invested in supplemental education with high willingness to pay.
3. **Private Math Coaches & Academies**: Independent tutors and specialized academies seeking automated tracking tools for their cohorts.



#### B. Willingness to Pay & Economics

* **High Purchasing Power**: Families preparing for the AMC regularly spend:
* **$800–$1,500** per semester on AoPS online courses.
* **$70–$200/hour** for private 1:1 contest math coaching.
* **$3,000–$6,000** on residential summer math programs.


* **Potential Pricing Models**:
* **B2C Freemium / Consumer SaaS**: $10–$18/month or $60–$99/annual subscription (season-concentrated from August through February).
* **B2B / Coach License**: $30–$50 per student seat annually for tutoring centers and school math teams.



---

### 3. Key Challenges & Opportunities

| Factor | Challenge | Product Opportunity |
| --- | --- | --- |
| **Manual Data Friction** | Logging 10+ missed problems per test with topics, LaTeX, and notes in spreadsheets leads to user drop-off after 2–3 tests. | **Pre-indexed Question Database**: Maintain all AMC 10/12 exams (2000–present). The student inputs test answers (e.g., A, B, C, blank), and the app auto-populates question text, diagrams, topic tags, and official AoPS solution links. |
| **Diagnostic Accuracy** | Students struggle to objectively classify Category C (heuristics) vs. Category B (knowledge gaps). | **AI Diagnostic Prompts**: Interactive reflection prompts that ask diagnostic questions (e.g., *"Did you know the formula?"* or *"Did you abandon the question within 3 minutes?"*) to automatically classify errors. |
| **Seasonality** | AMC 10/12 exams occur in November, with AIME in February. Activity drops significantly in spring/summer. | Expand coverage to **AMC 8 (January)**, **AIME (February)**, **Mathcounts (Feb–May)**, and general olympiad training to maintain year-round engagement. |
| **Spreadsheet Defensibility** | A basic digital matrix can be copied into Google Sheets or Notion for free. | Differentiate via **automated spaced-repetition schedules (the "Three-Day Re-solve" rule)**, automated pacing analytics (time spent per question), and coach-cohort visibility. |

---

### Summary Conclusion

* **Is there an online solution?** There is currently no purpose-built tool dedicated to this specific AMC diagnostic matrix and 3-day spaced-repetition workflow; students rely on manual spreadsheets, general test-prep logs, or fragmented coaching portals.
* **Is there a market?** Yes, but it is a **high-value niche rather than a mass-market consumer play**. A standalone simple table is vulnerable to free Notion/Sheet templates, but an integrated platform featuring pre-populated AMC problem sets, automated pacing analytics, automated 3-day re-solve queues, and coach/tutor reporting represents a viable B2C/B2B EdTech product.