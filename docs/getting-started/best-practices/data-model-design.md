# Design a Data Model

This guide is written for two readers: analysts who build a data model out of Data Marts, and AI agents that check one. It ends with a [checklist](#checklist) your agent can run on your model. Give it the model as an OKF bundle or a JSON file — exported from the [Models canvas](../setup-guide/models-canvas-export.md) in OWOX Data Marts, from [OWOX Model Canvas](https://model.owox.com/), or from wherever you built it. The check is not conformance to a modeling framework. It is common sense about your business: it points out the weak spots in the model's ontology that are worth fixing.

OWOX Data Marts writes the SQL for joins so that a joined row is not counted twice. What the SQL cannot know is whether the rows it connects belong together. That is decided by the model, and a query can be valid while its number means nothing (Vlad Flaks, [Why You Need a Model to Make Sense of Your Data](https://www.vladflaks.com/thoughts/why-you-need-a-model-to-make-sense-of-your-data-1/)). This page is the method for getting the model right. The settings themselves are described in [Joinable Data Marts](../setup-guide/joinable-data-marts.md) and [Calculated Fields](../setup-guide/calculated-fields.md).

## How a Model Is Read

Four facts decide what a model can answer:

1. **A report starts from one Data Mart, its base, and keeps all of its rows.** Joined Data Marts only add columns. A joined row that matches no row of the base is left out, and an empty (`NULL`) key matches nothing. See [How It Works](../setup-guide/joinable-data-marts.md#how-it-works).
2. **A joined Data Mart is collapsed to one row per join key before the join**, by each field's [Dedup](../setup-guide/joinable-data-marts.md#dedup), so a report never has more rows than its base.
3. **A joined measure is counted once per joined row.** A report's `Sum`, `Average`, `Min`, `Max` and `Count Unique` over a joined field — and `SUM`, `AVG`, `MIN`, `MAX` and `COUNT(DISTINCT …)` inside a calculated field — count a joined row once, however many base rows it reaches. A plain `COUNT` is [the exception](../setup-guide/joinable-data-marts.md#a-joined-count-counts-this-data-marts-rows-not-the-joined-ones).
4. **A relationship runs one way.** It is defined on the Data Mart you report from, and the relationships of every Data Mart it reaches are followed too, so a path you never drew can appear in the column picker. See [Transitive Joins](../setup-guide/joinable-data-marts.md#transitive-joins).

So the arithmetic of a join is rarely what goes wrong. The questions a model has to get right are different: **does each path connect rows that belong together, and does the base keep every row the metric needs?** The steps below make both answers yes.

## Step 1: Name the Business Objects

Start from the decision, not from the tables: the result the business wants, the resource that limits it, and the things that connect the two (Vlad Flaks, [Data Modeling. Where to Start](https://www.vladflaks.com/thoughts/data-modeling-where-to-start-4/)). For an online store that is ad spend → session → order → customer.

Each of those things becomes a Data Mart of one of two kinds:

| Kind          | One row is                         | It carries                       | Examples                                                       |
| ------------- | ---------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| **Event**     | something that happened, on a date | measures: spend, revenue, counts | Ad Spend (per day and campaign), Sessions, Orders, Order Lines |
| **Reference** | something that exists              | attributes to group by           | Customers, Products, Campaigns, Traffic Sources, Countries     |

- **One Data Mart is one object at one grain.** Start its description with the grain — "One row per order line" — and name it for what one row is.
- **Split tables that hold several objects.** A raw analytics export with sessions, events and transactions in one table has no single grain, so no sum over it can be read without an explanation.
- **Merge objects that differ only by type** — first and repeat orders are one Data Mart with an `order_type` field — and **keep apart events that happen at different times**: an invoice and the payment for it are two Data Marts.
- **Keep an attribute that changes over time on the event, as it was then.** Whether an order came from a new or a loyal customer belongs to the order; the customer's current segment belongs to the customer (Vlad Flaks, [When will I get my money back?](https://www.vladflaks.com/thoughts/when-will-i-get-my-money-back-5/)).
- **A metric is not an object.** ROAS does not exist without spend and revenue, so it is a calculated field on a Data Mart that holds them, never a Data Mart of its own. See [Step 5](#step-5-put-each-metric-where-its-rows-are).

## Step 2: Make the Grain the Primary Key

The primary key is the grain written as fields: the fields that make one row unique. `order_line_id` for order lines; `date`, `source`, `medium` and `campaign` together for daily ad spend. Composite keys are normal. Keys are marked in the [Output Schema](../setup-guide/sql-data-mart.md#step-3-define-output-schema).

- **Declare a primary key on every Data Mart.** Without one there is no [Unique Count](../setup-guide/report-aggregations.md#unique-count), and a calculated field that counts across a join can only warn that it cannot tell whether the count is right.
- **Prove it.** OWOX trusts the key you declare. Turn on the **Primary key uniqueness** check in [Data Quality Checks](../setup-guide/data-quality-checks.md), or compare `COUNT(*)` with `COUNT(DISTINCT …)` over the key once. Keep key fields filled: Unique Count skips a row whose key is empty.
- **Store identifiers as text.** A report's **Count Unique** is offered for text fields, not for numbers, so a report cannot count the distinct values of a numeric `order_id`.

## Step 3: Connect Objects the Way the Business Does

A relationship states a fact about the business: _each order was placed in one session_, _each session came from one traffic source_. Write that sentence in the relationship's [Description](../setup-guide/joinable-data-marts.md#step-3-describe-the-relationship-optional) — AI assistants read it together with the join fields. If you cannot write the sentence, do not create the relationship.

**Event to reference: join on the reference's full primary key.** That is how an event gets attributes to group by. A key that covers only part of it matches several reference rows, and their values are collapsed into one — a list, or whichever value the Dedup keeps. Ad spend joined to traffic sources on `source` and `medium`, when a traffic source is also defined by `campaign`, cannot tell which campaign a spend row paid for.

**A reference is an end point.** Join to it to add columns; never pass through it from one event to another. Two events that share a reference share an attribute, not a history:

```text
Sessions ─(country)─▶ Countries ─(country)─▶ Leads
```

This path answers "leads from the countries these sessions came from", not "leads these sessions brought". A reference is not tied to a day either, so a path through it matches every day with every other day: last week's ad spend, joined through traffic sources to sessions, picks up that source's sessions — and their revenue — from its whole history. In the model this means one rule: no relationship leads from a reference Data Mart to an event Data Mart.

**Event to event: join on what makes two rows the same moment or the same thing.** `session_id` joins an order to the session it came from; `date`, `source`, `medium` and `campaign` join a day of ad spend to the sessions that campaign brought that day. Every hop on the path has to carry that link — one hop without the date breaks it.

**Keep an object off a metric's path unless the metric depends on it.** Spend exists without sessions: impressions, offline ads, lost tracking. Orders exist without sessions: phone orders, missing tags. A path from spend through sessions to orders drops every order no tracked session led to. If each order already carries the traffic source it is attributed to, join spend to orders directly.

**Use the same values for the same thing.** A join matches values, not meanings. `Google` against `google`, a channel group derived one way for spend and another way for revenue, or an empty campaign on one side silently drop rows. Derive a shared attribute once — in the reference Data Mart, or with the same SQL everywhere — and replace an empty key with the same placeholder, such as `(not set)`, on both sides. The **Relationship integrity** check in [Data Quality Checks](../setup-guide/data-quality-checks.md) lists join values the target does not have.

**One path per meaning.** Two paths to the same Data Mart are two groups of identical fields in the column picker, and a reader has to guess which is right. Keep both only when they mean different things — the customer who placed the order and the customer the session belonged to — and give each its own Output Alias and Description. A property of an object is a field, not a relationship.

The example model used on this page: events in a row, each joined to the next by what links them, and references below them as end points.

```text
Ad Spend ─(date, source, medium, campaign)─▶ Sessions ─(session_id)─▶ Orders ─(order_id)─▶ Order Lines
    │                                            │                        │                     │
(campaign_id)                           (traffic_source_id)         (customer_id)          (product_id)
    ▼                                            ▼                        ▼                     ▼
Campaigns                                  Traffic Sources            Customers             Products
```

And the shape to avoid. Spend reaches revenue through a reference, so a week of spend meets the source's sessions from all time, and orders without a session never reach the metric:

```text
Ad Spend ─(source, medium, campaign)─▶ Traffic Sources ─(traffic_source_id)─▶ Sessions ─(session_id)─▶ Orders
```

## Step 4: Choose the Base

The base keeps all of its rows, and everything joined to it is seen from it. So the first question about a metric is **which total has to be complete**. Make that Data Mart the base, and put the metric on it.

| Question                                      | Base                                                                                       | Complete      | Left out by design           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------- | ---------------------------- |
| ROAS and CPA of paid campaigns                | Ad Spend                                                                                   | all spend     | revenue no campaign paid for |
| Revenue by channel, organic included          | Orders                                                                                     | every order   | spend                        |
| Session conversion rate                       | Sessions                                                                                   | every session | orders without a session     |
| Spend and revenue side by side, both complete | a Data Mart at the grain they share ([Step 5](#step-5-put-each-metric-where-its-rows-are)) | both          | nothing                      |

What a wrong base costs, measured on a demo project: with Sessions as the base, one ad platform's spend came to $5,846.12 instead of $5,865.17, because eleven days had spend and no session. With Ad Spend as the base, it matched to the cent.

## Step 5: Put Each Metric Where Its Rows Are

- **Define a metric once, as a calculated field on its base Data Mart.** It is recomputed at whatever grain a report or an AI assistant asks for, and an assistant is told to [select it rather than rebuild it](../setup-guide/calculated-fields.md#using-the-field-from-an-ai-assistant).
- **Write a ratio as a ratio of sums:** `SUM(clicks) * 1.0 / NULLIF(SUM(impressions), 0)`. A ratio stored per row and averaged later is wrong: on one demo campaign, the average of daily CTRs was seven times the true CTR.
- **One metric, one home.** Two `ROAS` fields in two Data Marts are two answers, and an assistant picks one of them. Delete or hide the copy. Hide the raw inputs a metric replaces, too: formulas on the same Data Mart still read a hidden field.

**A ratio of two events, one side complete.** Paid ROAS is about spend: all of it counts, and revenue counts where a campaign paid for it. Put the formula on the spend Data Mart and read revenue through the real path — here `sessions` and `orders` are the SQL aliases of the two relationships:

```text
SUM(sessions.orders.revenue) / NULLIF(SUM(spend), 0)
```

Keep it one formula: a calculated field cannot reuse another calculated field that reads a joined Data Mart. OWOX warns that a formula reading a joined Data Mart leaves that Data Mart's unmatched rows out — for paid ROAS, that is the definition, not a defect.

**A ratio of two events, both sides complete.** Spend and revenue by channel with organic channels in, or total revenue over total spend, needs every row of both. A join cannot give that: whichever side is the base, the other loses its unmatched rows. Build one Data Mart at the grain the two share — aggregate each event to that grain separately, stack them with `UNION ALL`, and sum:

```sql
SELECT date, source, medium, campaign,
       SUM(spend) AS spend, SUM(revenue) AS revenue, SUM(orders) AS orders
FROM (
  SELECT date, source, medium, campaign,
         SUM(cost) AS spend, 0 AS revenue, 0 AS orders
  FROM ad_spend
  GROUP BY date, source, medium, campaign
  UNION ALL
  SELECT session_date, source, medium, campaign,
         0, SUM(revenue), COUNT(DISTINCT order_id)
  FROM attributed_orders
  GROUP BY session_date, source, medium, campaign
) AS facts
GROUP BY date, source, medium, campaign
```

Declare `date`, `source`, `medium` and `campaign` as its primary key, join it to your reference Data Marts like any other event, and define ROAS, CPA and CPC on it. Name it for what a row is — Marketing Performance, one row per day and campaign — not after one metric: it holds several. Pick one date for revenue — the day of the visit the spend bought, or the day of the order — and use it everywhere.

**Write the rules into the model, not into the prompt.** If ROAS covers paid channels only, say so in the Data Mart's description — an assistant reads it and applies it. Terms and rules shared by every Data Mart belong in the [project description](../setup-guide/mcp.md#add-project-context-for-your-assistant). A rule that lives in one person's prompt is missing from everyone else's answer.

**Group at or above the grain of the join.** A joined value belongs to its join key. Group spend by keyword while revenue joins by campaign, and each keyword shows the campaign's whole revenue: every row is overstated, while Totals stay right. See [Limitations and Considerations](../setup-guide/calculated-fields.md#limitations-and-considerations).

## Step 6: Describe the Model for People and AI

An assistant knows only what the model tells it.

| Where                    | What to write                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data Mart description    | The grain first — "One row per day and campaign" — then the scope (what is excluded: test orders, organic traffic), which date a row belongs to, and caveats. Catalog summaries show only the beginning. |
| Field description        | Unit or currency, what an empty value means, and which rows the value covers.                                                                                                                            |
| Relationship description | The business sentence, plus the caveat that stops a wrong question: "Sessions this spend bought, matched on day and campaign — not the cost of any single session."                                      |
| Output Alias             | A distinct name for every joined group, so two paths never look alike in the column picker.                                                                                                              |
| Project description      | Terminology and rules shared by all Data Marts.                                                                                                                                                          |

Data Mart descriptions are written on the [Overview tab](../setup-guide/sql-data-mart.md#step-4-add-a-description-optional-but-recommended), field descriptions in the [Output Schema](../setup-guide/sql-data-mart.md#step-3-define-output-schema), and relationship descriptions and Output Aliases on the relationship itself — see [Joinable Data Marts](../setup-guide/joinable-data-marts.md#step-3-describe-the-relationship-optional).

## Step 7: Check the Model Before You Hand It Over

- **Reconcile totals.** Each event's total, read from the base you will use, matches the total of its own Data Mart — or differs by exactly the rows you decided to leave out.
- **Run the checks.** **Primary key uniqueness** proves the grain, **Relationship integrity** lists join values the target lacks, and **Reverse relationship** lists target values nothing points to. See [Data Quality Checks](../setup-guide/data-quality-checks.md).
- **Read the warnings on calculated fields.** A warning that OWOX cannot tell whether a count is right means a Data Mart on the path declares no primary key.
- **Read the SQL** a report runs — see [View Generated SQL](../setup-guide/joinable-data-marts.md#view-generated-sql).
- **Ask the question the business will ask.** In your AI assistant, check that the answer names the Data Mart it used and selects your calculated field instead of dividing two columns itself.

## Common Mistakes

| Symptom                                                | Cause                                                                     | Fix                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A week of spend shows revenue from months ago          | Spend reaches revenue through a reference Data Mart, which has no date    | Join the two events on the date and the campaign                             |
| Spend in a report is lower than in the ad platform     | The base is Sessions or Orders, so spend without a session is unreachable | Make spend the base of spend metrics                                         |
| Revenue splits into `(null)` or duplicate channels     | A shared attribute derived differently in two Data Marts, or empty keys   | Derive it once; use one placeholder for empty keys                           |
| A joined attribute shows a list or an unexpected value | The join covers only part of the target's primary key                     | Join on the full key                                                         |
| A count across a join is too high or too low           | A plain `COUNT` over a joined field                                       | `COUNT(DISTINCT …)` over the joined Data Mart's own key, or its Unique Count |
| Two answers to "what is our ROAS"                      | The metric is defined in two Data Marts                                   | Keep one; hide or delete the other                                           |
| A Data Mart named after a metric                       | A metric modeled as an object                                             | Put the metric on the spend Data Mart, or on a Data Mart at the shared grain |
| Per-keyword revenue adds up to more than the total     | Grouping finer than the join key                                          | Group at or above the join's grain                                           |
| An assistant counts organic revenue in ROAS            | The scope rule lives in someone's prompt                                  | State the scope in the Data Mart description                                 |
| Campaigns from different platforms merge               | Grouping by campaign name alone, while names repeat across platforms      | Group by source and campaign, or by campaign ID                              |

## Checklist

Give your agent this page and the model as an OKF bundle or a JSON file ([export formats](../setup-guide/models-canvas-export.md#formats)), and ask for a review, not a verdict:

```text
Review the attached data model against the checklist on
https://docs.owox.com/docs/getting-started/best-practices/data-model-design/.
For each item that fails, name the Data Marts or relationships involved, the wrong number
it can produce, and the smallest change that fixes it. Judge by common sense about this
business, not by conformance to a modeling framework.
```

1. Each Data Mart is one object at one grain, and its description says what one row is.
2. Each Data Mart declares a primary key made of the fields that define its grain, and those fields are never empty.
3. Each Data Mart is either an event (it happens on a date and carries measures) or a reference (it describes a thing); one that is both is split.
4. No Data Mart is named after a metric, and each metric is defined in one Data Mart only.
5. No relationship leads from a reference Data Mart to an event Data Mart.
6. Each relationship to a reference Data Mart uses that Data Mart's full primary key.
7. Each path between two events relates rows that belong together: every hop carries a shared ID or the full shared key, date included.
8. No metric's path runs through a Data Mart that its rows can exist without.
9. Each ratio of two events sits on the Data Mart whose total must be complete, or on a Data Mart at the grain both events share.
10. A key or attribute shared by several Data Marts has the same values, type and empty-value placeholder in each.
11. Each relationship has a description that states the business link, and no two joined groups share a name.
12. Each scope rule an answer depends on — paid channels only, test orders excluded — is written in a description.

## Related Links

- [Joinable Data Marts →](../setup-guide/joinable-data-marts.md)
- [Calculated Fields →](../setup-guide/calculated-fields.md)
- [Report Aggregations and Totals →](../setup-guide/report-aggregations.md)
- [Data Quality Checks →](../setup-guide/data-quality-checks.md)
- [Export the Models Canvas →](../setup-guide/models-canvas-export.md)
- [MCP Server →](../setup-guide/mcp.md)
- Vlad Flaks: [Why You Need a Model to Make Sense of Your Data](https://www.vladflaks.com/thoughts/why-you-need-a-model-to-make-sense-of-your-data-1/), [Data Modeling. Where to Start](https://www.vladflaks.com/thoughts/data-modeling-where-to-start-4/), [When will I get my money back?](https://www.vladflaks.com/thoughts/when-will-i-get-my-money-back-5/)
