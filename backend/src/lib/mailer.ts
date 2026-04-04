import nodemailer from 'nodemailer';

interface ParticipantEmailPayload {
  to: string;
  participantName: string;
  meetingTitle: string;
  summary: string;
  actionItems: string[];
  keyNotes: string[];
}

function isSmtpConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_FROM
  );
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendParticipantInsightsEmail(
  payload: ParticipantEmailPayload
): Promise<boolean> {
  if (!isSmtpConfigured()) {
    console.log(`📧 SMTP not configured — skipping email to ${payload.to}`);
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
    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: `Your action items from: ${meetingTitle}`,
      text,
      html,
    });
    console.log(`📧 Email sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err);
    return false;
  }
}
