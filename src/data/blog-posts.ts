import { BlogPost } from "@/types/blog"

// Real editorial content. New posts are prepended; the legacy placeholder
// posts below (empty `content`) predate this and are left as-is — the
// blog detail page falls back to showing their excerpt as the body.
export const BLOG_POSTS: BlogPost[] = [
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
]

export function getBlogPost(id: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.id === id)
}
