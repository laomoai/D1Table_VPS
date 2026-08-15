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
  const from = env.MAIL_FROM || '墨问 <noreply@mail.lemoai.cn>'
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
  return `<p>你正在重置墨问（MoWen）的登录密码。</p>
<p><a href="${url}">设置新密码</a></p>
<p>链接 1 小时内有效。若不是你本人操作，请忽略这封邮件。</p>`
}

export function inviteHtml(origin: string, token: string): string {
  const url = `${origin}/reset-password?token=${encodeURIComponent(token)}`
  return `<p>你被邀请加入墨问（MoWen）。</p>
<p><a href="${url}">设置密码并登录</a></p>
<p>链接 7 天内有效。</p>`
}
