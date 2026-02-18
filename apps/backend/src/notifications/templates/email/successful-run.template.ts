import { EMAIL_STYLES } from './assets/styles';
import { emailHeader, emailFooter, dmCardStart, dmCardEnd } from './assets/blocks';

// Subject templates
export const successfulRunEmailSubjectSingle =
  '🟢 Data Mart run completed - Project: {{projectTitle}}';
export const successfulRunEmailSubjectBatch =
  '🟢 {{count}} Data Mart runs completed - Project: {{projectTitle}}';

export const successfulRunEmailTemplate = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>🟢 Data Mart runs completed successfully</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>${EMAIL_STYLES}</style>
</head>
<body style="Margin:0;padding:0;background-color:#f4f5f7;font-family:Arial, Helvetica, sans-serif;">

  <div class="preheader" style="font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    Data is up to date and ready to use${'&nbsp;&zwnj;'.repeat(150)}
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

                <h1 style="margin:0 0 12px 0;font-weight:600;font-size:20px;color:#0f172a;">
                  Data Mart runs completed successfully
                </h1>

                <p style="margin:12px 0 0 0;color:#374151;font-size:14px;">
                  Scheduled runs from {{groupingWindowLabel}} finished successfully.
                  Everything is running as expected.
                </p>

                ${dmCardStart}
                  <div style="padding:12px 16px;background-color:#ffffff;border-bottom:1px solid #e5e7eb;border-radius:6px;{{#unless @last}}margin-bottom:8px;{{/unless}}">
                    <table role="presentation" width="100%">
                      <tr>
                        {{#if iconSvg}}<td style="width:20px;text-align:center;vertical-align:top;padding-top:2px;"><div style="width:16px;height:16px;text-align:center;line-height:16px;box-sizing:border-box;">{{{iconSvg}}}</div></td>{{/if}}
                        <td style="font-size:14px;font-weight:600;color:#374151;">
                          {{startedAt}}
                          {{#if subtitle}}<div style="font-size:12px;font-weight:400;color:#6b7280;margin-top:2px;">{{subtitle}}</div>{{/if}}
                        </td>
                        <td style="font-size:14px;color:#00a63e;font-weight:600;text-align:right;vertical-align:top;">Success</td>
                      </tr>
                    </table>
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
