export type Member = { id: string; homeId: string; name: string }
export type Share = { id: string; memberId: string; amountCents: number; paidAt: string | null }
export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}
export type Balance = { memberId: string; name: string; outstandingCents: number }
export type HomeSummary = { id: string; name: string; members: Member[] }
export type PaidShare = {
  id: string
  memberId: string
  amountCents: number
  paidAt: string
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const REQUEST_TIMEOUT_MS = 10_000

function isErrorBody(value: unknown): value is { error: string } {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  return typeof (value as { error: unknown }).error === 'string'
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) headers.set('content-type', 'application/json')

  try {
    const response = await fetch(path, { ...init, headers, signal: controller.signal })
    const text = await response.text()
    let body: unknown = null

    if (text.length > 0) {
      try {
        body = JSON.parse(text)
      } catch {
        body = null
      }
    }

    if (!response.ok) {
      const message = isErrorBody(body) ? body.error : `Request failed (${response.status})`
      throw new ApiError(message, response.status)
    }

    if (body === null) throw new ApiError('The server returned an empty response', response.status)
    return body as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('The request took too long. Please try again.')
    }
    throw new ApiError('Could not reach the server. Check your connection and try again.')
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchHomes(): Promise<HomeSummary[]> {
  const data = await request<{ homes: HomeSummary[] }>('/api/homes')
  return data.homes
}

export function postHome(name: string): Promise<{ id: string; name: string }> {
  return request('/api/homes', { method: 'POST', body: JSON.stringify({ name }) })
}

export function postMember(homeId: string, name: string): Promise<Member> {
  return request(`/api/homes/${encodeURIComponent(homeId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function fetchBills(homeId: string): Promise<Bill[]> {
  const data = await request<{ bills: Bill[] }>(`/api/homes/${encodeURIComponent(homeId)}/bills`)
  return data.bills
}

export async function fetchBalances(homeId: string): Promise<Balance[]> {
  const data = await request<{ balances: Balance[] }>(
    `/api/homes/${encodeURIComponent(homeId)}/balances`,
  )
  return data.balances
}

export function postBill(homeId: string, title: string, totalCents: number): Promise<Bill> {
  return request(`/api/homes/${encodeURIComponent(homeId)}/bills`, {
    method: 'POST',
    body: JSON.stringify({ title, totalCents }),
  })
}

export function postPayment(
  billId: string,
  shareId: string,
  idempotencyKey: string,
): Promise<PaidShare> {
  return request(
    `/api/bills/${encodeURIComponent(billId)}/shares/${encodeURIComponent(shareId)}/pay`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )
}
