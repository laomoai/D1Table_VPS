import { Hono } from 'hono'
import { avatarSvg } from '../utils/avatar'

const avatars = new Hono()

avatars.get('/:seed', (c) => {
  const seed = decodeURIComponent(c.req.param('seed') || '').slice(0, 200)
  const svg = avatarSvg(seed)
  return c.body(svg, 200, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400, immutable',
  })
})

export default avatars
