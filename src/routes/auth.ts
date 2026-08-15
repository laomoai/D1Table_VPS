import { Hono } from 'hono'
import type { Env, AuthVariables, SessionUser } from '../types'
import {
  createSessionCookie, clearSessionCookie, verifySession,
} from '../utils/session'
import { hashPassword, verifyPassword, generateToken } from '../utils/password'
import { sendMail, resetPasswordHtml, inviteHtml } from '../mail/resend'
import { withAvatar } from '../utils/avatar'

const auth = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function createBootstrapAdmin(
  c: { env: Env },
  email: string,
  name: string,
  passwordHash: string,
): Promise<void> {
  const teamResult = await c.env.DB.prepare(
    `INSERT INTO _teams (name) VALUES (?)`,
  ).bind(`${name}'s Team`).run()
  const teamId = teamResult.meta.last_row_id
  await c.env.DB.prepare(
    `INSERT INTO _users (email, name, picture, role, last_login, team_id, password_hash)
     VALUES (?, ?, '', 'admin', unixepoch(), ?, ?)`,
  ).bind(email, name, teamId, passwordHash).run()
  const newUser = await c.env.DB.prepare(
    `SELECT id FROM _users WHERE email = ?`,
  ).bind(email).first<{ id: number }>()
  if (newUser) {
    await c.env.DB.prepare(`UPDATE _teams SET created_by = ? WHERE id = ?`).bind(newUser.id, teamId).run()
  }
}

async function issueSession(c: { req: { url: string } }, env: Env, user: SessionUser) {
  const isSecure = new URL(c.req.url).protocol === 'https:'
  return createSessionCookie(user, env.SESSION_SECRET, isSecure)
}

auth.get('/setup-status', async (c) => {
  const userCount = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM _users`).first<{ cnt: number }>()
  return c.json({
    data: {
      bootstrap: !userCount || userCount.cnt === 0,
      publicRegister: (c.env.ALLOW_PUBLIC_REGISTER ?? 'false') === 'true',
    },
  })
})

// POST /register — 仅当用户表为空，或 ALLOW_PUBLIC_REGISTER=true
auth.post('/register', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; name?: string }>().catch(() => ({}))
  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''
  const name = (body.name?.trim() || email.split('@')[0] || 'User')

  if (!isValidEmail(email) || password.length < 8) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Valid email and password (min 8 chars) are required' } }, 400)
  }

  const userCount = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM _users`).first<{ cnt: number }>()
  const empty = !userCount || userCount.cnt === 0
  const publicOk = (c.env.ALLOW_PUBLIC_REGISTER ?? 'false') === 'true'
  if (!empty && !publicOk) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Registration is closed' } }, 403)
  }

  const existing = await c.env.DB.prepare(`SELECT id FROM _users WHERE email = ?`).bind(email).first()
  if (existing) {
    return c.json({ error: { code: 'USER_EXISTS', message: 'Email already registered' } }, 409)
  }

  const passwordHash = await hashPassword(password)
  if (empty) {
    await createBootstrapAdmin(c, email, name, passwordHash)
  } else {
    const teamResult = await c.env.DB.prepare(`INSERT INTO _teams (name) VALUES (?)`).bind(`${name}'s Team`).run()
    const teamId = teamResult.meta.last_row_id
    await c.env.DB.prepare(
      `INSERT INTO _users (email, name, picture, role, last_login, team_id, password_hash)
       VALUES (?, ?, '', 'user', unixepoch(), ?, ?)`,
    ).bind(email, name, teamId, passwordHash).run()
    const newUser = await c.env.DB.prepare(`SELECT id FROM _users WHERE email = ?`).bind(email).first<{ id: number }>()
    if (newUser) {
      await c.env.DB.prepare(`UPDATE _teams SET created_by = ? WHERE id = ?`).bind(newUser.id, teamId).run()
    }
  }

  const sessionCookie = await issueSession(c, c.env, { email, name, picture: withAvatar('', email) })
  return new Response(JSON.stringify({ data: { email, name } }), {
    status: 201,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie,
    },
  })
})

auth.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => ({}))
  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''
  if (!email || !password) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Email and password are required' } }, 400)
  }

  const row = await c.env.DB.prepare(
    `SELECT id, name, picture, status, team_id, password_hash FROM _users WHERE email = ? LIMIT 1`,
  ).bind(email).first<{
    id: number
    name: string
    picture: string
    status: string
    team_id: number | null
    password_hash: string | null
  }>()

  if (!row || row.status === 'disabled' || !row.password_hash) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }, 401)
  }
  if (!row.team_id) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Account has no space' } }, 403)
  }
  const ok = await verifyPassword(password, row.password_hash)
  if (!ok) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }, 401)
  }

  await c.env.DB.prepare(`UPDATE _users SET last_login = unixepoch() WHERE id = ?`).bind(row.id).run()
  const sessionCookie = await issueSession(c, c.env, {
    email,
    name: row.name,
    picture: withAvatar(row.picture, email),
  })
  return new Response(JSON.stringify({ data: { email, name: row.name } }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie,
    },
  })
})

auth.post('/forgot-password', async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({}))
  const email = body.email?.trim().toLowerCase() ?? ''
  if (!isValidEmail(email)) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Valid email is required' } }, 400)
  }

  const user = await c.env.DB.prepare(
    `SELECT id FROM _users WHERE email = ? AND status = 'active'`,
  ).bind(email).first<{ id: number }>()

  // Always 200 to avoid email enumeration
  if (user) {
    const token = generateToken()
    const expires = Math.floor(Date.now() / 1000) + 3600
    await c.env.DB.prepare(
      `INSERT INTO _password_resets (token, user_id, expires_at) VALUES (?, ?, ?)`,
    ).bind(token, user.id, expires).run()
    const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin
    try {
      await sendMail(c.env, email, '重置墨问密码', resetPasswordHtml(origin, token))
    } catch (err) {
      console.error('[mail] forgot-password failed', err)
      return c.json({ error: { code: 'MAIL_FAILED', message: 'Could not send email' } }, 502)
    }
  }

  return c.json({ data: { sent: true } })
})

auth.post('/reset-password', async (c) => {
  const body = await c.req.json<{ token?: string; password?: string }>().catch(() => ({}))
  const token = body.token?.trim() ?? ''
  const password = body.password ?? ''
  if (!token || password.length < 8) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Token and password (min 8 chars) are required' } }, 400)
  }

  const now = Math.floor(Date.now() / 1000)
  const row = await c.env.DB.prepare(
    `SELECT id, user_id, expires_at, used_at FROM _password_resets WHERE token = ?`,
  ).bind(token).first<{ id: number; user_id: number; expires_at: number; used_at: number | null }>()

  if (!row || row.used_at || row.expires_at < now) {
    return c.json({ error: { code: 'INVALID_TOKEN', message: 'Reset link is invalid or expired' } }, 400)
  }

  const passwordHash = await hashPassword(password)
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE _users SET password_hash = ? WHERE id = ?`).bind(passwordHash, row.user_id),
    c.env.DB.prepare(`UPDATE _password_resets SET used_at = unixepoch() WHERE id = ?`).bind(row.id),
  ])

  const user = await c.env.DB.prepare(
    `SELECT email, name, picture FROM _users WHERE id = ?`,
  ).bind(row.user_id).first<{ email: string; name: string; picture: string }>()
  if (!user) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  }

  const sessionCookie = await issueSession(c, c.env, {
    email: user.email,
    name: user.name,
    picture: withAvatar(user.picture, user.email),
  })
  return new Response(JSON.stringify({ data: { email: user.email } }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie,
    },
  })
})

auth.post('/logout', (c) => {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
    },
  })
})

auth.get('/me', async (c) => {
  const cookieHeader = c.req.header('Cookie') ?? ''
  if (!cookieHeader) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401)
  }

  const user = await verifySession(cookieHeader, c.env.SESSION_SECRET)
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401)
  }

  const userRow = await c.env.DB.prepare(
    `SELECT u.id, u.role, u.status, u.team_id, t.name as team_name
     FROM _users u LEFT JOIN _teams t ON t.id = u.team_id
     WHERE u.email = ? LIMIT 1`,
  ).bind(user.email).first<{ id: number; role: string; status: string; team_id: number | null; team_name: string | null }>()

  if (!userRow || userRow.status !== 'active') {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'User account not found or disabled' } }, 401)
  }

  return c.json({
    data: {
      id: userRow.id, email: user.email, name: user.name, picture: withAvatar(user.picture, user.email), role: userRow.role,
      team: userRow.team_id ? { id: userRow.team_id, name: userRow.team_name } : null,
    },
  })
})

export async function sendInviteEmail(env: Env, userId: number, email: string): Promise<void> {
  const token = generateToken()
  const expires = Math.floor(Date.now() / 1000) + 7 * 86400
  await env.DB.prepare(
    `INSERT INTO _password_resets (token, user_id, expires_at) VALUES (?, ?, ?)`,
  ).bind(token, userId, expires).run()
  await sendMail(env, email, '邀请你加入墨问', inviteHtml(env.PUBLIC_ORIGIN, token))
}

export default auth
