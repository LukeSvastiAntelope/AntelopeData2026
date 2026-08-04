import { BlogPost } from "@/types/blog"

// Real editorial content. New posts are prepended; the legacy placeholder
// posts below (empty `content`) predate this and are left as-is — the
// blog detail page falls back to showing their excerpt as the body.
export const BLOG_POSTS: BlogPost[] = [
  {
    id: "what-we-believe",
    title: "What We Believe — Why We Made Antelope",
    excerpt:
      "Good leadership begins with understanding. Modern campaign technology has quietly abandoned that fact — most tools are built for outbound only, and the ones that look inward stop at a chart. Here's why we built the alternative.",
    content: `Good leadership begins with understanding. So does good strategy, good policy, good anything. Before you can lead a room, you have to know the room. Before you can move a community, you have to listen to it. This is not a slogan. It is the first fact of politics, and it is the fact that modern campaign technology has quietly abandoned.

The tools available today are decent. They are not the problem in isolation. The problem is that they do not complete the loop. Most are built for outbound only — engines for pushing a message out and measuring how far it traveled. The ones that do look inward stop at descriptive analytics: here is what happened, here is a chart, and nothing deeper. Neither half listens. Neither half closes the circle between hearing a community and acting on what you heard.

The proof is in the stagnation. The field has barely innovated, and it is not only political tooling — look at general survey software and you find the same arrested development. The survey, one of the most powerful instruments we have for understanding people, has been left to rot in two useless extremes. At one end it is whimsical and weightless: the skippable ad, the throwaway poll, the thing nobody takes seriously because it was never built to be. At the other sits the academic and market-research apparatus — the eighty-question instrument, rigorous and expensive and slow. By the time the results arrive, the moment has passed. One extreme is too shallow to matter. The other is too heavy to use.

## Why now

We think there is a better model, and this is the moment it becomes possible.

It is possible because the technology is finally here and finally cheap. Lightweight, drip-fed surveys — short, deployable in minutes, delivered in small doses rather than dumped as a wall of questions — paired with real analysis: regression, no-code Python, graphing, geographical overlays. The AI that makes this work for a non-technical person did not exist a few years ago, and it did not exist at a price a local campaign could pay. Now it does.

It is necessary because politics has fractured. Factionalism has pushed the real contests down to the hyperlocal level, and in a chaotic landscape, discerning who a community actually is — what it fears, what it wants, what moves it — has become precious in a way it simply wasn't a decade ago. When national identity fragments, local understanding is the thing that still holds.

And it is timely because every tool has a point where it passes from good enough to obsolete. That point is fine and hard to see from up close. A paper map got you where you were going for a very long time; it was good enough, right up until it wasn't, and the people who kept folding paper while everyone else navigated live were not wrong so much as late. We are building for the world that is arriving anyway — one where data, ingestion, and orchestration are better, where municipalities and the people in them will expect co-pilots and live intelligence as a matter of course. We may be early. We may be late. But it is far better to arrive at the party than to miss the address entirely.

## What it costs to get this wrong

It is worth remembering how hard it is to win a small race. There is no war chest, no staff, no consultant on retainer — usually just a person, a conviction, and not enough hours. Winning a school board or a council seat is genuinely difficult, and the tools that could help are priced for campaigns a hundred times larger.

The people who choose to run are precious. Wanting to stand up and lead is a good thing — one of the better instincts a person can have — and it deserves better than what the market currently offers. We want to hand those people the right tools so that leaders can do what leaders do best. And what leaders do best is not writing code, not wrangling spreadsheets, not guessing. It is understanding people and acting on that understanding. Our job is to clear everything else out of the way.

That understanding compounds. Over time, insight sharpens focus — knowing dynamically what message reaches whom, and why a given issue matters where it does. Good insight, in the hands of a good leader, flows naturally into everything downstream: message, outreach, policy, the base, the network. We'll say more about exactly how in a companion piece. For now it is enough to say that the loop, once closed, keeps paying.

## What we believe

We believe understanding is the honest way to win.

A leader has a duty to know the room — not as a tactic, but as an obligation. To hold a base, to grasp the anxieties underneath it, to represent people you have actually taken the trouble to hear. In a fair democratic contest, the candidate who understands their community more deeply should win, and usually will. That is not a flaw in democracy. That is democracy working.

Which is why we reject the model that treats citizens as inboxes. Outbound-only has trained campaigns to broadcast at people and call it engagement, reducing political communication to spam. People are not targets to be scored, mailboxes to be filled, or wallets to be opened. They are the point. A tool that forgets this is not just distasteful; it is bad at the actual job, which is representation.

And we believe access should be fair. No money gatekeeping. No pricing that locks the best intelligence behind budgets only the biggest campaigns can reach. Equal access, open reach, and a level field where the deciding advantage is understanding rather than spend. Antelope does not know or care what party you belong to — the platform is built the same for everyone, because listening is neither left nor right.

Tomorrow's leaders will be more data-driven and more curious about the people they serve than any before them — the natural inheritance of a generation raised where Instagram and TikTok run rampant, taught from the start to read the room before they speak.

Antelope is built for that leader, and for that future.`,
    date: "22 Jul 2026",
    readTime: "7 min",
    tags: ["Manifesto", "Why Antelope"],
    author: { name: "Luke Svasti" },
  },
  {
    id: "our-history",
    title: "Our History",
    excerpt:
      "The problem at the center of Antelope emerged over a decade of observation across academia, startups, and market research — from a graduate student who couldn't get a regression to run, to a platform built for the campaigns everyone else priced out.",
    content: `## The Problem

The problem at the center of Antelope emerged over a decade of observation across academia, startups, and market research.

In the early 2010s, a pattern became visible in political science and sociology programs: students arrived excited about understanding how societies work, but struggled when they encountered the quantitative tools required to do rigorous analysis. The barrier was not conceptual — it was technical. Tools like R demanded significant overhead, with weeks of learning syntax and wrestling with implementation standing between a researcher and even simple questions about correlation or causation. The result was predictable: inquiry was deferred, simplified, or abandoned entirely.

This is where the conviction behind Antelope took root — the belief that the difficulty of a tool should never be the thing that stops a person from understanding the world.

## The Beginning

The founder's own path made the problem personal. As a graduate student at Columbia with undiagnosed ADHD and dyscalculia, the barrier was not a lack of curiosity or capability, but the tools themselves. A single regression could consume an entire term. Simpler tools like SPSS eased the burden but capped the ceiling — descriptive statistics were accessible, but anything deeper remained out of reach.

The same pattern appeared in the classroom at Rutgers. Students who arrived engaged and capable — many from strong traditional backgrounds in political theory — found themselves avoiding quantitative work, not because they could not grasp it, but because the tooling made genuine exploration untenable. The interest was there. The access was not.

## Birth of an Entrepreneur

At Oxford, the founder pursued socio-legal studies — rigorous, but largely qualitative, in part because the quantitative path still felt closed. It was during this period, over the COVID lockdowns, that the seed of a company first appeared.

The catalyst was an unlikely one: Reddit's prediction tournaments. These were small forecasting games where users predicted outcomes and earned tokens for accuracy. Though the tokens held no real value, the act of wagering made people reason carefully about their own beliefs. The founder saw something larger in this — a way to map demographics and identity against opinion and instinct, building a dynamic, multidimensional picture of how people actually think.

That vision became Napolleon, a predictive market for business intelligence and the founder's first entrepreneurial venture, accepted into the Oxford University incubator. Napolleon did not ultimately succeed as a product. The environment could only support so much, and the venture wound down. But it was not a wasted chapter — it was the one that pointed toward the real problem.

## Pivots and Research

The market research conducted for Napolleon proved more valuable than the product itself. In conversation after conversation, a consistent truth surfaced: every organization used surveys, and almost every organization disliked them. The incumbent tools — nearly two decades old — had grown by accretion, with features bolted onto dated architectures, distribution and analytics siloed, and user experience reflecting accumulated compromise rather than design.

After Napolleon wound down, a period of reflection followed. The survey problem would not let go. An early collaboration with Thomas Petersen briefly explored a hybrid of predictive markets and surveys before simplifying to the core: surveys, but with real analytical teeth — no-code Python, regression, the deeper work that had always been locked behind tool difficulty.

The first instinct was to build for business broadly. It did not work. Pilots generated interest but not sales; businesses defaulted to incumbents without a compelling reason to switch. The breakthrough came only when the focus narrowed to a single market that lived and died by exactly this problem: political campaigns.

## Today

Campaigns need to understand their districts — what constituents fear, what they want, what moves them. Yet the tools available to them split into two inadequate halves: outbound engines that broadcast and measure reach, and survey tools with no integrated analytics. The loop was never closed. Listen, analyze, act — each lived in a separate platform, under a separate vendor.

The campaigns that need this most — downballot races, exploratory committees, small PACs, and local organizations — operate on a fraction of national budgets. They needed something fast, affordable, and integrated. The market offered them nothing. Antelope was built to close that gap: survey creation, advanced analytics, geographical intelligence, and outbound messaging in a single platform, priced for the races that matter most but have been systematically underserved.

## The Path Forward

Antelope began in 2026 with a clear conviction — that understanding should be accessible, that data should inform strategy rather than replace it, and that the leaders who take the time to truly know their communities deserve tools worthy of that work.

The company owes a quiet debt to those who shaped the journey but cannot be named here: an early co-founder who believed in the vision before departing for academia, collaborators who lent their design and technical insight, and friends who opened doors when the idea was still unproven. Their contributions are woven into what Antelope has become.

We are still early. But the need has never been clearer, and the moment has never been better.`,
    date: "15 Jul 2026",
    readTime: "6 min",
    tags: ["Our History", "Founding Story"],
    author: { name: "Luke Svasti" },
  },
  {
    id: "how-its-used",
    title: "How It's Used — Workflows & Case Studies",
    excerpt:
      "Everything Antelope does runs on a single loop: listen, analyze, act, repeat. A working, evolving look at how that loop shows up across real workflows — and the recent political record it's built to answer.",
    content: `*A working document. Early-stage, and evolving as we learn from the field.*

## The Core Loop

Everything Antelope does runs on a single loop: listen, analyze, act, repeat.

You listen by asking — a survey, deployed fast and cheap, to the people whose opinion actually matters for the decision in front of you. You analyze what comes back with real tools, not just a pie chart of responses: which issues move which cohorts, what predicts what, where in the district a sentiment concentrates. You act on that understanding — sharper messaging, better-targeted outreach, a policy platform built on what people actually said. And then you do it again, because a district is not a fixed thing. It moves, and the loop moves with it.

The fourth step is the one that matters most, and the one every other tool skips. A single poll is a snapshot. A loop is a relationship. Each cycle of listening sharpens the next: you learn who responds to what, which questions reveal the most, where your understanding was wrong. Insight compounds. By the third round you are not guessing at your district — you know it, and you know how it is changing.

This is the whole thesis, reduced: understanding is not a one-time purchase. It is a practice.

## Workflows

The loop shows up in six recurring patterns of work. These are the things campaigns and organizations actually do with Antelope day to day.

**Knowing the room.** Before you spend a dollar or knock a door, you establish a baseline: what does this district actually care about? Not what the last cycle's data says, not what your gut says — what the people here, now, are telling you. A short survey across the district, analyzed by cohort and geography, gives you a starting map. You learn where you are strong, where you are weak, and where the genuine uncertainty is. Everything downstream gets cheaper and sharper because you started from truth instead of assumption.

**Message streamlining.** Most campaigns say too many things to too many people. Listening tells you which issues actually move which groups, so you can stop broadcasting everything to everyone. If housing costs drive one neighborhood and school quality drives another, you stop wasting both your breath and your budget. The analysis layer — regression, cohort-building — is what turns raw responses into "this message, to these people, because of this."

**Policy development.** A platform built on real constituent priorities is stronger than one built in a back room. Survey your district on the trade-offs you will actually face in office, and you learn not just what people want in the abstract but what they will accept when things are hard. This is where the tool earns its keep for serious candidates: you arrive with a platform you can defend, because you can show where it came from.

**Outreach and targeting.** The right message to the right people is not spam — it is service. Once you know what moves whom, outbound stops being a firehose and becomes a set of specific, relevant conversations. You reach the housing-anxious household about housing, the parent about schools. Fewer messages, better received, because each one is about something the recipient actually cares about.

**Continuous listening.** The loop does not end on election day — that is where governing begins. A leader who keeps listening after the win is a leader who does not get surprised by their own community. Re-poll on the hard decisions. Track how sentiment drifts as circumstances change. Notice discontent while it is still a signal, not yet a movement. This is the difference between representing a district and merely occupying its seat — and, not incidentally, it is how you build the record that wins the next race.

**Creating knowledge and content.** Every round of listening produces reusable assets. The insight itself feeds policy and strategy. But it also feeds outreach: a finding about what your district cares about is the raw material for a post, a mailer, a speech, a fundraising ask that actually resonates because it is grounded in something real. Understanding, once captured, keeps paying out — into engagement, into content, into the relationships that compound over a cycle. Engagement is not extraction. Done right, it is the thing that makes people feel heard, which is the thing that makes them show up.

## What the History Shows

Antelope is new, so we cannot yet point to our own case studies. But the pattern the tool addresses is old, and it is written all over the recent record of local politics. Culture leaves fingerprints. Here are a few.

**Lexington, Kentucky — listening that changed the outcome.** When Lexington received $121 million in federal relief funds in 2021, the city council did not decide behind closed doors how to spend it. It ran a process that let residents submit and weigh in on projects directly, and that input shaped the majority of the projects that were ultimately funded — concentrated, as it turned out, in housing, social services, and parks. This is listen-first in its most constructive form. Nobody was proven wrong; a community was asked, and the asking produced a better, more legitimate answer than a room of officials would have reached alone. This is the case we find most instructive, because it is not dramatic. It is just what good governance looks like when the loop is closed.

**Seattle, Washington — governing without listening.** In 2024, the Seattle school board faced a recall effort. The specific grievances varied, but the through-line was a board leadership that had, by its own description, chosen to spend less time responding to community concerns and more time on broad top-down policy — including a rushed school-closure process the community felt it had not been consulted on. Whatever the merits of any single decision, the structural failure was the same: the board acted without a reliable read on where its community actually stood, and was surprised by the backlash. The lesson is not that the board held wrong views. It is that it governed blind.

**Temecula Valley and Sunol, California — surprised by your own district.** Across 2023 and 2024, several California school boards enacted sharply contested policies that their campaigns had gestured at but that turned quiet local seats into fierce battlegrounds, and organized recall efforts followed. The point here is not about the policies themselves — those are exactly the kind of question Antelope stays out of. The point is about method. A board can hold a firm position and survive it, if it understands where its community stands and does the work of bringing people along. What these boards lacked was not conviction. It was any instrument for knowing, in advance and in detail, how their district would actually respond — the difference between leading a community and getting ahead of it without knowing you had.

The common thread: in none of these cases was the deciding factor ideology. It was whether the people in charge knew the room. Lexington asked and was rewarded. The boards assumed, and were surprised. Antelope exists to make asking cheap, fast, and continuous enough that no candidate or official ever has to govern blind.

## Imagined Workflows

Because we are early, the clearest way to show how Antelope works is to walk through it. These are illustrative — how we envision the tool being used, not case studies of real deployments.

**A first-time school board candidate.** Imagine someone deciding to run for a school board seat in a district of 15,000 residents. She has conviction and not much else — no staff, no consultant, a few thousand dollars, and a day job. Under the old model, she would spend that budget on yard signs and a mailer, broadcasting the same three messages to the whole district and hoping something landed. Real polling — the kind that would tell her what this district actually worries about — would run into the tens of thousands of dollars and weeks of turnaround. Prohibitive. So she would guess.

With Antelope, she starts by listening. A short survey, deployed by text and web link across the district, tells her within days that the loudest issue online — a curriculum fight — is actually a minority concern, while the thing most parents care about is overcrowding and a planned boundary change nobody is talking about. That single finding rewrites her campaign. She builds her platform around the boundary issue, targets her limited outreach to the neighborhoods most affected, and shows up to forums already knowing the room. She has not been told what to believe. She has been told what is true about the people she wants to represent — and that is the whole advantage.

**A county party sharing intelligence.** Imagine a county party running a slate of candidates across several local races in the same cycle. Individually, each campaign is too small to afford real district intelligence. Together, they are not. The party runs listening at the county level and shares the resulting intelligence across the whole slate — every candidate benefits from a picture none of them could have afforded alone. The district understanding becomes an asset the institution owns and improves each cycle, rather than something that evaporates when an individual campaign ends. This is where the compounding really lives: not in any one race, but in an organization that gets smarter every year.

**An exploratory committee deciding whether to run at all.** Imagine someone weighing a run and genuinely unsure whether the ground is there. The old answer is to spend six months and a lot of money finding out the hard way. The listening-first answer is to ask first: a targeted survey to gauge whether the appetite for a challenge actually exists, where support might come from, and what a viable message would even be. Sometimes the honest finding is don't run — and knowing that early, before the money and the year of your life, is itself enormously valuable. A tool that helps someone decide not to run is doing its job as surely as one that helps them win.

**A municipality that needs an answer fast.** Imagine a small city facing a budget decision with a public meeting three weeks out. The traditional options are a slow, expensive consultant poll or a public forum dominated by the loudest dozen residents. Neither tells you what the community as a whole actually thinks. A fast, well-built survey does — deployed in days, analyzed by neighborhood, giving the council a real read on resident priorities before the vote rather than a shouting match after it. This is not about winning an election. It is about governing with the room in view. It is also, not coincidentally, the direction we expect this whole category to move.

## What Makes This Different

The features are not the point. Plenty of tools do surveys. Plenty do outbound. A few do analytics. What almost none of them do is close the loop — connect the listening to the analysis to the action and back again, in one place, fast enough and cheap enough that a small campaign can actually run the cycle.

And one thing we are deliberately not building: a machine for predicting who will win. Horse-race prediction is the shallow end of this field, and it treats a community as a scoreboard. Our aim is the opposite — to help a candidate or official understand the room, in enough depth and continuously enough that they can represent it well. Prediction tells you the score. Understanding tells you the people. We are building for the second thing, because the second thing is what democracy actually runs on.

*This document will grow as real deployments give us real cases. For now, it is a map of the terrain as we see it.*`,
    date: "29 Jul 2026",
    readTime: "10 min",
    tags: ["Workflows", "Case Studies"],
    author: { name: "Luke Svasti" },
  },
  {
    id: "1",
    title: "Voter Profiles: Transform Survey Data Into Intelligent AI Agents",
    excerpt: "Discover how Antelope's voter profile technology creates AI-powered personas from survey responses. Each respondent becomes a queryable agent that preserves their unique perspectives, values, and decision-making patterns—enabling unprecedented insights without re-surveying your audience.",
    content: "",
    date: "21 Nov 2024",
    readTime: "6 min",
    tags: ["Voter Profiles", "AI Analytics"],
    author: { name: "admin" }
  },
  {
    id: "2",
    title: "Cohort Analysis Made Simple: Segment Your Survey Audience in Seconds",
    excerpt: "Learn how to create powerful audience segments with Antelope's cohort builder. Filter respondents by demographics, answers, and behaviors to uncover hidden patterns in your data. No SQL required—just point, click, and discover insights that drive better decisions.",
    content: "",
    date: "18 Nov 2024",
    readTime: "5 min",
    tags: ["Cohort Analysis", "Survey Analytics"],
    author: { name: "admin" }
  },
  {
    id: "3",
    title: "AI-Powered Survey Analytics: Get Instant Insights Without Writing Code",
    excerpt: "Stop spending hours in spreadsheets. Antelope's AI analytics engine automatically generates charts, identifies trends, and surfaces key insights from your survey data. Ask questions in plain English and get comprehensive analysis in seconds—powered by GPT-4 and advanced visualization models.",
    content: "",
    date: "15 Nov 2024",
    readTime: "5 min",
    tags: ["AI Analytics", "Data Visualization"],
    author: { name: "admin" }
  },
  {
    id: "4",
    title: "Chat With Your Survey Data: Natural Language Queries for Research Teams",
    excerpt: "Imagine asking your survey data questions like you would a colleague. With Antelope's conversational analytics, you can query cohorts, explore trends, and generate reports using natural language. Perfect for researchers who want insights fast without learning complex analytics tools.",
    content: "",
    date: "12 Nov 2024",
    readTime: "4 min",
    tags: ["Conversational AI", "Research Tools"],
    author: { name: "admin" }
  },
  {
    id: "5",
    title: "Survey Response Prediction: How Voter Profiles Answer New Questions",
    excerpt: "What if you could predict how your respondents would answer new survey questions without asking them again? Antelope's voter profiles use AI to generate accurate predictions based on each person's unique profile, saving time and reducing survey fatigue while maintaining data quality.",
    content: "",
    date: "08 Nov 2024",
    readTime: "5 min",
    tags: ["Predictive Analytics", "Voter Profiles"],
    author: { name: "admin" }
  },
  {
    id: "6",
    title: "From Raw Data to Rich Insights: Automated Survey Report Generation",
    excerpt: "Transform survey responses into professional, comprehensive reports automatically. Antelope analyzes your data, identifies key themes, generates visualizations, and produces executive summaries—all without manual effort. Get publication-ready insights in minutes, not days.",
    content: "",
    date: "05 Nov 2024",
    readTime: "4 min",
    tags: ["Report Generation", "Automation"],
    author: { name: "admin" }
  },
  {
    id: "7",
    title: "Multi-Source Intelligence: Combine Survey Data with Voter Profiles and Web Research",
    excerpt: "Go beyond traditional survey analysis. Antelope integrates your survey responses with voter profile predictions and real-time web research to provide context-rich insights. See how your data compares to broader trends and get a complete picture of your audience's perspectives.",
    content: "",
    date: "01 Nov 2024",
    readTime: "6 min",
    tags: ["Data Integration", "Market Research"],
    author: { name: "admin" }
  }
]

export function getBlogPost(id: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.id === id)
}
