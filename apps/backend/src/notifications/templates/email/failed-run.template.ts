import { EMAIL_STYLES } from './assets/styles';
import { emailHeader, emailFooter, dmCardStart, dmCardEnd } from './assets/blocks';

// Subject templates
export const failedRunEmailSubjectSingle = '🔴 Data Mart run failed: {{dataMartTitle}}';
export const failedRunEmailSubjectBatch = '🔴 {{count}} Data Mart runs failed';

export const failedRunEmailTemplate = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>🔴 Some Data Mart runs failed</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>${EMAIL_STYLES}</style>
</head>
<body style="Margin:0;padding:0;background-color:#f4f5f7;font-family:Arial, Helvetica, sans-serif;">

  <div class="preheader" style="font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Failed Data Mart runs detected in project {{projectTitle}}
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:20px 16px;">
${emailHeader}

        <!-- MAIN CONTENT -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.05);">
          <tr>
            <td role="article" aria-label="Email content" style="padding:24px;">
              <div style="font-family:Arial, Helvetica, sans-serif;color:#0f172a;font-size:15px;line-height:1.5;">

                <h1 style="margin:0 0 12px 0;font-weight:600;font-size:20px;color:#dc2626;">
                  Some Data Mart runs failed
                </h1>

                <p style="margin:12px 0 0 0;color:#374151;font-size:14px;">
                  We detected failed runs in one or more Data Marts during {{groupingWindowLabel}}.
                  Review the details below to identify the issue.
                </p>

                ${dmCardStart}
                  <div style="padding:12px 16px;background-color:#ffffff;border-bottom:1px solid #e5e7eb;border-radius:6px;{{#unless @last}}margin-bottom:8px;{{/unless}}">
                    <table role="presentation" width="100%">
                      <tr>
                        <td style="font-size:14px;font-weight:600;color:#374151;">
                          {{startedAt}}
                          {{#if runTypeLabel}}<div style="font-size:12px;font-weight:400;color:#6b7280;margin-top:2px;">{{runTypeLabel}}</div>{{/if}}
                        </td>
                        <td style="font-size:14px;color:#dc2626;font-weight:600;text-align:right;vertical-align:top;">Failed</td>
                      </tr>
                    </table>

                    <div style="padding-top:8px;">
                      <div style="padding:12px 12px 4px;background:#fff5f5;border-radius:6px;font-size:12px;line-height:1.4;color:#C10007;word-break:break-word;">
                        <div style="padding-bottom:8px;">
                          <strong>Run ID:</strong><br>
                          {{runId}}
                        </div>
                        {{#if errors}}
                        <div style="padding-bottom:8px;">
                          <strong>Error{{#if errors.[1]}}s{{/if}}:</strong>
                          {{#each errors}}
                          <div style="margin-top:4px;word-break:break-word;">{{message}}{{#if hasMore}}&hellip; <span style="color:#9ca3af;">&lt;more&gt;</span>{{/if}}</div>
                          {{/each}}
                        </div>
                        {{/if}}
                      </div>
                    </div>
                  </div>
                ${dmCardEnd}

              </div>
            </td>
          </tr>
${emailFooter}
        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
