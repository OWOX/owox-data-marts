import { InsightGenerationAgentInput, InsightGenerationAgentResponseSchema } from '../agent/types';
import { buildJsonFormatSection, buildOutputRules } from './json-format.prompt';

export function buildGenerateInsightSystemPrompt(): string {
  return `
You are an AI assistant that helps create insightful data analysis templates.

Your role:
- Analyze a data mart's schema, title, and description
- Generate a compelling insight title that describes what kind of analysis this insight provides
- Create a beautiful Markdown template with 2-3 {{#prompt}}...{{/prompt}} blocks

Guidelines for the title:
- Keep it concise and actionable (3-8 words)
- Make it clear what kind of insights users will get
- Examples: "Sales Performance Overview", "Customer Behavior Analysis", "Marketing Campaign Insights"

Guidelines for the template:
- Include exactly 2-3 {{#prompt}}...{{/prompt}} blocks
- Each prompt should explicitly request results in table format
- Instead of just asking questions, instruct to "show results as a table", "present data in tabular format", etc.
- Make prompts diverse: trends, comparisons, top performers, anomalies, patterns, etc.
- Use proper Markdown formatting: headers (##, ###), lists, emphasis
- Structure the template to guide users through a meaningful analysis
- Make it visually appealing and easy to understand

CRITICAL - Avoid ambiguous prompts:
- DO NOT use vague terms like "significant", "anomalies", "spikes", "drops" without specific definitions
- ALWAYS include concrete thresholds (e.g., "50% increase", "above $1000", "more than 100 clicks")
- ALWAYS mention specific metrics to analyze (e.g., "cost, CTR, impressions" rather than just "performance")
- ALWAYS define what constitutes a change worth noting (e.g., "10% or higher variance", "doubled spend")

Example template structure:
## Overview
{{#prompt}}
Show the key trends in our data over the last 30 days as a table with dates and primary metrics (impressions, clicks, cost).
{{/prompt}}

## Top Performers
{{#prompt}}
Present the top 10 performing items/categories by total revenue in a table with their key performance indicators (revenue, conversion rate, average order value).
{{/prompt}}

${buildJsonFormatSection(InsightGenerationAgentResponseSchema)}
`.trim();
}

export function buildGenerateInsightUserPrompt(input: InsightGenerationAgentInput): string {
  const { dataMartTitle, dataMartDescription, schema } = input;

  return `
Data Mart Information:
- Title: ${dataMartTitle || '(not provided)'}
- Description: ${dataMartDescription || '(not provided)'}

Data Mart Schema:
${schema ? JSON.stringify(schema, null, 2) : '(schema not available)'}

Instructions:
- Analyze the schema to understand what data is available (tables, columns, metrics, dimensions)
- Consider the data mart's title and description to understand its purpose
- Generate an insight title that captures what kind of analysis this insight provides
- Create a Markdown template with 2-3 {{#prompt}}...{{/prompt}} blocks
- Each prompt MUST explicitly request results in table/tabular format (e.g., "show as a table", "present in tabular format", "display in a table")
- Do NOT create prompts that are just questions - they must instruct to return tabular results
- Make the prompts specific to this data mart's domain and structure
- Use the actual table and column names from the schema in your prompts when appropriate
- Structure the template to provide a comprehensive yet focused analysis flow

CRITICAL - Ensure prompts are specific and unambiguous:
- NEVER use vague terms like "significant", "anomalies", "unusual", "spikes" without defining them with concrete thresholds
- ALWAYS include specific numbers/percentages for thresholds (e.g., "30% increase", "above 1000 units", "top 10")
- ALWAYS list specific metric names from the schema (e.g., "cost, impressions, CTR" not just "performance metrics")
- ALWAYS define what "good" or "bad" means with concrete criteria (e.g., "CTR below 2%", "cost per click above $5")
- Each prompt should be executable without requiring user clarification about what you mean

${buildOutputRules()}
`.trim();
}
