import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation } from 'wouter';
import { Activity, ArrowUpRight, BarChart3, Check, ChevronRight, CircleHelp, Clipboard, CreditCard, Download, Gauge, Home, LogOut, Plus, QrCode as QrIcon, RefreshCw, Settings, Share2, ShieldCheck, Users, Wallet, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  getGetAdminSettingsQueryKey, getGetCsrfTokenQueryKey, getGetCurrentUserQueryKey, getGetDashboardQueryKey,
  getGetLeaderboardQueryKey, getExportAdminReportQueryKey, getListAffiliatesQueryKey, getListAllPayoutsQueryKey, getListAllSalesQueryKey,
  getListMyCommissionsQueryKey, getListMyNotificationsQueryKey, getListMyPayoutsQueryKey, getListMySalesQueryKey,
  getListTiersQueryKey, setSessionFetchConfig, useCreateRefill, useExportAdminReport, useGetAdminSettings, useGetCsrfToken, useGetCurrentUser, useHealthCheck,
  useGetDashboard, useGetLeaderboard, useListAffiliates, useListAllPayouts, useListAllSales, useListMyCommissions,
  useListMyNotifications, useListMyPayouts, useListMySales, useListTiers, useLoginUser, useLogoutUser, useRegisterAffiliate,
  useRequestPasswordReset, useRequestPayout, useResetPassword, useReviewAffiliate, useReviewPayout, useReviewRefill,
  useUpdateAdminSettings, useUpdateNotification, useUpdateTier,
} from '@workspace/api-client-react';
import type { Affiliate, Commission, Notification, Payout, PortalUser, Refill, Tier } from '@workspace/api-client-react';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
setSessionFetchConfig({ csrfToken: null, credentials: 'include' });
const currency = (n?: number | null) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n || 0);
const date = (s?: string | null) => s ? new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(new Date(s)) : '—';
const errorText = (e: unknown) => e instanceof Error ? e.message.replace(/^HTTP \d+[^:]*:\s*/, '') : 'Something went wrong. Please try again.';
const authPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
const brandLogo = `${import.meta.env.BASE_URL}images/logo.png`;

function FetchSetup() {
  const token = useGetCsrfToken({ query: { queryKey: getGetCsrfTokenQueryKey(), staleTime: 5 * 60_000 } });
  useEffect(() => {
    setSessionFetchConfig({ csrfToken: token.data?.token ?? null, credentials: 'include' });
  }, [token.data]);
  return null;
}

function ToastHost() {
  const [message, setMessage] = useState('');
  useEffect(() => { const listener = (event: Event) => { const text = (event as CustomEvent<string>).detail; setMessage(text); window.setTimeout(() => setMessage(''), 2800); }; window.addEventListener('uptown-toast', listener); return () => window.removeEventListener('uptown-toast', listener); }, []);
  return message ? <div className="toastline" role="status">{message}</div> : null;
}
function notify(text: string) { window.dispatchEvent(new CustomEvent('uptown-toast', { detail: text })); }
function Loading() { return <div className="stack"><div className="skeleton" style={{ width: '40%', height: 30 }} /><div className="grid-stats">{[1, 2, 3, 4].map(i => <div className="card" key={i}><div className="skeleton" /><div className="skeleton" style={{ marginTop: 20, width: '65%', height: 28 }} /></div>)}</div><div className="card"><div className="skeleton" style={{ height: 180 }} /></div></div>; }
function Failure({ message, retry }: { message: string; retry: () => void }) { return <div className="card empty"><Activity size={26} /><strong>Could not load this view</strong><span>{message}</span><div style={{ marginTop: 16 }}><button className="btn secondary" onClick={retry}><RefreshCw size={15} /> Try again</button></div></div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><Clipboard size={25} /><strong>{title}</strong><span>{text}</span></div>; }
function Status({ value }: { value: string }) { return <span className={`pill ${value}`}>{value.replace('_', ' ')}</span>; }
function Button({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={`btn ${className}`} {...props}>{children}</button>; }
function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label>{label}<input className="input" {...props} /></label>; }
function PageTitle({ label, title, trailing }: { label: string; title: string; trailing?: React.ReactNode }) { return <div className="topbar"><div><div className="eyebrow">{label}</div><h1 className="page-title">{title}</h1></div>{trailing}</div>; }
const affiliateLinks = [
  { href: '/dashboard', label: 'Overview', icon: Home }, { href: '/sales', label: 'Refill activity', icon: Activity },
  { href: '/commissions', label: 'Commissions', icon: BarChart3 }, { href: '/leaderboard', label: 'Leaderboard', icon: Gauge }, { href: '/payouts', label: 'Payouts', icon: Wallet },
];
const adminLinks = [{ href: '/dashboard', label: 'Overview', icon: Home }, { href: '/sales', label: 'Refill queue', icon: Activity }, { href: '/admin/affiliates', label: 'Affiliates', icon: Users }, { href: '/payouts', label: 'Payouts', icon: Wallet }, { href: '/leaderboard', label: 'Leaderboard', icon: BarChart3 }, { href: '/admin/tiers', label: 'Tier programme', icon: Gauge }, { href: '/admin/settings', label: 'Settings', icon: Settings }];

function Shell({ user, children }: { user: PortalUser; children: React.ReactNode }) {
  const [path, setPath] = useLocation(); const logout = useLogoutUser(); const query = useQueryClient();
  const links = user.role === 'admin' ? adminLinks : affiliateLinks;
  const doLogout = () => logout.mutate(undefined, { onSuccess: () => { query.clear(); setPath('/login'); }, onError: e => notify(errorText(e)) });
  return <div className="shell">
    <aside className="side"><div className="brand"><img className="brand-logo" src={brandLogo} alt="" width="52" height="52" /><span>uptown<br /><span style={{ fontSize: 10, letterSpacing: '.12em', opacity: .72 }}>GAS HUB</span></span></div>
      <div><div className="nav-label">Workspace</div><nav className="nav-group">{links.map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={`nav-item ${path === href ? 'active' : ''}`}><Icon size={17} />{label}</Link>)}</nav></div>
      <div style={{ marginTop: 'auto' }}><div className="nav-label">Signed in as</div><div style={{ padding: '7px 12px 16px', fontWeight: 600, fontSize: 13 }}>{user.name}<div style={{ color: '#aab9d2', fontSize: 11, marginTop: 3 }}>{user.role === 'admin' ? 'Operations admin' : `${user.status} partner`}</div></div><button className="nav-item" onClick={doLogout}><LogOut size={16} /> Sign out</button></div>
    </aside>
    <header className="mobile-head"><div className="brand" style={{ padding: 0 }}><img className="brand-logo" src={brandLogo} alt="" width="40" height="40" /> Uptown Gas Hub</div><button aria-label="Sign out" className="nav-item" onClick={doLogout}><LogOut size={17} /></button></header>
    <nav className="mobile-nav">{links.map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={`nav-item ${path === href ? 'active' : ''}`}><Icon size={15} />{label}</Link>)}</nav>
    <main className="main"><div className="row no-print" style={{ marginBottom: 20, justifyContent: 'flex-end' }}><div className="subtle"><ShieldCheck size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Secure partner workspace</div></div>{children}</main>
  </div>;
}

function AuthFrame({ children, intro = 'Better energy, closer to home.' }: { children: React.ReactNode; intro?: string }) {
  return <div className="auth-frame">
    <section className="auth-aside">
      <div className="brand" style={{ padding: 0 }}><img className="brand-logo" src={brandLogo} alt="" width="52" height="52" /> UPTOWN GAS HUB</div>
      <div className="auth-copy"><div className="eyebrow" style={{ color: '#b7c8e3' }}>LOCAL PARTNERS. REAL IMPACT.</div><h1 className="display" style={{ fontSize: 'clamp(34px,5.5vw,64px)', lineHeight: 1.03, margin: '17px 0', maxWidth: 570 }}>{intro}</h1><p style={{ color: '#c4d1e7', maxWidth: 400, lineHeight: 1.7 }}>Earn for connecting your neighbours with reliable LPG refills. Track every sale, commission and payout in one place.</p></div>
      <div className="subtle auth-footer" style={{ color: '#b7c8e3' }}>Uptown Gas Hub · Kenya</div>
    </section>
    <section className="auth-form-panel"><div className="auth-form-inner">{children}</div></section>
  </div>;
}
function Login() {
  const [location, setLocation] = useLocation(); const login = useLoginUser(); const [error, setError] = useState('');
  return <AuthFrame><div className="eyebrow">PARTNER PORTAL</div><h1 className="page-title" style={{ marginBottom: 8 }}>Welcome back</h1><p className="muted" style={{ marginBottom: 26 }}>Sign in to manage your neighborhood referrals.</p>
    {error && <div className="pill rejected" role="alert" style={{ marginBottom: 15, fontSize: 12 }}>{error}</div>}
    <form className="stack" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); setError(''); login.mutate({ data: { email: String(f.get('email')), password: String(f.get('password')) } }, { onSuccess: () => setLocation('/dashboard'), onError: err => setError(errorText(err)) }); }}>
      <Field name="email" type="email" label="Email address" required autoComplete="email" data-testid="input-email" /><Field name="password" type="password" label="Password" required autoComplete="current-password" data-testid="input-password" />
      <Link href="/forgot-password" className="subtle" style={{ justifySelf: 'end', color: 'hsl(var(--primary))', textDecoration: 'none' }}>Forgot password?</Link><Button type="submit" disabled={login.isPending}>{login.isPending ? 'Signing in…' : 'Sign in'} <ChevronRight size={16} /></Button>
    </form><div className="divider" /><p className="muted" style={{ textAlign: 'center' }}>New to the partner network? <Link href="/register" style={{ color: 'hsl(var(--primary))', fontWeight: 700 }}>Apply to join</Link></p>
  </AuthFrame>;
}
function Register() {
  const [loc, setLoc] = useLocation(); const register = useRegisterAffiliate(); const [notice, setNotice] = useState('');
  return <AuthFrame intro="Bring reliable refills to your corner."><div className="eyebrow">BECOME A PARTNER</div><h1 className="page-title">Your neighbourhood, your network.</h1><p className="muted" style={{ marginBottom: 22 }}>Apply in a few minutes. Our team reviews every new account.</p>
    {notice && <div className="card" style={{ marginBottom: 14, color: 'hsl(var(--primary))' }}>{notice}</div>}
    <form className="stack" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); register.mutate({ data: { name: String(f.get('name')), email: String(f.get('email')), phone: String(f.get('phone')), password: String(f.get('password')) } }, { onSuccess: () => setNotice('Application received. You can sign in once an administrator approves your account.'), onError: err => setNotice(errorText(err)) }); }}>
      <Field name="name" label="Full name" autoComplete="name" required minLength={2} /><Field name="phone" label="Mobile number" type="tel" autoComplete="tel" placeholder="+254 7…" required minLength={9} /><Field name="email" label="Email address" type="email" autoComplete="email" required /><Field name="password" label="Create password" type="password" autoComplete="new-password" minLength={10} required /><Button disabled={register.isPending}>{register.isPending ? 'Sending application…' : 'Submit application'} <ChevronRight size={16} /></Button>
    </form><p className="muted" style={{ marginTop: 20, textAlign: 'center' }}>Already a partner? <Link href="/login" style={{ color: 'hsl(var(--primary))' }}>Sign in</Link></p></AuthFrame>;
}
function ForgotPassword() {
  const reset = useRequestPasswordReset(); const [done, setDone] = useState(false);
  return <AuthFrame intro="Your partner account is always within reach."><div className="eyebrow">ACCOUNT RECOVERY</div><h1 className="page-title">Reset your password</h1><p className="muted" style={{ marginBottom: 22 }}>Enter the email on your account and we’ll send a reset link if it exists.</p>{done ? <div className="card">If that email is registered, a reset link is on its way.</div> : <form className="stack" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); reset.mutate({ data: { email: String(f.get('email')) } }, { onSuccess: () => setDone(true), onError: err => notify(errorText(err)) }); }}><Field name="email" label="Email address" type="email" autoComplete="email" required /><Button disabled={reset.isPending}>{reset.isPending ? 'Sending…' : 'Send reset link'}</Button></form>}<p className="muted" style={{ marginTop: 20 }}><Link href="/login">Return to sign in</Link></p></AuthFrame>;
}
function ResetPassword() {
  const reset = useResetPassword(); const [loc, setLoc] = useLocation(); const [message, setMessage] = useState('');
  const tokenFromUrl = new URLSearchParams(window.location.search).get('token') || '';
  return <AuthFrame intro="A fresh start for your partner account."><div className="eyebrow">ACCOUNT RECOVERY</div><h1 className="page-title">Choose a new password</h1><p className="muted">Use the secure reset token from your email.</p><form className="stack" style={{ marginTop: 20 }} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const password = String(f.get('password')); if (password !== f.get('confirm')) { setMessage('Passwords do not match.'); return; } reset.mutate({ data: { token: String(f.get('token')), password } }, { onSuccess: () => { setMessage('Password updated. Please sign in.'); setTimeout(() => setLoc('/login'), 1200); }, onError: err => setMessage(errorText(err)) }); }}><Field name="token" label="Reset token" autoComplete="one-time-code" required minLength={32} defaultValue={tokenFromUrl} /><Field name="password" label="New password" type="password" autoComplete="new-password" required minLength={10} /><Field name="confirm" label="Confirm new password" type="password" autoComplete="new-password" required minLength={10} />{message && <div className="muted" role="status">{message}</div>}<Button disabled={reset.isPending}>{reset.isPending ? 'Updating…' : 'Save new password'}</Button></form></AuthFrame>;
}

function ReferralCard({ code, baseUrl }: { code: string | null; baseUrl?: string }) {
  const [copied, setCopied] = useState(false); const url = code ? `${(baseUrl || window.location.origin).replace(/\/$/, '')}/?ref=${encodeURIComponent(code)}` : '';
  const copy = async () => { if (!url) return; try { await navigator.clipboard.writeText(url); setCopied(true); notify('Referral link copied'); setTimeout(() => setCopied(false), 1500); } catch { notify('Copy is not available on this device'); } };
  return <div className="hero-panel"><div className="row" style={{ position: 'relative', zIndex: 1, alignItems: 'center' }}><div style={{ flex: 1 }}><div className="eyebrow" style={{ color: '#c0cfea' }}>YOUR PERSONAL REFERRAL</div><h2 className="display" style={{ margin: '10px 0 7px' }}>Every refill starts with a neighbour.</h2><p>Share your link. Approved refills earn your commission.</p><div className="row" style={{ justifyContent: 'flex-start', gap: 20, marginTop: 22, flexWrap: 'wrap' }}><div><div className="subtle" style={{ color: '#c4d1e7' }}>Your partner code</div><div className="referral-code">{code || 'Pending approval'}</div></div><div className="row no-print" style={{ gap: 8 }}><Button className="secondary" disabled={!code} onClick={copy}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy link'}</Button><Button className="ghost" style={{ color: 'white', borderColor: '#6f83a5' }} onClick={() => window.print()}><QrCode size={15} /> Print share card</Button></div></div>{url && <div className="subtle" style={{ marginTop: 12, color: '#cbd8ed', wordBreak: 'break-all' }}>{url}</div>}</div>{code && <div className="qr-print" style={{ background: '#fff', padding: 7, borderRadius: 11, flexShrink: 0 }}><QrCode value={url} /><div style={{ color: '#152441', fontSize: 9, fontWeight: 700, textAlign: 'center', marginTop: 3 }}>{code}</div></div>}</div></div>;
}
function Metric({ label, value, foot, icon: Icon }: { label: string; value: string; foot?: string; icon: typeof Activity }) { return <div className="card stat-card"><div className="row"><span className="eyebrow">{label}</span><Icon size={17} color="hsl(var(--primary))" /></div><div className="stat-value">{value}</div><div className="subtle">{foot}</div></div>; }
function QrCode({ value, size: iconSize }: { value?: string; size?: number }) {
  if (!value) return <QrIcon size={iconSize || 15} />;
  return <QRCodeSVG value={value} size={iconSize || 112} level="M" includeMargin title="QR code for your referral link" fgColor="#152441" bgColor="#ffffff" />;
}
function RefillTable({ rows, admin, review }: { rows: Refill[]; admin?: boolean; review?: (id: string, status: 'approved' | 'voided') => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Customer / partner</th><th>Refill</th><th>Sale value</th><th>Commission</th><th>Status</th><th>Date</th>{admin && <th>Review</th>}</tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><strong>{r.customerName}</strong><div className="subtle">{admin ? r.affiliateName : r.referralCode}</div></td><td>{r.litres} L</td><td>{currency(r.amountKES)}</td><td>{currency(r.commissionKES)} <span className="subtle">({r.commissionPercent}%)</span></td><td><Status value={r.status} /></td><td>{date(r.refillDate)}</td>{admin && <td>{r.status === 'pending' && <div className="row"><button aria-label="Approve refill" className="btn" onClick={() => review?.(r.id, 'approved')}><Check size={14} /></button><button aria-label="Void refill" className="btn danger" onClick={() => review?.(r.id, 'voided')}><X size={14} /></button></div>}</td>}</tr>)}</tbody></table></div>;
}
function DashboardPage({ user }: { user: PortalUser }) {
  const dash = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } }); const settings = useGetAdminSettings({ query: { queryKey: getGetAdminSettingsQueryKey(), enabled: user.role === 'admin' } });
  const [refillOpen, setRefillOpen] = useState(false); const [period, setPeriod] = useState<'week' | 'month' | 'all_time'>('week');
  const leaderboard = useGetLeaderboard({ period, metric: 'refills' }, { query: { queryKey: getGetLeaderboardQueryKey({ period, metric: 'refills' }) } });
  if (dash.isLoading) return <Loading />; if (dash.isError || !dash.data) return <Failure message={errorText(dash.error)} retry={() => dash.refetch()} />;
  const d = dash.data; const admin = user.role === 'admin'; const stats = d.stats; const base = settings.data?.referralBaseUrl;
  const leaders = [...(leaderboard.data || d.leaderboard)].slice(0, 5);
  return <div className="stack animate-in"><PageTitle label={admin ? 'OPERATIONS DESK' : `GOOD TO SEE YOU, ${d.account.name.split(' ')[0].toUpperCase()}`} title={admin ? 'Today at Uptown' : 'Your partner hub'} trailing={admin && <Button className="secondary" onClick={() => { /* export is available from the sales workspace */ window.location.assign('/sales'); }}><Download size={15} /> Sales workspace</Button>} />
    {admin ? <div className="grid-stats"><Metric label="New applications" value={String(d.admin?.pendingAffiliates || 0)} foot="Awaiting your review" icon={Users} /><Metric label="Refills to review" value={String(d.admin?.pendingRefills || 0)} foot="Pending approval" icon={Activity} /><Metric label="Payouts to review" value={String(d.admin?.pendingPayouts || 0)} foot="Partner requests" icon={Wallet} /><Metric label="Revenue this month" value={currency(d.admin?.monthRevenueKES)} foot={`${currency(d.admin?.monthCommissionKES)} in commissions`} icon={BarChart3} /></div>
      : <><ReferralCard code={d.account.referralCode} baseUrl={base} /><div className="grid-stats"><Metric label="Approved refills" value={String(stats.refillCount)} foot="All-time partner total" icon={Activity} /><Metric label="Neighbourhood sales" value={currency(stats.revenueKES)} foot="From approved refills" icon={BarChart3} /><Metric label="Commission earned" value={currency(stats.commissionKES)} foot="Approved refill earnings" icon={ArrowUpRight} /><Metric label="Available to withdraw" value={currency(stats.availableKES)} foot={`Minimum payout ${currency(stats.minimumPayoutKES)}`} icon={Wallet} /></div><div className="card"><div className="section-head"><h2>Your next milestone</h2><span className="pill approved">{stats.currentTier || 'Starter'} tier</span></div><p className="muted">{stats.nextTier ? `Keep the momentum going toward ${stats.nextTier}.` : 'You are at the highest available tier.'}</p><div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, stats.tierProgress || 0))}%` }} /></div><div className="row subtle" style={{ marginTop: 9 }}><span>Current progress</span><strong>{Math.round(stats.tierProgress || 0)}%</strong></div></div></>}
    <div className="grid-stats" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(260px,.8fr)' }}>
      <section className="card"><div className="section-head"><h2>{admin ? 'Latest refill activity' : 'Recent refills'}</h2><Link href="/sales" className="subtle" style={{ color: 'hsl(var(--primary))' }}>View all →</Link></div>{d.recentRefills.length ? <RefillTable rows={d.recentRefills.slice(0, 5)} /> : <Empty title="Your story starts here" text="Once a refill is submitted and approved, it will appear here." />}</section>
      <section className="card"><div className="section-head"><h2>Partner leaderboard</h2><select value={period} onChange={e => setPeriod(e.target.value as typeof period)} style={{ width: 'auto', fontSize: 11 }}><option value="week">This week</option><option value="month">This month</option><option value="all_time">All time</option></select></div>{leaderboard.isLoading ? <div className="skeleton" /> : <div className="stack" style={{ gap: 8 }}>{leaders.map((l, i) => <div key={l.affiliateId} className="row" style={{ padding: '8px 0', borderBottom: '1px solid hsl(var(--border))' }}><div className="row" style={{ justifyContent: 'flex-start' }}><strong className="display" style={{ color: i === 0 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))', width: 24 }}>0{l.rank}</strong><span><strong style={{ fontSize: 13 }}>{l.name}</strong><div className="subtle">{l.tierName}</div></span></div><strong>{l.refillCount} refills</strong></div>)}</div>}<Link href="/leaderboard" className="btn ghost" style={{ width: '100%', textDecoration: 'none', marginTop: 14 }}>See full rankings</Link></section>
    </div>
    {!admin && user.status !== 'approved' && <div className="card"><div className="row"><ShieldCheck size={20} color="hsl(var(--accent))" /><div><strong>Application under review</strong><div className="muted">Your account needs administrator approval before referrals are activated.</div></div></div></div>}
    {refillOpen && <Modal title="Record a refill" close={() => setRefillOpen(false)}><RefillForm code={user.referralCode || ''} onDone={() => { setRefillOpen(false); dash.refetch(); }} /></Modal>}
  </div>;
}
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#111a2db3', display: 'grid', placeItems: 'center', padding: 16 }}><div className="card animate-in" onClick={e => e.stopPropagation()} style={{ width: 'min(100%,560px)', maxHeight: '90dvh', overflow: 'auto' }}><div className="section-head"><h2>{title}</h2><button className="btn ghost" onClick={close}><X size={16} /></button></div>{children}</div></div>; }
function RefillForm({ code = '', onDone }: { code?: string; onDone: () => void }) {
  const create = useCreateRefill(); const query = useQueryClient();
  return <form className="form-grid" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); create.mutate({ data: { referralCode: String(f.get('referralCode')), customerName: String(f.get('customerName')), customerPhone: String(f.get('customerPhone') || ''), litres: Number(f.get('litres')), amountKES: Number(f.get('amountKES')), refillDate: String(f.get('refillDate')), notes: String(f.get('notes') || '') } }, { onSuccess: () => { [getListAllSalesQueryKey(), getListMySalesQueryKey(), getGetDashboardQueryKey()].forEach(queryKey => query.invalidateQueries({ queryKey })); notify('Refill recorded for review'); onDone(); }, onError: err => notify(errorText(err)) }); }}>
    <Field className="wide" name="referralCode" label="Partner referral code" defaultValue={code} required minLength={3} /><Field name="customerName" label="Customer name" required minLength={2} /><Field name="customerPhone" label="Customer phone (optional)" /><Field name="litres" label="Cylinder size (litres)" type="number" min="1" step="1" required /><Field name="amountKES" label="Refill amount (KES)" type="number" min="1" required /><Field name="refillDate" label="Refill date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /><label className="wide">Notes<textarea name="notes" rows={3} maxLength={1000} /></label><div className="wide row"><span className="subtle">Commission is earned after approval.</span><Button disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Record refill'}</Button></div>
  </form>;
}

function AffiliateSales() {
  const sales = useListMySales({ query: { queryKey: getListMySalesQueryKey() } });
  if (sales.isLoading) return <Loading />; if (sales.isError || !sales.data) return <Failure message={errorText(sales.error)} retry={() => sales.refetch()} />;
  return <div className="stack animate-in"><PageTitle label="PARTNER ACTIVITY" title="Refill history" /> <div className="card">{sales.data.length ? <RefillTable rows={sales.data} /> : <Empty title="No refills yet" text="Share your personal referral link to bring your first customer in." />}</div></div>;
}
function AdminSales() {
  const [filter, setFilter] = useState('all'); const sales = useListAllSales({ status: filter as 'all' | 'pending' | 'approved' | 'voided' }, { query: { queryKey: getListAllSalesQueryKey({ status: filter as 'all' | 'pending' | 'approved' | 'voided' }) } });
  const [open, setOpen] = useState(false); const review = useReviewRefill(); const query = useQueryClient();
  const report = useExportAdminReport({ query: { queryKey: getExportAdminReportQueryKey(), enabled: false } });
  const exportCsv = async () => { try { const result = await report.refetch(); if (result.data) { const blob = new Blob([result.data], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'uptown-approved-refills.csv'; a.click(); URL.revokeObjectURL(a.href); notify('CSV report downloaded'); } } catch { notify('Report could not be downloaded'); } };
  const onReview = (id: string, status: 'approved' | 'voided') => { const reason = status === 'voided' ? window.prompt('Reason for voiding this refill?') || undefined : undefined; if (status === 'voided' && !reason) return; review.mutate({ id, data: { status, reason } }, { onSuccess: () => { [getListAllSalesQueryKey(), getGetDashboardQueryKey()].forEach(queryKey => query.invalidateQueries({ queryKey })); notify(status === 'approved' ? 'Refill approved' : 'Refill voided'); }, onError: e => notify(errorText(e)) }); };
  return <div className="stack animate-in"><PageTitle label="OPERATIONS / REFILLS" title="Refill queue" trailing={<div className="row"><Button className="secondary" onClick={exportCsv} disabled={report.isFetching}><Download size={15} />{report.isFetching ? 'Preparing…' : 'Export CSV'}</Button><Button onClick={() => setOpen(true)}><Plus size={16} /> Capture refill</Button></div>} /><div className="card"><div className="section-head"><h2>All refill records</h2><select aria-label="Filter refill status" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }}><option value="all">All statuses</option><option value="pending">Pending review</option><option value="approved">Approved</option><option value="voided">Voided</option></select></div>{sales.isLoading ? <div className="skeleton" /> : sales.isError ? <Failure message={errorText(sales.error)} retry={() => sales.refetch()} /> : sales.data?.length ? <RefillTable rows={sales.data} admin review={onReview} /> : <Empty title="Queue is clear" text="No refills match this filter." />}</div>{open && <Modal title="Capture partner refill" close={() => setOpen(false)}><RefillForm onDone={() => setOpen(false)} /></Modal>}</div>;
}
function CommissionsPage() {
  const query = useListMyCommissions({ query: { queryKey: getListMyCommissionsQueryKey() } });
  if (query.isLoading) return <Loading />; if (query.isError || !query.data) return <Failure message={errorText(query.error)} retry={() => query.refetch()} />;
  const available = query.data.filter(c => c.status === 'available').reduce((a, c) => a + c.amountKES, 0);
  return <div className="stack animate-in"><PageTitle label="EARNINGS" title="Commission ledger" /><div className="grid-stats"><Metric label="Ledger total" value={currency(query.data.reduce((a, c) => a + c.amountKES, 0))} foot="Across all recorded commissions" icon={BarChart3} /><Metric label="Available" value={currency(available)} foot="Ready to request a payout" icon={Wallet} /><Metric label="Transactions" value={String(query.data.length)} foot="Commission records" icon={Activity} /><Metric label="On hold / paid" value={String(query.data.filter(c => c.status !== 'available').length)} foot="Reserved, paid or voided" icon={CreditCard} /></div><div className="card">{query.data.length ? <CommissionTable rows={query.data} /> : <Empty title="No commissions to show" text="Approved refills create commission entries in your ledger." />}</div></div>;
}
function CommissionTable({ rows }: { rows: Commission[] }) { return <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Commission</th><th>Rate</th><th>Tier</th><th>Status</th><th>Earned</th></tr></thead><tbody>{rows.map(c => <tr key={c.id}><td><strong>{c.customerName}</strong><div className="subtle">Refill #{c.refillId.slice(0, 8)}</div></td><td><strong>{currency(c.amountKES)}</strong></td><td>{c.commissionPercent}%</td><td>{c.tierName}</td><td><Status value={c.status} /></td><td>{date(c.createdAt)}</td></tr>)}</tbody></table></div>; }
function LeaderboardPage() {
  const [period, setPeriod] = useState<'week' | 'month' | 'all_time'>('week'); const [metric, setMetric] = useState<'refills' | 'revenue' | 'earnings'>('refills');
  const data = useGetLeaderboard({ period, metric }, { query: { queryKey: getGetLeaderboardQueryKey({ period, metric }) } });
  if (data.isLoading) return <Loading />; if (data.isError || !data.data) return <Failure message={errorText(data.error)} retry={() => data.refetch()} />;
  const amountKey = metric === 'revenue' ? 'revenueKES' : metric === 'earnings' ? 'earningsKES' : null;
  return <div className="stack animate-in"><PageTitle label="NEIGHBOURHOOD MOMENTUM" title="Partner leaderboard" /><div className="card"><div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: 9, marginBottom: 20 }}><select aria-label="Ranking period" value={period} onChange={e => setPeriod(e.target.value as typeof period)} style={{ width: 'auto' }}><option value="week">This week</option><option value="month">This month</option><option value="all_time">All time</option></select><select aria-label="Ranking metric" value={metric} onChange={e => setMetric(e.target.value as typeof metric)} style={{ width: 'auto' }}><option value="refills">Approved refills</option><option value="revenue">Revenue</option><option value="earnings">Partner earnings</option></select></div>{data.data.length ? <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Partner</th><th>Tier</th><th>Refills</th><th>Revenue</th><th>Earnings</th></tr></thead><tbody>{[...data.data].sort((a, b) => metric === 'refills' ? b.refillCount - a.refillCount : (amountKey ? b[amountKey] - a[amountKey] : 0)).map((r, i) => <tr key={r.affiliateId}><td><strong className="display" style={{ fontSize: 19 }}>#{i + 1}</strong></td><td><strong>{r.name}</strong></td><td><span className="pill approved">{r.tierName}</span></td><td>{r.refillCount}</td><td>{currency(r.revenueKES)}</td><td>{currency(r.earningsKES)}</td></tr>)}</tbody></table></div> : <Empty title="No rankings yet" text="Approved partner performance will appear here." />}</div></div>;
}
function PayoutsPage({ admin }: { admin: boolean }) {
  return admin ? <AdminPayouts /> : <AffiliatePayouts />;
}
function AffiliatePayouts() {
  const rows = useListMyPayouts({ query: { queryKey: getListMyPayoutsQueryKey() } }); const dash = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const request = useRequestPayout(); const query = useQueryClient();
  if (rows.isLoading) return <Loading />; if (rows.isError || !rows.data) return <Failure message={errorText(rows.error)} retry={() => rows.refetch()} />;
  const balance = dash.data?.stats.availableKES || 0; const minimum = dash.data?.stats.minimumPayoutKES || 0;
  return <div className="stack animate-in"><PageTitle label="YOUR EARNINGS" title="Payouts" /><div className="grid-stats"><Metric label="Available balance" value={currency(balance)} foot="From approved refills" icon={Wallet} /><Metric label="Minimum request" value={currency(minimum)} foot="Set by Uptown Gas Hub" icon={CreditCard} /></div><div className="card"><div className="section-head"><h2>Request a payout</h2><span className="pill approved">Manual M-Pesa processing</span></div><p className="muted">Submit a request when your available balance meets the minimum. An administrator will review and process it.</p><form className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }} onSubmit={e => { e.preventDefault(); const amount = Number(new FormData(e.currentTarget).get('amount')); if (amount > balance || amount < minimum) { notify(`Enter an amount between ${currency(minimum)} and ${currency(balance)}`); return; } request.mutate({ data: { amountKES: amount } }, { onSuccess: () => { query.invalidateQueries({ queryKey: getListMyPayoutsQueryKey() }); query.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); notify('Payout request sent for review'); }, onError: err => notify(errorText(err)) }); }}><label style={{ width: 210 }}>Amount (KES)<input className="input" name="amount" type="number" min={minimum} max={balance} step="1" required /></label><Button type="submit" disabled={request.isPending || balance < minimum}>{request.isPending ? 'Submitting…' : 'Request payout'}</Button>{balance < minimum && <span className="subtle">Earn {currency(minimum - balance)} more to reach the minimum.</span>}</form></div><div className="card"><div className="section-head"><h2>Request history</h2></div>{rows.data.length ? <PayoutTable rows={rows.data} /> : <Empty title="No payout requests" text="Your payout activity will be tracked here." />}</div></div>;
}
function AdminPayouts() {
  const [filter, setFilter] = useState('all'); const rows = useListAllPayouts({ status: filter as 'all' | 'pending' | 'approved' | 'rejected' | 'paid' }, { query: { queryKey: getListAllPayoutsQueryKey({ status: filter as 'all' | 'pending' | 'approved' | 'rejected' | 'paid' }) } });
  const review = useReviewPayout(); const query = useQueryClient();
  const action = (p: Payout, status: 'approved' | 'rejected' | 'paid') => {
    let data: { status: 'approved' | 'rejected' | 'paid'; transactionReference?: string; rejectionReason?: string } = { status };
    if (status === 'paid') { const reference = window.prompt('Enter the M-Pesa transaction reference after confirming payment manually:'); if (!reference) return; data.transactionReference = reference; }
    if (status === 'rejected') { const reason = window.prompt('Reason for rejecting this request:'); if (!reason) return; data.rejectionReason = reason; }
    review.mutate({ id: p.id, data }, { onSuccess: () => { [getListAllPayoutsQueryKey(), getGetDashboardQueryKey()].forEach(queryKey => query.invalidateQueries({ queryKey })); notify(`Payout marked ${status}`); }, onError: e => notify(errorText(e)) });
  };
  return <div className="stack animate-in"><PageTitle label="OPERATIONS / PARTNER PAYMENTS" title="Payout review" /><div className="card"><div className="section-head"><h2>Partner payout requests</h2><select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }}><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="paid">Paid</option></select></div>{rows.isLoading ? <div className="skeleton" /> : rows.isError ? <Failure message={errorText(rows.error)} retry={() => rows.refetch()} /> : rows.data?.length ? <PayoutTable rows={rows.data} admin action={action} /> : <Empty title="No payout requests" text="New partner requests will appear here." />}</div><div className="card"><div className="row"><ShieldCheck size={20} color="hsl(var(--primary))" /><div><strong>Manual payment control</strong><div className="muted">This workspace does not initiate M-Pesa payments. Confirm payment outside the portal, then record the transaction reference.</div></div></div></div></div>;
}
function PayoutTable({ rows, admin, action }: { rows: Payout[]; admin?: boolean; action?: (p: Payout, status: 'approved' | 'rejected' | 'paid') => void }) { return <div className="table-wrap"><table><thead><tr>{admin && <th>Partner</th>}<th>Requested</th><th>Amount</th><th>Phone</th><th>Status</th><th>Reference / note</th><th>{admin ? 'Actions' : 'Date'}</th></tr></thead><tbody>{rows.map(p => <tr key={p.id}>{admin && <td><strong>{p.affiliateName}</strong></td>}<td>{date(p.createdAt)}</td><td><strong>{currency(p.amountKES)}</strong></td><td>{p.phone}</td><td><Status value={p.status} /></td><td>{p.transactionReference || p.rejectionReason || '—'}</td><td>{admin && p.status === 'pending' ? <div className="row"><button className="btn secondary" onClick={() => action?.(p, 'approved')}>Approve</button><button className="btn danger" onClick={() => action?.(p, 'rejected')}>Reject</button></div> : admin && p.status === 'approved' ? <button className="btn" onClick={() => action?.(p, 'paid')}>Mark paid</button> : date(p.paidAt || p.createdAt)}</td></tr>)}</tbody></table></div>; }

function AffiliatesPage() {
  const [filter, setFilter] = useState('pending'); const affiliates = useListAffiliates({ status: filter as 'pending' | 'approved' | 'rejected' | 'suspended' | 'all' }, { query: { queryKey: getListAffiliatesQueryKey({ status: filter as 'pending' | 'approved' | 'rejected' | 'suspended' | 'all' }) } });
  const review = useReviewAffiliate(); const query = useQueryClient();
  const act = (a: Affiliate, status: 'approved' | 'rejected' | 'suspended') => { const reason = status === 'rejected' || status === 'suspended' ? window.prompt(status === 'rejected' ? 'Reason for rejecting this application?' : 'Reason for suspending this partner?') || undefined : undefined; if (status !== 'approved' && !reason) return; review.mutate({ id: a.id, data: { status, reason } }, { onSuccess: () => { query.invalidateQueries({ queryKey: getListAffiliatesQueryKey() }); query.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); notify(`Partner ${status}`); }, onError: e => notify(errorText(e)) }); };
  return <div className="stack animate-in"><PageTitle label="OPERATIONS / PARTNER NETWORK" title="Affiliate applications" /><div className="card"><div className="section-head"><h2>Partner accounts</h2><select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }}><option value="pending">Pending applications</option><option value="approved">Approved</option><option value="suspended">Suspended</option><option value="rejected">Rejected</option><option value="all">All accounts</option></select></div>{affiliates.isLoading ? <div className="skeleton" /> : affiliates.isError ? <Failure message={errorText(affiliates.error)} retry={() => affiliates.refetch()} /> : affiliates.data?.length ? <div className="table-wrap"><table><thead><tr><th>Partner</th><th>Referral code</th><th>Status</th><th>Refills</th><th>Sales value</th><th>Commission</th><th>Joined</th><th>Review</th></tr></thead><tbody>{affiliates.data.map(a => <tr key={a.id}><td><strong>{a.name}</strong><div className="subtle">{a.email} · {a.phone || 'No phone'}</div></td><td className="display">{a.referralCode}</td><td><Status value={a.status} /></td><td>{a.refillCount}</td><td>{currency(a.revenueKES)}</td><td>{currency(a.commissionKES)}</td><td>{date(a.createdAt)}</td><td><div className="row">{a.status === 'pending' && <><Button onClick={() => act(a, 'approved')}><Check size={14} /> Approve</Button><Button className="danger" onClick={() => act(a, 'rejected')}>Reject</Button></>}{a.status === 'approved' && <Button className="danger" onClick={() => act(a, 'suspended')}>Suspend</Button>}{a.status === 'suspended' && <Button onClick={() => act(a, 'approved')}>Reinstate</Button>}</div></td></tr>)}</tbody></table></div> : <Empty title={filter === 'pending' ? 'No applications waiting' : 'Nothing in this view'} text="Partner account updates will appear here." />}</div></div>;
}
function TierEditor({ tier, onSave, pending }: { tier: Tier; onSave: (tier: Tier, values: { thresholdMetric: 'refills' | 'revenue'; thresholdValue: number; commissionPercent: number; period: 'monthly' | 'lifetime'; active: boolean }) => void; pending: boolean }) {
  const [metric, setMetric] = useState<'refills' | 'revenue'>(tier.thresholdMetric); const [threshold, setThreshold] = useState(String(tier.thresholdValue)); const [rate, setRate] = useState(String(tier.commissionPercent)); const [period, setPeriod] = useState<'monthly' | 'lifetime'>(tier.period); const [active, setActive] = useState(tier.active);
  return <form onSubmit={e => { e.preventDefault(); onSave(tier, { thresholdMetric: metric, thresholdValue: Number(threshold), commissionPercent: Number(rate), period, active }); }} className="row" style={{ alignItems: 'end', flexWrap: 'wrap', gap: 12, padding: '15px 0', borderBottom: '1px solid hsl(var(--border))' }}>
    <div style={{ minWidth: 118, flex: 1 }}><strong className="display" style={{ fontSize: 19 }}>{tier.name}</strong><div className="subtle">Position {tier.sortOrder}</div></div>
    <label style={{ width: 120 }}>Measure<select value={metric} onChange={e => setMetric(e.target.value as typeof metric)}><option value="refills">Refills</option><option value="revenue">Revenue KES</option></select></label>
    <label style={{ width: 120 }}>Threshold<input className="input" type="number" min="0" value={threshold} onChange={e => setThreshold(e.target.value)} /></label>
    <label style={{ width: 100 }}>Commission %<input className="input" type="number" min="0" max="100" step=".1" value={rate} onChange={e => setRate(e.target.value)} /></label>
    <label style={{ width: 125 }}>Evaluation<select value={period} onChange={e => setPeriod(e.target.value as typeof period)}><option value="monthly">Monthly</option><option value="lifetime">Lifetime</option></select></label>
    <label style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 12 }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Active</label><Button disabled={pending}>Save</Button>
  </form>;
}
function TiersPage() {
  const tiers = useListTiers({ query: { queryKey: getListTiersQueryKey() } }); const update = useUpdateTier(); const query = useQueryClient();
  const save = (tier: Tier, values: { thresholdMetric: 'refills' | 'revenue'; thresholdValue: number; commissionPercent: number; period: 'monthly' | 'lifetime'; active: boolean }) => update.mutate({ id: tier.id, data: values }, { onSuccess: () => { query.invalidateQueries({ queryKey: getListTiersQueryKey() }); notify(`${tier.name} tier saved`); }, onError: e => notify(errorText(e)) });
  if (tiers.isLoading) return <Loading />; if (tiers.isError || !tiers.data) return <Failure message={errorText(tiers.error)} retry={() => tiers.refetch()} />;
  return <div className="stack animate-in"><PageTitle label="PROGRAMME DESIGN" title="Partner tiers" /><div className="card"><div className="section-head"><h2>Progression & commission rates</h2><span className="pill approved">{tiers.data.filter(t => t.active).length} active</span></div><p className="muted">Changes apply according to approved refill activity. Thresholds and rates are managed here, not promised as instant payouts.</p>{[...tiers.data].sort((a, b) => a.sortOrder - b.sortOrder).map(t => <TierEditor key={t.id} tier={t} onSave={save} pending={update.isPending} />)}</div></div>;
}
function NotificationCenter({ whatsappEnabled, provider }: { whatsappEnabled: boolean; provider: 'wa_me' | 'meta_cloud' }) {
  const list = useListMyNotifications({ query: { queryKey: getListMyNotificationsQueryKey() } }); const update = useUpdateNotification(); const query = useQueryClient();
  const markSent = (n: Notification) => { update.mutate({ id: n.id, data: { action: 'mark_sent' } }, { onSuccess: () => { query.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() }); notify('Notification marked as sent'); }, onError: e => notify(errorText(e)) }); };
  return <div className="card"><div className="section-head"><h2>WhatsApp follow-ups</h2><span className="subtle">Manual click-to-send</span></div>{!whatsappEnabled && <p className="muted">WhatsApp links are currently disabled in portal settings.</p>}{provider === 'meta_cloud' && <p className="muted">Meta Cloud API is selected, but this portal does not send messages automatically. Configure delivery before marking a message sent.</p>}{list.isLoading ? <div className="skeleton" /> : list.isError ? <Failure message={errorText(list.error)} retry={() => list.refetch()} /> : list.data?.length ? <div className="stack">{list.data.map(n => <div key={n.id} className="row" style={{ padding: '12px 0', borderBottom: '1px solid hsl(var(--border))' }}><div style={{ flex: 1 }}><div className="row" style={{ justifyContent: 'flex-start' }}><strong>{n.title}</strong><Status value={n.deliveryStatus} /></div><div className="subtle" style={{ marginTop: 4 }}>To {n.recipientName} · {date(n.createdAt)} · {n.attempts} attempts</div><div className="muted" style={{ marginTop: 5 }}>{n.message}</div></div><div className="row">{whatsappEnabled && provider === 'wa_me' && n.whatsappUrl && n.deliveryStatus !== 'sent' && <a className="btn secondary" href={n.whatsappUrl} target="_blank" rel="noreferrer"><Share2 size={14} /> Open WhatsApp</a>}{n.deliveryStatus !== 'sent' && <Button className="ghost" onClick={() => markSent(n)}>Mark sent</Button>}</div></div>)}</div> : <Empty title="No follow-ups queued" text="WhatsApp notifications awaiting action appear here." />}</div>;
}
function SettingsPage() {
  const settings = useGetAdminSettings({ query: { queryKey: getGetAdminSettingsQueryKey() } }); const update = useUpdateAdminSettings(); const query = useQueryClient();
  const [minimum, setMinimum] = useState(''); const [base, setBase] = useState(''); const [enabled, setEnabled] = useState(false); const [ready, setReady] = useState(false);
  useEffect(() => { if (settings.data && !ready) { setMinimum(String(settings.data.minimumPayoutKES)); setBase(settings.data.referralBaseUrl || window.location.origin); setEnabled(settings.data.whatsappEnabled); setReady(true); } }, [settings.data, ready]);
  if (settings.isLoading) return <Loading />; if (settings.isError || !settings.data) return <Failure message={errorText(settings.error)} retry={() => settings.refetch()} />;
  return <div className="stack animate-in"><PageTitle label="PORTAL CONFIGURATION" title="Operating settings" /><div className="card"><div className="section-head"><h2>Payouts & referrals</h2><span className="pill approved">Saved settings</span></div><form className="stack" onSubmit={e => { e.preventDefault(); update.mutate({ data: { minimumPayoutKES: Number(minimum), referralBaseUrl: base, whatsappProvider: 'wa_me', whatsappEnabled: enabled, mpesaMode: 'manual' } }, { onSuccess: () => { query.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() }); notify('Settings saved'); }, onError: err => notify(errorText(err)) }); }}><div className="form-grid"><Field label="Minimum payout (KES)" type="number" min="1" value={minimum} onChange={e => setMinimum(e.target.value)} required /><Field label="Referral base URL" type="url" value={base} onChange={e => setBase(e.target.value)} required /><div><div className="eyebrow">WHATSAPP FOLLOW-UPS</div><div style={{ fontWeight: 700, marginTop: 7 }}>Click-to-chat links</div><div className="subtle" style={{ marginTop: 5 }}>Messages are sent manually from WhatsApp.</div></div><div><div className="eyebrow">PAYOUT PROCESSING</div><div style={{ fontWeight: 700, marginTop: 7 }}>Manual M-Pesa recording</div><div className="subtle" style={{ marginTop: 5 }}>Automated payment integration is deferred.</div></div><label className="wide" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enable WhatsApp follow-up links</label></div><div className="row" style={{ justifyContent: 'flex-start' }}><Button disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save operating settings'}</Button><span className="subtle">Payments are recorded after an administrator confirms the transfer outside the portal.</span></div></form></div><NotificationCenter whatsappEnabled={enabled} provider="wa_me" /><div className="card"><div className="row"><CircleHelp size={19} color="hsl(var(--primary))" /><div><strong>Connection security</strong><div className="muted">Session cookies and CSRF protection are enabled for portal requests.</div></div></div></div></div>;
}

function Portal() {
  const [path, setPath] = useLocation();
  const isAuthPath = authPaths.includes(path);
  const userQuery = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false, enabled: !isAuthPath } });
  const health = useHealthCheck({ query: { staleTime: 60_000 } });
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);
  useEffect(() => {
    if (userQuery.isLoading || isAuthPath) return;
    const user = userQuery.data;
    if (userQuery.isError || !user) {
      if (path !== '/') setPath('/login');
      return;
    }
    if (
      (user.status === 'pending' && user.role !== 'admin' && !['/', '/dashboard', '/sales'].includes(path)) ||
      (path.startsWith('/admin/') && user.role !== 'admin')
    ) {
      setPath('/dashboard');
    }
  }, [isAuthPath, path, setPath, userQuery.data, userQuery.isError, userQuery.isLoading]);
  if (isAuthPath) {
    if (path === '/login') return <Login />; if (path === '/register') return <Register />; if (path === '/forgot-password') return <ForgotPassword />; return <ResetPassword />;
  }
  if (userQuery.isLoading) return <div className="main" style={{ maxWidth: 840, margin: 'auto', paddingTop: 100 }}><Loading /></div>;
  if (userQuery.isError || !userQuery.data) return <Login />;
  const user = userQuery.data;
  if (user.status === 'pending' && user.role !== 'admin' && !['/', '/dashboard', '/sales'].includes(path)) return <div className="main" style={{ maxWidth: 840, margin: 'auto', paddingTop: 100 }}><Loading /></div>;
  if (path.startsWith('/admin/') && user.role !== 'admin') return <Shell user={user}><div className="card empty"><ShieldCheck size={26} /><strong>Administrator access required</strong><span>This workspace is reserved for operations administrators.</span></div></Shell>;
  let view: React.ReactNode = <NotFoundInline goHome={() => setPath('/dashboard')} />;
  if (path === '/' || path === '/dashboard') view = <DashboardPage user={user} />;
  else if (path === '/sales') view = user.role === 'admin' ? <AdminSales /> : <AffiliateSales />;
  else if (path === '/commissions') view = user.role === 'admin' ? <AdminSales /> : <CommissionsPage />;
  else if (path === '/leaderboard') view = <LeaderboardPage />;
  else if (path === '/payouts') view = <PayoutsPage admin={user.role === 'admin'} />;
  else if (path === '/admin/affiliates' && user.role === 'admin') view = <AffiliatesPage />;
  else if (path === '/admin/tiers' && user.role === 'admin') view = <TiersPage />;
  else if (path === '/admin/settings' && user.role === 'admin') view = <SettingsPage />;
  return <Shell user={user}><div data-health={health.data?.status || 'checking'}>{view}</div></Shell>;
}
function NotFoundInline({ goHome }: { goHome: () => void }) { return <div className="card empty"><h1 className="display">Page not found</h1><p>That page is not part of the partner workspace.</p><Button onClick={goHome}>Back to dashboard</Button></div>; }
function Router() { return <Switch><Route path="/"><Portal /></Route><Route path="/:rest*"><Portal /></Route><Route><Portal /></Route></Switch>; }
function App() { return <QueryClientProvider client={queryClient}><FetchSetup /><ToastHost /><Router /></QueryClientProvider>; }
export default App;

