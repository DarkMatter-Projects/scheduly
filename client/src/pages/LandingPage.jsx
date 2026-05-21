import { Link } from 'react-router-dom';
import {
  CalendarDays, BarChart3, Megaphone, FolderClosed, Users, CheckCircle2,
  Sparkles, Image as ImageIcon, ShieldCheck, ArrowRight,
} from 'lucide-react';
import { FacebookIcon, InstagramIcon, TiktokIcon, LinkedinIcon, YoutubeIcon } from '../components/common/SocialIcons';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white text-sm font-bold">S</span>
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-bold tracking-tight">Scheduly</div>
              <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">by DMM</div>
            </div>
          </Link>
          <nav className="hidden sm:flex items-center gap-7 text-sm text-slate-600">
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#integrations" className="hover:text-slate-900">Integrations</a>
            <a href="#workflow" className="hover:text-slate-900">Workflow</a>
            <Link to="/terms" className="hover:text-slate-900">Terms</Link>
          </nav>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shadow-sm"
          >
            Sign in <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 0%, rgba(59,130,246,0.10) 0%, rgba(255,255,255,0) 70%)',
          }}
        />
        <div className="max-w-5xl mx-auto px-6 py-24 sm:py-32 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 mb-6">
            <Sparkles className="w-3.5 h-3.5" /> Built for agencies and in-house social teams
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
            All your social channels.<br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-pink-500 bg-clip-text text-transparent">
              One scheduler.
            </span>
          </h1>
          <p className="text-lg text-slate-600 mt-6 max-w-2xl mx-auto">
            Plan, approve, and publish posts across Facebook, Instagram, and TikTok.
            See organic and paid performance side-by-side, scoped to every client you
            manage — without bouncing between five tabs.
          </p>
          <div className="mt-9 flex items-center justify-center gap-3 flex-wrap">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-lg shadow-blue-600/20"
            >
              Sign in to your workspace <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="mailto:hello@darkm.co.za?subject=Scheduly%20demo%20request"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
            >
              Request a demo
            </a>
          </div>
          <p className="text-xs text-slate-400 mt-4">
            Operated by Dark Matter Media (Pty) Ltd. Used by digital marketing teams in South Africa.
          </p>
        </div>
      </section>

      {/* Logo strip */}
      <section className="border-y border-slate-100 bg-slate-50/50">
        <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-center gap-10 flex-wrap text-slate-400">
          <span className="text-xs font-semibold uppercase tracking-wider">Publishes to</span>
          <FacebookIcon className="w-6 h-6" />
          <InstagramIcon className="w-6 h-6" />
          <TiktokIcon className="w-6 h-6" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">·</span>
          <span className="text-xs font-semibold uppercase tracking-wider">Reports on</span>
          <span className="text-sm font-semibold text-slate-500">Meta Ads</span>
          <span className="text-sm font-semibold text-slate-500">Google Ads</span>
          <span className="text-sm font-semibold text-slate-500">TikTok Ads</span>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Everything a content team actually uses</h2>
            <p className="text-slate-600 mt-4">No bloated feature dump — just the workflow we built for our own agency.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Feature
              icon={CalendarDays}
              color="bg-blue-100 text-blue-600"
              title="Calendar & scheduler"
              body="Drag-and-drop calendar with month, week, and list views. Reschedule by dragging a post to a new slot."
            />
            <Feature
              icon={CheckCircle2}
              color="bg-emerald-100 text-emerald-600"
              title="Approval workflow"
              body="Editors draft, managers approve, the scheduler does the rest. Full audit trail per post."
            />
            <Feature
              icon={FolderClosed}
              color="bg-indigo-100 text-indigo-600"
              title="Client folders"
              body="Group every account, post, and metric under the client it belongs to. Switch workspace in one click."
            />
            <Feature
              icon={BarChart3}
              color="bg-pink-100 text-pink-600"
              title="Organic analytics"
              body="Reach, impressions, engagement, and tone (caption sentiment) per post, per client, over any date range."
            />
            <Feature
              icon={Megaphone}
              color="bg-amber-100 text-amber-700"
              title="Paid performance"
              body="Live spend, CTR, CPC, conversions, and ROAS across Meta Ads, Google Ads, and TikTok Ads in one dashboard."
            />
            <Feature
              icon={ImageIcon}
              color="bg-rose-100 text-rose-600"
              title="Centralised media"
              body="Upload once, reuse anywhere. Images are auto-padded to platform-safe aspect ratios."
            />
            <Feature
              icon={Users}
              color="bg-cyan-100 text-cyan-600"
              title="Roles & teams"
              body="Admin, manager, editor, and viewer roles. Permissions enforced server-side, not just hidden buttons."
            />
            <Feature
              icon={ShieldCheck}
              color="bg-violet-100 text-violet-600"
              title="Secure token storage"
              body="OAuth tokens encrypted at rest with AES-256. Daily refresh job keeps connections alive automatically."
            />
            <Feature
              icon={Sparkles}
              color="bg-yellow-100 text-yellow-700"
              title="Caption tone scoring"
              body="Every caption is scored for tone as you write so you catch off-brand drafts before they ship."
            />
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section id="integrations" className="py-24 bg-slate-50/60 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Native integrations, official APIs</h2>
            <p className="text-slate-600 mt-4">
              Every connection uses the platform&apos;s own OAuth flow and posting endpoints. No scraping, no
              third-party middlemen.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Integration name="Facebook Pages" sub="Schedule + publish + insights" Icon={FacebookIcon} color="bg-blue-600" />
            <Integration name="Instagram Business" sub="Single, carousel, and reels" Icon={InstagramIcon} color="bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400" />
            <Integration name="TikTok" sub="Direct post & send-to-inbox modes" Icon={TiktokIcon} color="bg-slate-900" />
            <Integration name="Meta Ads" sub="Campaigns, ad sets, spend, ROAS" Icon={FacebookIcon} color="bg-blue-700" />
            <Integration name="Google Ads" sub="GAQL pulls, daily insights sync" Icon={Sparkles} color="bg-red-600" />
            <Integration name="TikTok Ads" sub="Reporting in your client view" Icon={TiktokIcon} color="bg-slate-800" />
          </div>
          <p className="text-center text-xs text-slate-400 mt-8">
            LinkedIn, YouTube, Pinterest, Threads, and Snapchat integrations are on the roadmap.
          </p>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">A workflow your team will actually follow</h2>
            <p className="text-slate-600 mt-4">
              Built by an agency that got tired of approval threads, spreadsheets, and screenshots of analytics.
            </p>
          </div>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <Step n={1} title="Draft" body="Compose the caption with live tone scoring. Pick the profiles to publish to." />
            <Step n={2} title="Approve" body="Manager reviews drafts in one queue. Comments thread under each post." />
            <Step n={3} title="Schedule" body="Drop the approved post on the calendar. Re-arrange by dragging." />
            <Step n={4} title="Report" body="Once it&apos;s live, organic and paid metrics flow back into the same view, scoped per client." />
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Run your social ops from one place</h2>
          <p className="text-blue-100 mt-4 max-w-xl mx-auto">
            Scheduly is invite-only while we onboard agencies. If your team manages
            two or more brands across Meta, TikTok, and paid channels, we&apos;d like
            to hear from you.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50"
            >
              Sign in <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="mailto:hello@darkm.co.za?subject=Scheduly%20access%20request"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-blue-700/30 border border-white/40 text-white text-sm font-semibold hover:bg-blue-700/50"
            >
              Request access
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-10 grid sm:grid-cols-4 gap-8 text-sm">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">S</span>
              </div>
              <div>
                <div className="text-[15px] font-bold tracking-tight">Scheduly</div>
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">by DMM</div>
              </div>
            </div>
            <p className="text-slate-500 text-xs leading-relaxed">
              Operated by Dark Matter Media (Pty) Ltd, South Africa.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">Product</p>
            <ul className="space-y-2 text-slate-600">
              <li><a href="#features" className="hover:text-slate-900">Features</a></li>
              <li><a href="#integrations" className="hover:text-slate-900">Integrations</a></li>
              <li><a href="#workflow" className="hover:text-slate-900">Workflow</a></li>
              <li><Link to="/login" className="hover:text-slate-900">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">Legal</p>
            <ul className="space-y-2 text-slate-600">
              <li><Link to="/terms" className="hover:text-slate-900">Terms of Service</Link></li>
              <li><Link to="/privacy-policy" className="hover:text-slate-900">Privacy Policy</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">Contact</p>
            <ul className="space-y-2 text-slate-600">
              <li>
                <a className="hover:text-slate-900" href="mailto:hello@darkm.co.za">
                  hello@darkm.co.za
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-100">
          <div className="max-w-6xl mx-auto px-6 py-4 text-xs text-slate-400 flex items-center justify-between">
            <span>© {new Date().getFullYear()} Dark Matter Media (Pty) Ltd. All rights reserved.</span>
            <span>scheduly.darkm.co</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, color, title, body }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-6 hover:shadow-sm transition bg-white">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color} mb-4`}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{body}</p>
    </div>
  );
}

function Integration({ name, sub, Icon, color }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">{name}</p>
        <p className="text-xs text-slate-500">{sub}</p>
      </div>
    </div>
  );
}

function Step({ n, title, body }) {
  return (
    <li className="rounded-2xl border border-slate-200 p-6 bg-white">
      <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center mb-3">{n}</div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{body}</p>
    </li>
  );
}
