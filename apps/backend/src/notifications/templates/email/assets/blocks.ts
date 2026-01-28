import { OWOX_LOGO, DM_ICON } from './img';

export const emailHeader = `
        <!-- HEADER -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="width:600px;max-width:100%;">
          <tr>
            <td style="padding:16px 0px 12px 0px;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="stack-column" style="vertical-align:middle;text-align:left;">
                    <a href="https://app.owox.com" target="_blank" rel="noopener noreferrer" style="display:inline-block;text-decoration:none;color:#1E88E5;font-size:14px;font-weight:bold;">
                      <span style="display:inline-block;padding:0px 4px;height:30px;border-radius:6px;border:1px solid #e6e9ee;background-color:#ffffff;text-align:center;line-height:28px;">
                        ${OWOX_LOGO}
                      </span>
                      <span style="display:inline-block;color:#0f172a;padding-left:2px;vertical-align:middle;">OWOX Data Marts</span>
                    </a>
                  </td>
                  <td class="stack-column stack-column-center header-right" style="vertical-align:middle;text-align:right;font-size:13px;color:#6b7280;padding-left:12px;">
                    <span style="display:inline-block;">Project: {{projectTitle}}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`;

export const emailFooter = `
          <tr>
            <td style="padding:12px 20px;background-color:#f9fafb;border-top:1px solid #e6e9ee;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;text-align:left;font-size:13px;color:#6b7280;">
                    <span>This is an automated notification from OWOX Data Marts.</span>
                  </td>
                  <td style="vertical-align:middle;text-align:right;font-size:13px;color:#6b7280;">
                    Need help?
                    <a href="https://docs.owox.com/?utm_source=notifications&utm_medium=email&utm_campaign=service_notifications" target="_blank" rel="noopener noreferrer" style="color:#1E88E5;text-decoration:none;">Visit docs.owox.com</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

export const dmCardStart = `
                {{#each dataMarts}}
                <div style="margin-top:20px;padding:16px;background-color:#FAFAFA;border-radius:8px;border-bottom:1px solid #e6e9ee;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="width:28px;vertical-align:middle;">
                        <div style="width:28px;height:28px;background-color:#F0F1F3;border-radius:6px;text-align:center;line-height:28px;font-size:14px;padding:5px;box-sizing:border-box;color:#0f172a;">
                          ${DM_ICON}
                        </div>
                      </td>
                      <td style="vertical-align:middle;padding-left:8px;">
                        <div style="font-size:16px;font-weight:600;color:#0f172a;">{{dataMartTitle}}</div>
                      </td>
                      <td style="vertical-align:middle;text-align:right;white-space:nowrap;">
                        <a href="{{dataMartUrl}}" target="_blank" rel="noopener noreferrer"
                           style="display:inline-block;background-color:#ffffff;border:1px solid #d1d5db;color:#374151;padding:6px 12px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;">
                          Open Data Mart
                        </a>
                      </td>
                    </tr>
                  </table>

                  <div style="font-size:1px;line-height:1px;height:16px;">&nbsp;</div>

                  {{#each runs}}`;

export const dmCardEnd = `
                  {{/each}}
                  {{#if hiddenRunsLabel}}
                  <div style="margin-top:8px;padding:8px 14px;background-color:#f9fafb;border-radius:6px;font-size:12px;color:#6b7280;text-align:center;">
                    and {{hiddenRunsLabel}} &mdash;
                    <a href="{{dataMartRunHistoryUrl}}" target="_blank" rel="noopener noreferrer" style="color:#1E88E5;text-decoration:none;">View all</a>
                  </div>
                  {{/if}}
                </div>
                {{/each}}
                {{#if hiddenDataMartsLabel}}
                <div style="margin-top:12px;padding:8px 14px;background-color:#f9fafb;border-radius:6px;font-size:12px;color:#6b7280;text-align:center;">
                  and {{hiddenDataMartsLabel}} &mdash;
                  <a href="{{dataMartListUrl}}" target="_blank" rel="noopener noreferrer" style="color:#1E88E5;text-decoration:none;">View all</a>
                </div>
                {{/if}}`;
