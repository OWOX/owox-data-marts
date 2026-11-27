---
'owox': minor
---

**See which companies and roles your LinkedIn ads reach: breakdowns by company and member demographics**

Teams that run account-based campaigns on LinkedIn judge them by the target companies they reach, not by clicks. The LinkedIn Ads connector imported metrics only by creative, campaign, account and location, so these teams copied company data from Campaign Manager by hand and could not join it with their CRM. Now six new endpoints import each campaign's daily impressions, clicks, spend, engagement and conversions per value: **Ad Analytics by Company**, **by Job Title**, **by Seniority**, **by Job Function**, **by Industry** and **by Company Size**. Each value comes with its LinkedIn URN and its English name, such as `Microsoft` for `urn:li:organization:1035`; company size comes as a band such as `SIZE_201_TO_500`.

![The LinkedIn Ads connector setup at the Select data step. The list ends with the six new endpoints: Ad Analytics by Company, by Job Title, by Seniority, by Job Function, by Industry and by Company Size](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/d5667669-cc61-4101-4ac4-76c52e125100/public)

- LinkedIn gives one breakdown at a time, so there is no table of job titles inside a company. Rows link to the campaign, not to the creative.
- LinkedIn returns at most the top 100 values for each ad on each day, drops values with fewer than 3 events, returns nothing for ads that reached too few members, and approximates the metrics. Sums over days can therefore be lower than Campaign Manager shows. Companies outside your targeting can also appear. Data can be 24–48 hours late.

See [metrics by company, job title, or other member demographics](../../packages/connectors/src/Sources/LinkedInAds/GETTING_STARTED.md#how-do-i-see-metrics-by-company-job-title-or-other-member-demographics) in the LinkedIn Ads guide.

<!-- markdownlint-disable-file MD041 MD036 -->
