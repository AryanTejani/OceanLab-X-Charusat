import { Resend } from 'resend';

interface ParticipantEmailPayload {
  to: string;
  participantName: string;
  meetingTitle: string;
  summary: string;
  actionItems: string[];
  keyNotes: string[];
}

function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.SMTP_FROM);
}

function getResendClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendParticipantInsightsEmail(
  payload: ParticipantEmailPayload
): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.log(`📧 Email not configured — skipping email to ${payload.to}`);
    return false;
  }

  const { to, participantName, meetingTitle, summary, actionItems, keyNotes } = payload;

  const actionItemsHtml = actionItems.length
    ? `<ul>${actionItems.map((a) => `<li>${a}</li>`).join('')}</ul>`
    : '<p>No action items assigned to you.</p>';

  const keyNotesHtml = keyNotes.length
    ? `<ul>${keyNotes.map((n) => `<li>${n}</li>`).join('')}</ul>`
    : '<p>No key notes.</p>';

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0E78F9;">Your Meeting Summary</h2>
      <p>Hi ${participantName},</p>
      <p>Here are your personalized insights from <strong>${meetingTitle}</strong>.</p>

      <h3>Your Summary</h3>
      <p>${summary}</p>

      <h3>Your Action Items</h3>
      ${actionItemsHtml}

      <h3>Key Notes for You</h3>
      ${keyNotesHtml}

      <hr style="margin-top: 32px;" />
      <p style="color: #888; font-size: 12px;">Powered by MeetMind AI</p>
    </div>
  `;

  const text = [
    `Your Meeting Summary — ${meetingTitle}`,
    '',
    `Hi ${participantName},`,
    '',
    'YOUR SUMMARY',
    summary,
    '',
    'YOUR ACTION ITEMS',
    actionItems.length ? actionItems.map((a) => `- ${a}`).join('\n') : 'No action items assigned to you.',
    '',
    'KEY NOTES',
    keyNotes.length ? keyNotes.map((n) => `- ${n}`).join('\n') : 'No key notes.',
  ].join('\n');

  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: process.env.SMTP_FROM!,
      to,
      subject: `Your action items from: ${meetingTitle}`,
      text,
      html,
    });
    if (error) throw error;
    console.log(`📧 Email sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err);
    return false;
  }
}
