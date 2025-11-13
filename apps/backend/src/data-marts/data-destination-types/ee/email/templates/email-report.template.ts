export interface EmailReportTemplateProps {
  reportBody: string;
  dataMartTitle: string;
  dataMartId: string;
  projectId: string;
  publicOrigin: string;
}

/**
 * Renders an HTML string for the email report template.
 *
 * TODO: must migrate to a template engine in future updates
 *
 * @param {EmailReportTemplateProps} props - An object containing the required properties to populate the email report template.
 * @param {string} props.publicOrigin - The public origin URL used for links within the email template.
 * @param {string} props.reportBody - The main body content of the email report.
 * @param {string} props.dataMartTitle - The title of the data mart displayed in the footer of the email.
 * @param {string} props.projectId - The project ID used to generate URLs for editing the report.
 * @param {string} props.dataMartId - The data mart ID used to generate URLs for editing the report.
 * @return {string} The rendered email report HTML as a string.
 */
export function renderEmailReportTemplate(props: EmailReportTemplateProps): string {
  return `    
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>OWOX Notification</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    @media only screen and (max-width:600px) {
      .container { width:100% !important; }
      .stack-column, .stack-column-center { display:block !important; width:100% !important; max-width:100% !important; }
      .stack-column-center { text-align:center !important; }
      .logo { margin:0 auto !important; }
      .header-right { padding-top:8px !important; }
    }
    .preheader { display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; }
  </style>
</head>
<body style="Margin:0;padding:0;background-color:#f4f5f7;font-family:Arial, Helvetica, sans-serif;">
  <!-- Outer wrapper -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:20px 16px;">

        <!-- HEADER on transparent background -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="width:600px;max-width:100%;">
          <tr>
            <td style="padding:16px 0px 12px 0px;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <!-- Left: logo -->
                  <td class="stack-column" style="vertical-align:middle;text-align:left;">
                    <a href="${props.publicOrigin}" target="_blank" rel="noopener noreferrer" style="display:inline-block;text-decoration:none;color:#1E88E5;font-size:14px;font-weight:bold;">
                      <span style="display:inline-block;padding:0px 4px;height:30px;border-radius:6px;border:1px solid #e6e9ee;background-color:#ffffff;text-align:center;line-height:28px;">
                        <img alt="OWOX Data Marts" width="24" style="display:inline-block;vertical-align:middle;" src="https://cdn.prod.website-files.com/676a9690ef4ec151a6957187/67925ebc5ee92f1146111dd8_34665.png"/>
                      </span>
                      <span style="display:inline-block;color:#0f172a;padding-left:2px;">OWOX Data Marts</span>
                    </a>
                  </td>                 
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Main content container on white background -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,0.05);">
          
          <!-- CONTENT -->
          <tr>
            <td role="article" aria-label="Email content" style="padding:24px;">
              ${props.reportBody}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:12px 20px;background-color:#f9fafb;border-top:1px solid #e6e9ee;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;text-align:left;font-size:13px;color:#6b7280;">
                    <span>Data Mart:</span>
                    ${props.dataMartTitle}
                  </td>
                  <td style="vertical-align:middle;text-align:right;font-size:13px;color:#6b7280;">
                    <a href="${props.publicOrigin}/ui/${props.projectId}/data-marts/${props.dataMartId}/reports" target="_blank" rel="noopener noreferrer" style="color:#1E88E5;text-decoration:none;">Edit report</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- End main container -->

      </td>
    </tr>
  </table>

</body>
</html>    
    `.trim();
}
