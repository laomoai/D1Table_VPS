export type MailEnv = {
  RESEND_API_KEY?: string
  MAIL_FROM?: string
  PUBLIC_ORIGIN: string
}

export async function sendMail(
  env: MailEnv,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn('[mail] RESEND_API_KEY not set; skip send to', to)
    return
  }
  const from = env.MAIL_FROM || 'D1Table <noreply@lemoai.cn>'
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Resend failed: ${resp.status} ${text}`)
  }
}

export function resetPasswordHtml(origin: string, token: string): string {
  const url = `${origin}/reset-password?token=${encodeURIComponent(token)}`
  return `<p>You requested a password reset for D1Table.</p>
<p><a href="${url}">Set a new password</a></p>
<p>This link expires in 1 hour. If you did not request it, ignore this email.</p>`
}

export function inviteHtml(origin: string, token: string): string {
  const url = `${origin}/reset-password?token=${encodeURIComponent(token)}`
  return `<p>You have been invited to D1Table.</p>
<p><a href="${url}">Set your password and sign in</a></p>
<p>This link expires in 7 days.</p>`
}
