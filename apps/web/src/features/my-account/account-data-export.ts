import { z } from 'zod';
import { downloadBlob } from '../data-marts/model-canvas/export/download';
import { getAccountPersonalData, type AccountSession } from './account-profile.service';

const personalDataSchema = z.object({
  account: z.string(),
  email: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  companyName: z.string().nullable(),
  companyWebsite: z.string().nullable(),
  policyInteraction: z
    .enum([
      'inactive',
      'with_projects_and_email_subscriptions',
      'with_projects',
      'with_email_subscriptions',
    ])
    .nullable(),
});

export type PersonalData = z.infer<typeof personalDataSchema>;

const commonPurpose = [
  'To communicate with you and manage our relationship with you.',
  'To comply with OWOX legal obligations and for compliance reasons, such as the prevention, detection, or investigation of a crime; loss prevention; or fraud.',
].join(' ');
const projectPurpose = [
  'To provide OWOX services to you and technical support.',
  'To personalize and improve your customer experience in OWOX.',
  'To improve OWOX services, fulfill our administrative purposes and protect OWOX business interests.',
  'To showcase the results of using OWOX services or your feedback, only upon prior agreement with you and to the agreed extent.',
].join(' ');
const emailPurpose = 'To inform you about OWOX news and offers that you may like';
const purposes = {
  inactive: commonPurpose,
  with_projects_and_email_subscriptions: [commonPurpose, projectPurpose, emailPurpose].join(' '),
  with_projects: [commonPurpose, projectPurpose].join(' '),
  with_email_subscriptions: [commonPurpose, emailPurpose].join(' '),
};

/** Keeps the existing Platform export's disclosure, field names and signed-link omissions. */
export function buildPersonalDataExport(data: PersonalData) {
  return {
    'The categories and specific pieces of personal information': {
      account: data.account,
      name: data.name,
      email: data.email,
      phone: data.phone ?? undefined,
      'company-name': data.companyName ?? undefined,
      'company-website': data.companyWebsite ?? undefined,
    },
    'The categories of sources from which the personal information received':
      'received through our communications and through publicly accessible sources',
    'The business or commercial purpose for collecting or selling personal information':
      data.policyInteraction ? purposes[data.policyInteraction] : undefined,
    'The categories of third parties with whom the business shares personal information':
      'www.owox.com/policies/processors',
    'The categories of third parties whom the business sales personal information':
      'Kindly note that OWOX did not sell any information about you to third parties.',
  };
}

export async function downloadPersonalData(origin: string, session: AccountSession): Promise<void> {
  savePersonalData(await getAccountPersonalData(origin, session));
}

export async function savePersonalDataResponse(response: Response): Promise<void> {
  if (!response.ok) throw new Error('Could not download your personal data. Try again.');
  savePersonalData(await response.json());
}

function savePersonalData(response: unknown): void {
  const data = personalDataSchema.parse(response);
  downloadBlob(
    new Blob([JSON.stringify(buildPersonalDataExport(data), null, 2)], {
      type: 'application/json',
    }),
    'user_info.json'
  );
}
