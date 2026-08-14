import { createAvatar } from '@dicebear/core'
import * as lorelei from '@dicebear/lorelei'

/** Deterministic open-source avatar (DiceBear Lorelei) for email/password users. */
export function avatarSvg(seed: string): string {
  return createAvatar(lorelei, {
    seed: seed.trim().toLowerCase() || 'd1table',
    size: 128,
    backgroundType: ['solid'],
  }).toString()
}

export function avatarPath(seed: string): string {
  return `/api/avatars/${encodeURIComponent(seed.trim().toLowerCase())}`
}

export function withAvatar(picture: string | null | undefined, email: string): string {
  if (picture && picture.trim()) return picture
  return avatarPath(email)
}
