import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  type Balance,
  type Bill,
  fetchBalances,
  fetchBills,
  fetchHomes,
  type HomeSummary,
  postBill,
  postHome,
  postMember,
  postPayment,
  type Share,
} from '../api'

export const Route = createFileRoute('/')({
  component: BillSplitterPage,
})

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
}

function formatCents(cents: number): string {
  const safeCents = Math.trunc(cents)
  const sign = safeCents < 0 ? '-' : ''
  const absolute = Math.abs(safeCents)
  const dollars = Math.floor(absolute / 100)
  const remainder = absolute % 100
  return `${sign}$${dollars}.${remainder.toString().padStart(2, '0')}`
}

function formatPaidAt(paidAt: string): string {
  const date = new Date(paidAt)
  if (Number.isNaN(date.getTime())) return paidAt
  return date.toLocaleString()
}

function memberLabel(count: number): string {
  return count === 1 ? '1 member' : `${count} members`
}

function BillSplitterPage() {
  const [homes, setHomes] = useState<HomeSummary[]>([])
  const [homesState, setHomesState] = useState<LoadState>('loading')
  const [homesError, setHomesError] = useState<string | null>(null)
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null)

  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [detailState, setDetailState] = useState<LoadState>('idle')
  const [detailError, setDetailError] = useState<string | null>(null)

  const [newHomeName, setNewHomeName] = useState('')
  const [creatingHome, setCreatingHome] = useState(false)
  const [homeFormError, setHomeFormError] = useState<string | null>(null)

  const [newMemberName, setNewMemberName] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [memberFormError, setMemberFormError] = useState<string | null>(null)

  const [billTitle, setBillTitle] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [creatingBill, setCreatingBill] = useState(false)
  const [billFormError, setBillFormError] = useState<string | null>(null)

  const [payingShareId, setPayingShareId] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null)

  const detailRequest = useRef(0)
  const paymentKeys = useRef(new Map<string, string>())

  const loadHomes = useCallback(async (selectHomeId?: string) => {
    setHomesState('loading')
    setHomesError(null)
    try {
      const loadedHomes = await fetchHomes()
      setHomes(loadedHomes)
      setHomesState('ready')
      setSelectedHomeId((current) => {
        if (selectHomeId !== undefined) return selectHomeId
        if (current !== null && loadedHomes.some((home) => home.id === current)) return current
        return loadedHomes[0]?.id ?? null
      })
    } catch (error) {
      setHomesState('error')
      setHomesError(errorMessage(error))
    }
  }, [])

  const loadDetail = useCallback(async (homeId: string) => {
    const requestId = detailRequest.current + 1
    detailRequest.current = requestId
    setDetailState('loading')
    setDetailError(null)
    try {
      const [loadedBills, loadedBalances] = await Promise.all([
        fetchBills(homeId),
        fetchBalances(homeId),
      ])
      if (requestId !== detailRequest.current) return
      setBills(loadedBills)
      setBalances(loadedBalances)
      setDetailState('ready')
    } catch (error) {
      if (requestId !== detailRequest.current) return
      setDetailState('error')
      setDetailError(errorMessage(error))
    }
  }, [])

  useEffect(() => {
    void loadHomes()
  }, [loadHomes])

  useEffect(() => {
    if (selectedHomeId === null) {
      detailRequest.current += 1
      setBills([])
      setBalances([])
      setDetailState('idle')
      setDetailError(null)
      return
    }
    setBills([])
    setBalances([])
    void loadDetail(selectedHomeId)
  }, [selectedHomeId, loadDetail])

  function resetHomeForms() {
    setNewMemberName('')
    setBillTitle('')
    setBillAmount('')
    setMemberFormError(null)
    setBillFormError(null)
    setPaymentError(null)
    setPaymentNotice(null)
  }

  function selectHome(homeId: string) {
    setSelectedHomeId(homeId)
    resetHomeForms()
  }

  const selectedHome = homes.find((home) => home.id === selectedHomeId) ?? null

  const memberNames = new Map<string, string>()
  for (const member of selectedHome?.members ?? []) memberNames.set(member.id, member.name)
  for (const balance of balances) memberNames.set(balance.memberId, balance.name)

  function memberName(memberId: string): string {
    return memberNames.get(memberId) ?? 'Unknown member'
  }

  async function handleCreateHome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newHomeName.trim()
    if (name.length === 0) {
      setHomeFormError('Enter a name for the home.')
      return
    }

    setCreatingHome(true)
    setHomeFormError(null)
    try {
      const home = await postHome(name)
      setNewHomeName('')
      resetHomeForms()
      await loadHomes(home.id)
    } catch (error) {
      setHomeFormError(errorMessage(error))
    } finally {
      setCreatingHome(false)
    }
  }

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedHomeId === null) return
    const name = newMemberName.trim()
    if (name.length === 0) {
      setMemberFormError('Enter a name for the member.')
      return
    }

    setAddingMember(true)
    setMemberFormError(null)
    try {
      await postMember(selectedHomeId, name)
      setNewMemberName('')
      await loadHomes(selectedHomeId)
      await loadDetail(selectedHomeId)
    } catch (error) {
      setMemberFormError(errorMessage(error))
    } finally {
      setAddingMember(false)
    }
  }

  async function handleCreateBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedHomeId === null) return

    const title = billTitle.trim()
    const rawAmount = billAmount.trim()
    const totalCents = Number(rawAmount)

    if (title.length === 0) {
      setBillFormError('Enter a title for the bill.')
      return
    }
    if (!/^\d+$/.test(rawAmount) || !Number.isSafeInteger(totalCents) || totalCents <= 0) {
      setBillFormError('Enter a positive whole number of cents, for example 1000.')
      return
    }

    setCreatingBill(true)
    setBillFormError(null)
    setPaymentNotice(null)
    try {
      await postBill(selectedHomeId, title, totalCents)
      setBillTitle('')
      setBillAmount('')
      setPaymentNotice('Bill created.')
      await loadDetail(selectedHomeId)
    } catch (error) {
      setBillFormError(errorMessage(error))
    } finally {
      setCreatingBill(false)
    }
  }

  async function handlePay(bill: Bill, share: Share) {
    if (selectedHomeId === null) return

    const key = paymentKeys.current.get(share.id) ?? crypto.randomUUID()
    paymentKeys.current.set(share.id, key)

    setPayingShareId(share.id)
    setPaymentError(null)
    setPaymentNotice(null)
    try {
      await postPayment(bill.id, share.id, key)
      paymentKeys.current.delete(share.id)
      setPaymentNotice(`Payment recorded for ${memberName(share.memberId)}.`)
      await loadDetail(selectedHomeId)
    } catch (error) {
      setPaymentError(errorMessage(error))
      if (error instanceof ApiError && error.status === 409) {
        await loadDetail(selectedHomeId)
      }
    } finally {
      setPayingShareId(null)
    }
  }

  const noMembers = (selectedHome?.members.length ?? 0) === 0

  return (
    <main className="page">
      <header className="page-header">
        <h1>Shared Bill Splitter</h1>
        <p className="subtitle">Create a home, add members, split bills, and track payments.</p>
      </header>

      <div className="layout">
        <aside className="panel sidebar">
          <h2>Homes</h2>

          {homesState === 'loading' && <p className="muted">Loading homes...</p>}

          {homesState === 'error' && (
            <div className="error-box" role="alert">
              <p>{homesError}</p>
              <button type="button" onClick={() => void loadHomes()}>
                Retry
              </button>
            </div>
          )}

          {homesState === 'ready' && homes.length === 0 && (
            <p className="muted">No homes yet. Create one below.</p>
          )}

          {homes.length > 0 && (
            <ul className="home-list">
              {homes.map((home) => (
                <li key={home.id}>
                  <button
                    type="button"
                    className={home.id === selectedHomeId ? 'home-button selected' : 'home-button'}
                    onClick={() => selectHome(home.id)}
                  >
                    <span>{home.name}</span>
                    <span className="muted">{memberLabel(home.members.length)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form className="stack" onSubmit={handleCreateHome}>
            <label htmlFor="home-name">New home</label>
            <div className="inline">
              <input
                id="home-name"
                value={newHomeName}
                onChange={(event) => setNewHomeName(event.target.value)}
                placeholder="Flat 4B"
                disabled={creatingHome}
              />
              <button type="submit" disabled={creatingHome}>
                {creatingHome ? 'Creating...' : 'Create'}
              </button>
            </div>
            {homeFormError !== null && (
              <p className="form-error" role="alert">
                {homeFormError}
              </p>
            )}
          </form>
        </aside>

        <section className="content">
          {selectedHome === null && (
            <div className="panel empty-state">
              <h2>Select a home</h2>
              <p className="muted">Create a home or choose one from the list to see its bills.</p>
            </div>
          )}

          {selectedHome !== null && (
            <>
              <div className="panel">
                <div className="panel-heading">
                  <h2>{selectedHome.name}</h2>
                  <span className="muted">{memberLabel(selectedHome.members.length)}</span>
                </div>

                <h3>Members</h3>
                {selectedHome.members.length === 0 && (
                  <p className="muted">
                    This home has no members yet. Add a member before creating a bill.
                  </p>
                )}
                {selectedHome.members.length > 0 && (
                  <ul className="member-list">
                    {selectedHome.members.map((member) => (
                      <li key={member.id}>{member.name}</li>
                    ))}
                  </ul>
                )}

                <form className="stack" onSubmit={handleAddMember}>
                  <label htmlFor="member-name">Add a member</label>
                  <div className="inline">
                    <input
                      id="member-name"
                      value={newMemberName}
                      onChange={(event) => setNewMemberName(event.target.value)}
                      placeholder="Asha"
                      disabled={addingMember}
                    />
                    <button type="submit" disabled={addingMember}>
                      {addingMember ? 'Adding...' : 'Add member'}
                    </button>
                  </div>
                  {memberFormError !== null && (
                    <p className="form-error" role="alert">
                      {memberFormError}
                    </p>
                  )}
                </form>
              </div>

              <div className="panel">
                <h3>Add a bill</h3>
                {noMembers && (
                  <p className="muted">Add at least one member before creating a bill.</p>
                )}
                <form className="bill-form" onSubmit={handleCreateBill}>
                  <div className="field">
                    <label htmlFor="bill-title">Title</label>
                    <input
                      id="bill-title"
                      value={billTitle}
                      onChange={(event) => setBillTitle(event.target.value)}
                      placeholder="Electricity"
                      disabled={creatingBill || noMembers}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="bill-amount">Total (cents)</label>
                    <input
                      id="bill-amount"
                      inputMode="numeric"
                      value={billAmount}
                      onChange={(event) => setBillAmount(event.target.value)}
                      placeholder="1000"
                      disabled={creatingBill || noMembers}
                    />
                  </div>
                  <button type="submit" disabled={creatingBill || noMembers}>
                    {creatingBill ? 'Creating...' : 'Create bill'}
                  </button>
                </form>
                {billFormError !== null && (
                  <p className="form-error" role="alert">
                    {billFormError}
                  </p>
                )}
              </div>

              {paymentNotice !== null && (
                <div className="notice" role="status">
                  {paymentNotice}
                </div>
              )}
              {paymentError !== null && (
                <div className="error-box" role="alert">
                  <p>{paymentError}</p>
                </div>
              )}

              <div className="panel">
                <div className="panel-heading">
                  <h3>Bills</h3>
                  <button type="button" onClick={() => void loadDetail(selectedHome.id)}>
                    Refresh
                  </button>
                </div>

                {detailState === 'loading' && <p className="muted">Loading bills...</p>}

                {detailState === 'error' && (
                  <div className="error-box" role="alert">
                    <p>{detailError}</p>
                    <button type="button" onClick={() => void loadDetail(selectedHome.id)}>
                      Retry
                    </button>
                  </div>
                )}

                {detailState === 'ready' && bills.length === 0 && (
                  <p className="muted">No bills yet. Add one above.</p>
                )}

                {bills.length > 0 && (
                  <ul className="bill-list">
                    {bills.map((bill) => {
                      const allPaid = bill.shares.every((share) => share.paidAt !== null)
                      return (
                        <li key={bill.id} className="bill-card">
                          <div className="bill-header">
                            <div>
                              <h4>{bill.title}</h4>
                              <p className="muted">Total {formatCents(bill.totalCents)}</p>
                            </div>
                            <span className={allPaid ? 'badge paid' : 'badge'}>
                              {allPaid ? 'Paid' : 'Open'}
                            </span>
                          </div>

                          <ul className="share-list">
                            {bill.shares.map((share) => (
                              <li key={share.id} className="share-row">
                                <div>
                                  <span className="share-name">{memberName(share.memberId)}</span>
                                  <span className="muted">
                                    {' '}
                                    owes {formatCents(share.amountCents)}
                                  </span>
                                </div>
                                {share.paidAt === null ? (
                                  <button
                                    type="button"
                                    onClick={() => void handlePay(bill, share)}
                                    disabled={payingShareId !== null}
                                  >
                                    {payingShareId === share.id ? 'Paying...' : 'Mark paid'}
                                  </button>
                                ) : (
                                  <span className="paid-label">
                                    Paid {formatPaidAt(share.paidAt)}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div className="panel">
                <h3>Outstanding balances</h3>
                {detailState === 'loading' && balances.length === 0 && (
                  <p className="muted">Loading balances...</p>
                )}
                {balances.length === 0 && detailState === 'ready' ? (
                  <p className="muted">No members to show.</p>
                ) : (
                  <ul className="balance-list">
                    {balances.map((balance) => (
                      <li key={balance.memberId}>
                        <span>{balance.name}</span>
                        <strong>{formatCents(balance.outstandingCents)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
