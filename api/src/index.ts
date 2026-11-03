import { type Context, Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

type AppEnv = { Bindings: Env }

type HomeRow = { id: string; name: string }
type MemberRow = { id: string; homeId: string; name: string }
type BillRow = { id: string; homeId: string; title: string; totalCents: number }
type ShareRow = {
  id: string
  billId: string
  memberId: string
  amountCents: number
  paidAt: string | null
  idempotencyKey: string | null
}
type BalanceRow = { memberId: string; name: string; outstandingCents: number }

const app = new Hono<AppEnv>()

function jsonError(c: Context<AppEnv>, status: ContentfulStatusCode, error: string) {
  return c.json({ error }, status)
}

async function readJsonBody(c: Context<AppEnv>): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
    return body as Record<string, unknown>
  } catch {
    return null
  }
}

function readName(body: Record<string, unknown> | null): string | null {
  if (!body) return null
  const name = body.name
  if (typeof name !== 'string' || name.trim().length === 0) return null
  return name
}

async function findHome(db: D1Database, homeId: string): Promise<HomeRow | null> {
  return db.prepare('SELECT id, name FROM homes WHERE id = ?').bind(homeId).first<HomeRow>()
}

async function findShareForBill(
  db: D1Database,
  billId: string,
  shareId: string,
): Promise<ShareRow | null> {
  return db
    .prepare(
      `SELECT id, bill_id AS billId, member_id AS memberId,
              amount_cents AS amountCents, paid_at AS paidAt,
              idempotency_key AS idempotencyKey
         FROM shares
        WHERE id = ? AND bill_id = ?`,
    )
    .bind(shareId, billId)
    .first<ShareRow>()
}

app.get('/api/health', (c) => c.json({ status: 'ok' }))

// Homes ----------------------------------------------------------------------

app.get('/api/homes', async (c) => {
  const homes = await c.env.DB.prepare('SELECT id, name FROM homes ORDER BY rowid')
    .all<HomeRow>()
    .then((result) => result.results)
  const members = await c.env.DB.prepare(
    'SELECT id, home_id AS homeId, name FROM members ORDER BY home_id, position',
  )
    .all<MemberRow>()
    .then((result) => result.results)

  const membersByHome = new Map<string, MemberRow[]>()
  for (const member of members) {
    const list = membersByHome.get(member.homeId)
    if (list) list.push(member)
    else membersByHome.set(member.homeId, [member])
  }

  return c.json({
    homes: homes.map((home) => ({ ...home, members: membersByHome.get(home.id) ?? [] })),
  })
})

app.post('/api/homes', async (c) => {
  const name = readName(await readJsonBody(c))
  if (name === null) return jsonError(c, 400, 'name must be a non-empty string')

  const id = crypto.randomUUID()
  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?, ?)').bind(id, name).run()
  return c.json({ id, name }, 201)
})

app.get('/api/homes/:homeId', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await findHome(c.env.DB, homeId)
  if (!home) return jsonError(c, 404, 'Home not found')

  const members = await c.env.DB.prepare(
    'SELECT id, home_id AS homeId, name FROM members WHERE home_id = ? ORDER BY position',
  )
    .bind(homeId)
    .all<MemberRow>()
    .then((result) => result.results)

  return c.json({ ...home, members })
})

// Members --------------------------------------------------------------------

app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await findHome(c.env.DB, homeId)
  if (!home) return jsonError(c, 404, 'Home not found')

  const name = readName(await readJsonBody(c))
  if (name === null) return jsonError(c, 400, 'name must be a non-empty string')

  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO members (id, home_id, name, position)
     SELECT ?, ?, ?, COALESCE(MAX(position), -1) + 1
       FROM members
      WHERE home_id = ?`,
  )
    .bind(id, homeId, name, homeId)
    .run()

  return c.json({ id, homeId, name }, 201)
})

// Bills ----------------------------------------------------------------------

app.get('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await findHome(c.env.DB, homeId)
  if (!home) return jsonError(c, 404, 'Home not found')

  const bills = await c.env.DB.prepare(
    `SELECT id, home_id AS homeId, title, total_cents AS totalCents
       FROM bills
      WHERE home_id = ?
      ORDER BY rowid`,
  )
    .bind(homeId)
    .all<BillRow>()
    .then((result) => result.results)

  const shares = await c.env.DB.prepare(
    `SELECT s.id, s.bill_id AS billId, s.member_id AS memberId,
            s.amount_cents AS amountCents, s.paid_at AS paidAt
       FROM shares s
       JOIN bills b ON b.id = s.bill_id
      WHERE b.home_id = ?
      ORDER BY s.rowid`,
  )
    .bind(homeId)
    .all<ShareRow>()
    .then((result) => result.results)

  const sharesByBill = new Map<string, ShareRow[]>()
  for (const share of shares) {
    const list = sharesByBill.get(share.billId)
    if (list) list.push(share)
    else sharesByBill.set(share.billId, [share])
  }

  return c.json({
    bills: bills.map((bill) => ({
      ...bill,
      shares: (sharesByBill.get(bill.id) ?? []).map((share) => ({
        id: share.id,
        memberId: share.memberId,
        amountCents: share.amountCents,
        paidAt: share.paidAt,
      })),
    })),
  })
})

app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await findHome(c.env.DB, homeId)
  if (!home) return jsonError(c, 404, 'Home not found')

  const body = await readJsonBody(c)
  if (!body) return jsonError(c, 422, 'A JSON object with title and totalCents is required')

  const title = body.title
  if (typeof title !== 'string' || title.trim().length === 0) {
    return jsonError(c, 422, 'title must be a non-empty string')
  }

  const totalCents = body.totalCents
  if (typeof totalCents !== 'number' || !Number.isSafeInteger(totalCents) || totalCents <= 0) {
    return jsonError(c, 422, 'totalCents must be a positive whole number of cents')
  }

  const members = await c.env.DB.prepare(
    'SELECT id FROM members WHERE home_id = ? ORDER BY position',
  )
    .bind(homeId)
    .all<{ id: string }>()
    .then((result) => result.results)

  if (members.length === 0) return jsonError(c, 422, 'A home needs at least one member')

  const billId = crypto.randomUUID()
  const baseAmount = Math.floor(totalCents / members.length)
  const remainder = totalCents - baseAmount * members.length

  const shares = members.map((member, index) => ({
    id: crypto.randomUUID(),
    memberId: member.id,
    amountCents: baseAmount + (index < remainder ? 1 : 0),
    paidAt: null,
  }))

  const statements = [
    c.env.DB.prepare(
      'INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)',
    ).bind(billId, homeId, title, totalCents),
    ...shares.map((share) =>
      c.env.DB.prepare(
        'INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)',
      ).bind(share.id, billId, share.memberId, share.amountCents),
    ),
  ]

  await c.env.DB.batch(statements)

  return c.json({ id: billId, homeId, title, totalCents, shares }, 201)
})

// Payments -------------------------------------------------------------------

app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const idempotencyKey = c.req.header('Idempotency-Key')
  if (idempotencyKey === undefined || idempotencyKey.trim().length === 0) {
    return jsonError(c, 400, 'Idempotency-Key header is required')
  }

  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')

  const share = await findShareForBill(c.env.DB, billId, shareId)
  if (!share) return jsonError(c, 404, 'Bill or share not found')

  if (share.paidAt !== null) {
    if (share.idempotencyKey === idempotencyKey) {
      return c.json({
        id: share.id,
        memberId: share.memberId,
        amountCents: share.amountCents,
        paidAt: share.paidAt,
      })
    }
    return jsonError(c, 409, 'Share has already been paid with a different key')
  }

  const paidAt = new Date().toISOString()
  const result = await c.env.DB.prepare(
    `UPDATE shares
        SET paid_at = ?, idempotency_key = ?
      WHERE id = ? AND bill_id = ? AND paid_at IS NULL`,
  )
    .bind(paidAt, idempotencyKey, shareId, billId)
    .run()

  if (result.meta.changes === 1) {
    return c.json({
      id: share.id,
      memberId: share.memberId,
      amountCents: share.amountCents,
      paidAt,
    })
  }

  // Another request won the race between our read and our update.
  const current = await findShareForBill(c.env.DB, billId, shareId)
  if (!current) return jsonError(c, 404, 'Bill or share not found')

  if (current.paidAt !== null && current.idempotencyKey === idempotencyKey) {
    return c.json({
      id: current.id,
      memberId: current.memberId,
      amountCents: current.amountCents,
      paidAt: current.paidAt,
    })
  }

  return jsonError(c, 409, 'Share has already been paid with a different key')
})

// Balances -------------------------------------------------------------------

app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await findHome(c.env.DB, homeId)
  if (!home) return jsonError(c, 404, 'Home not found')

  const balances = await c.env.DB.prepare(
    `SELECT m.id AS memberId,
            m.name AS name,
            COALESCE(SUM(CASE WHEN s.paid_at IS NULL THEN s.amount_cents ELSE 0 END), 0)
              AS outstandingCents
       FROM members m
       LEFT JOIN shares s ON s.member_id = m.id
      WHERE m.home_id = ?
      GROUP BY m.id, m.name, m.position
      ORDER BY m.position`,
  )
    .bind(homeId)
    .all<BalanceRow>()
    .then((result) => result.results)

  return c.json({
    balances: balances.map((balance) => ({
      memberId: balance.memberId,
      name: balance.name,
      outstandingCents: Number(balance.outstandingCents),
    })),
  })
})

// Fallbacks ------------------------------------------------------------------

app.notFound((c) => c.json({ error: 'Not found' }, 404))

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
