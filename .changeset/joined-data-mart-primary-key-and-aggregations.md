---
'owox': minor
---

# Correct joined data mart aggregations and flag missing primary keys

When a joinable data mart field is deduplicated with a count (COUNT / Count Unique), its value in the blended result is a whole number, so reports can now sum, average, or take the min/max of it — the arithmetic aggregations appear automatically with Sum active by default. This makes funnel-style reports (for example sessions, add-to-carts, and purchases across shared dimensions) add up correctly instead of collapsing the joined events into a single concatenated string and under-counting them. Slices (pre-join filters) on such a deduplicated field now offer the operators for its original type, since a slice runs on the raw values before the join. Separately, a joined data mart that has no primary key now shows a "No primary key" warning in both the relationship list and the relationship graph, because without a key the join cannot deduplicate rows reliably and metrics from that data mart can be double-counted (fan-out).
