
import { supabaseFunctionsUrl } from './supabaseClient';
import { DEFAULT_ADMIN_EMAIL } from '../constants';

type SendInventoryEmailParams = {
  tenantName: string;
  tenantAdminEmail: string;
  subjectHeader: string;
  body: string;
};

export async function sendInventoryEmail({
  tenantName,
  tenantAdminEmail,
  subjectHeader,
  body,
}: SendInventoryEmailParams): Promise<void> {
  // Central inbox for Resend sandbox – must match DEFAULT_ADMIN_EMAIL
  const centralInbox = DEFAULT_ADMIN_EMAIL;
  
  // Directly use the subject header requested (e.g. "New Inventory").
  // Do NOT add prefixes like "Estimate for".
  const subject = subjectHeader;

  const endpoint = `${supabaseFunctionsUrl}/send-estimate-email`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: centralInbox,
      subject,
      body,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Email send failed: ${response.status} ${text}`);
  }
}