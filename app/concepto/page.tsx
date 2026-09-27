'use client'

import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Command,
  Hash,
  Home,
  Inbox,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  PackageSearch,
  PanelLeft,
  Search,
  Send,
  Settings2,
  Sparkles,
  Store,
  Sun,
  Target,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './concept.css'

type Screen = 'dashboard' | 'kpis' | 'ai' | 'today' | 'plan'

const salesSeries = [
  { day: 'Lun', sales: 98000, goal: 108000 },
  { day: 'Mar', sales: 112000, goal: 110000 },
  { day: 'Mié', sales: 104500, goal: 115000 },
  { day: 'Jue', sales: 121000, goal: 118000 },
  { day: 'Vie', sales: 132500, goal: 128000 },
  { day: 'Sáb', sales: 128420, goal: 150000 },
]

const team = [
  { name: 'Sofía Ramírez', initials: 'SR', sales: '$18,420', progress: 112, trend: '+18%', tone: 'violet' },
  { name: 'Mateo González', initials: 'MG', sales: '$16,890', progress: 104, trend: '+9%', tone: 'amber' },
  { name: 'Valeria Cruz', initials: 'VC', sales: '$14,280', progress: 96, trend: '+4%', tone: 'blue' },
  { name: 'Diego Herrera', initials: 'DH', sales: '$12,640', progress: 88, trend: '-2%', tone: 'green' },
]

const navGroups = [
  { label: 'OPERACIÓN', items: [['Dashboard', LayoutDashboard], ['KPIs', BarChart3], ['Equipo', Users], ['Horarios', CalendarDays], ['Asistencia', CheckCircle2]] },
  { label: 'DÍA A DÍA', items: [['Plan del día', ListChecks], ['Pendientes', Inbox], ['Checklist', ClipboardCheck], ['Comunicados', Bell], ['Chat', MessageSquare], ['Bitácora', Hash]] },
  { label: 'GESTIÓN', items: [['Conteos', PackageSearch], ['Reconocimientos', Sparkles], ['Capacitación', Target], ['Administración', Settings2]] },
] as const

function money(value: number) {
  return `$${value.toLocaleString('en-US')}`
}

function Metric({ label, value, detail, accent }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div className="metric-block">
      <p className="eyebrow">{label}</p>
      <p className={accent ? 'metric-value metric-accent' : 'metric-value'}>{value}</p>
      <p className="metric-detail">{detail}</p>
    </div>
  )
}

function Status({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'positive' | 'warning' | 'danger' }) {
  return <span className={`status status-${tone}`}><span className="status-dot" />{children}</span>
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }> }) {
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><span>Venta</span><strong>{money(payload[0].value)}</strong></div>
}

function DesktopNav({ screen, setScreen }: { screen: Screen; setScreen: (screen: Screen) => void }) {
  return (
    <aside className="desktop-rail">
      <div className="brand-mark"><span>c</span><div><strong>clarvex</strong><small>Monterrey Centro</small></div></div>
      <button className="store-switcher"><Store size={15} /><span>Monterrey Centro</span><ChevronDown size={14} /></button>
      <div className="rail-search"><Search size={15} /><span>Buscar</span><kbd>⌘ K</kbd></div>
      <nav className="nav-groups" aria-label="Navegación de Clarvex">
        {navGroups.map((group) => <div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map(([label, Icon]) => {
          const active = (label === 'Dashboard' && screen === 'dashboard') || (label === 'KPIs' && screen === 'kpis') || (label === 'Plan del día' && screen === 'plan')
          return <button key={label} className={active ? 'nav-item active' : 'nav-item'} onClick={() => label === 'KPIs' ? setScreen('kpis') : label === 'Plan del día' ? setScreen('plan') : label === 'Dashboard' ? setScreen('dashboard') : undefined}><Icon size={16} /><span>{label}</span>{label === 'Pendientes' && <b className="nav-count">3</b>}</button>
        })}</div>)}
      </nav>
      <div className="rail-bottom"><button className="nav-item"><PanelLeft size={16} /><span>Contraer menú</span></button><div className="profile-row"><div className="avatar avatar-blue">AL</div><div><strong>Adrián Luna</strong><small>Gerente de tienda</small></div><MoreHorizontal size={16} /></div></div>
    </aside>
  )
}

function DesktopHeader({ title, subtitle, setScreen }: { title: string; subtitle: string; setScreen: (screen: Screen) => void }) {
  return <header className="desktop-header"><div><p className="breadcrumb">MONTERREY CENTRO <ChevronRight size={13} /> {title.toUpperCase()}</p><h1>{title}</h1><p className="header-subtitle">{subtitle}</p></div><div className="header-actions"><button className="icon-button"><Bell size={17} /><i /></button><button className="ask-button" onClick={() => setScreen('ai')}><Sparkles size={16} /> Ask Clarvex <kbd>⌘ J</kbd></button><div className="avatar avatar-blue">AL</div></div></header>
}

function SalesChart() {
  return <div className="sales-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={salesSeries} margin={{ left: -22, right: 10, top: 16, bottom: 0 }}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5c8dff" stopOpacity={0.28} /><stop offset="100%" stopColor="#5c8dff" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="rgba(255,255,255,.07)" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#78849a', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#78849a', fontSize: 11 }} tickFormatter={(v) => `$${v / 1000}k`} /><Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(125,160,255,.35)' }} /><Area type="monotone" dataKey="goal" stroke="#596273" strokeDasharray="4 4" strokeWidth={1.5} fill="none" /><Area type="monotone" dataKey="sales" stroke="#6d9bff" strokeWidth={2.5} fill="url(#salesFill)" /></AreaChart></ResponsiveContainer></div>
}

function Dashboard({ setScreen }: { setScreen: (screen: Screen) => void }) {
  return <>
    <DesktopHeader title="Dashboard" subtitle="Sábado, 27 de septiembre de 2026 · Turno en curso" setScreen={setScreen} />
    <div className="dashboard-layout">
      <section className="hero-performance panel"><div className="panel-top"><div><p className="eyebrow">VENTA DE HOY</p><p className="hero-number">$128,420</p><p className="hero-context"><span className="positive-text"><ArrowUpRight size={15} /> 12.8%</span> vs. sábado anterior</p></div><div className="goal-ring"><div><strong>85.6%</strong><span>de meta</span></div></div></div><div className="goal-line"><div><span>Meta del día</span><strong>$150,000</strong></div><div className="progress-track"><span style={{ width: '85.6%' }} /></div><div><span>$21,580 restantes</span><span>Actualizado hace 2 min</span></div></div><SalesChart /></section>
      <section className="attention-panel panel"><div className="panel-heading"><div><p className="eyebrow">ATENCIÓN</p><h2>Lo que requiere<br />tu decisión</h2></div><span className="attention-count">4</span></div><div className="attention-list"><button><span className="attention-icon danger"><CircleAlert size={16} /></span><span><strong>2 tareas críticas vencidas</strong><small>Visual merchandising · hace 2 h</small></span><ChevronRight size={15} /></button><button><span className="attention-icon warning"><Activity size={16} /></span><span><strong>Diferencia de inventario</strong><small>Zona de accesorios · 12 piezas</small></span><ChevronRight size={15} /></button><button><span className="attention-icon blue"><Bell size={16} /></span><span><strong>3 comunicados sin leer</strong><small>Último hace 26 min</small></span><ChevronRight size={15} /></button><button><span className="attention-icon neutral"><Users size={16} /></span><span><strong>Una incidencia de asistencia</strong><small>Revisar antes del cierre</small></span><ChevronRight size={15} /></button></div><button className="text-button">Ver bandeja completa <ArrowUpRight size={14} /></button></section>
    </div>
    <div className="section-heading"><div><p className="eyebrow">EQUIPO HOY</p><h2>Rendimiento del equipo</h2></div><button className="subtle-button">Ver equipo <ArrowUpRight size={14} /></button></div>
    <section className="team-table panel"><div className="table-head"><span>PERSONA</span><span>VENTA</span><span>ALCANCE</span><span>TENDENCIA · 7 DÍAS</span><span>ESTADO</span></div>{team.map((person) => <div className="team-row" key={person.name}><div className="person-cell"><div className={`avatar avatar-${person.tone}`}>{person.initials}</div><div><strong>{person.name}</strong><small>Asesor de ventas</small></div></div><strong className="row-sales">{person.sales}</strong><div className="row-progress"><div className="mini-track"><span style={{ width: `${Math.min(person.progress, 100)}%` }} /></div><b>{person.progress}%</b></div><span className={person.trend.startsWith('+') ? 'positive-text trend' : 'muted-text trend'}>{person.trend}</span><Status tone={person.progress >= 100 ? 'positive' : 'neutral'}>{person.progress >= 100 ? 'En ritmo' : 'En seguimiento'}</Status></div>)}</section>
    <section className="ai-insight panel"><div className="ai-orb"><Sparkles size={18} /></div><div><p className="eyebrow">CLARVEX INTELLIGENCE · INSIGHT DEL DÍA</p><h3>La tienda va por encima del ritmo, pero la conversión cae entre 15:00 y 17:00.</h3><p>Reforzar fitting room puede recuperar aproximadamente <strong>$4,800</strong> antes del cierre.</p></div><button className="subtle-button" onClick={() => setScreen('ai')}>Ver análisis <ArrowUpRight size={14} /></button></section>
  </>
}

function Kpis({ setScreen }: { setScreen: (screen: Screen) => void }) {
  const bars = [{ name: 'Venta', value: 86, color: '#6d9bff' }, { name: 'Tickets', value: 72, color: '#7fcbad' }, { name: 'UPT', value: 64, color: '#b99aff' }, { name: 'Conv.', value: 58, color: '#f0b56b' }]
  return <><DesktopHeader title="KPIs" subtitle="Lectura operativa de Monterrey Centro · Semana actual" setScreen={setScreen} /><div className="kpi-toolbar"><div className="segmented"><button className="selected">Esta semana</button><button>Este mes</button><button>Periodo anterior</button></div><button className="subtle-button"><CalendarDays size={14} /> 21 — 27 sep <ChevronDown size={14} /></button></div><section className="kpi-hero panel"><div className="kpi-heading"><div><p className="eyebrow">RESUMEN DESEMPEÑO</p><h2>Una semana consistente,<br /><em>con oportunidad en conversión.</em></h2></div><Status tone="positive">Datos al día</Status></div><div className="metric-grid"><Metric label="Venta neta" value="$742,810" detail="+8.4% vs. periodo anterior" accent /><Metric label="Meta acumulada" value="$780,000" detail="95.2% de cumplimiento" /><Metric label="Tickets" value="1,842" detail="+3.1% esta semana" /><Metric label="UPT" value="2.38" detail="+0.12 vs. promedio" /></div><div className="kpi-large-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={salesSeries} margin={{ left: -28, right: 4, top: 20, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.07)" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#78849a', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#78849a', fontSize: 11 }} tickFormatter={(v) => `$${v / 1000}k`} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="sales" radius={[4, 4, 0, 0]}>{salesSeries.map((_, i) => <Cell key={i} fill={i === 5 ? '#6d9bff' : 'rgba(109,155,255,.38)'} />)}</Bar></BarChart></ResponsiveContainer></div></section><div className="kpi-bottom-grid"><section className="panel kpi-bars"><div className="section-heading compact"><div><p className="eyebrow">ÍNDICE DE TIENDA</p><h3>Salud operativa</h3></div><span className="big-score">78<span>/100</span></span></div>{bars.map((bar) => <div className="bar-row" key={bar.name}><span>{bar.name}</span><div className="wide-track"><i style={{ width: `${bar.value}%`, background: bar.color }} /></div><b>{bar.value}</b></div>)}</section><section className="panel kpi-note"><div className="ai-orb"><Sparkles size={18} /></div><p className="eyebrow">LECTURA DE CLARVEX</p><h3>“El crecimiento viene de tickets más grandes, no de más tráfico.”</h3><p>Tu AUR creció 5.2% mientras el tráfico se mantuvo estable. La oportunidad inmediata está en accesorios.</p><button className="text-button" onClick={() => setScreen('ai')}>Preguntar a Clarvex <ArrowUpRight size={14} /></button></section></div></>
}

function AiScreen({ setScreen }: { setScreen: (screen: Screen) => void }) {
  const [query, setQuery] = useState('')
  const prompts = ['¿Por qué estamos debajo de meta?', '¿Quién necesita apoyo hoy?', 'Resume los pendientes abiertos', 'Crea el plan de mañana']
  return <><DesktopHeader title="Ask Clarvex" subtitle="Inteligencia operativa para decidir con claridad" setScreen={setScreen} /><div className="ai-workspace"><section className="ai-conversation panel"><div className="conversation-head"><div className="ai-orb"><Sparkles size={18} /></div><div><strong>Clarvex Intelligence</strong><small>Conectado a la operación de Monterrey Centro</small></div><Status tone="positive">Listo</Status></div><div className="conversation-body"><div className="ai-welcome"><div className="large-orb"><Sparkles size={28} /></div><p className="eyebrow">BUENAS TARDES, ADRIÁN</p><h2>¿Qué quieres entender<br />de tu operación?</h2><p>Pregunta en lenguaje natural. Clarvex conecta ventas, equipo, inventario y pendientes para darte una respuesta accionable.</p></div><div className="prompt-grid">{prompts.map((prompt) => <button key={prompt} onClick={() => setQuery(prompt)}><span>{prompt}</span><ArrowUpRight size={15} /></button>)}</div></div><div className="ai-composer"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pregunta a Clarvex sobre tu tienda…" onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) setQuery(query || prompts[0]) }} /><button aria-label="Enviar"><Send size={16} /></button></div></section><aside className="ai-side"><div className="side-label"><span>CONTEXTO DE HOY</span><button><MoreHorizontal size={16} /></button></div><div className="context-item"><Target size={16} /><div><strong>85.6% de meta</strong><small>$128,420 de $150,000</small></div></div><div className="context-item"><Users size={16} /><div><strong>12 personas activas</strong><small>4 con seguimiento pendiente</small></div></div><div className="context-item"><PackageSearch size={16} /><div><strong>1 discrepancia</strong><small>Zona de accesorios</small></div></div><div className="side-label recent-label"><span>RECIENTES</span></div><button className="recent-question"><MessageSquare size={15} /> ¿Cómo cerramos ayer? <ChevronRight size={14} /></button><button className="recent-question"><MessageSquare size={15} /> Compara esta semana <ChevronRight size={14} /></button></aside></div></>
}

function MobileChrome({ screen, setScreen, children }: { screen: Screen; setScreen: (screen: Screen) => void; children: React.ReactNode }) {
  return <div className="mobile-preview"><div className="mobile-statusbar"><span>9:41</span><span>▮▮▮ ◉</span></div><div className="mobile-content">{children}</div><nav className="mobile-nav"><button className={screen === 'today' ? 'mobile-nav-active' : ''} onClick={() => setScreen('today')}><Home size={19} /><span>Hoy</span></button><button className={screen === 'plan' ? 'mobile-nav-active' : ''} onClick={() => setScreen('plan')}><ListChecks size={19} /><span>Plan</span></button><button className="mobile-ai" onClick={() => setScreen('ai')}><Sparkles size={19} /></button><button><MessageSquare size={19} /><span>Chat</span></button><button><Users size={19} /><span>Equipo</span></button></nav></div>
}

function Today({ setScreen }: { setScreen: (screen: Screen) => void }) {
  return <MobileChrome screen="today" setScreen={setScreen}><div className="mobile-topline"><div><p className="mobile-greeting">Buenos días, Adrián</p><p className="mobile-date">Sábado, 27 de septiembre</p></div><div className="avatar avatar-blue">AL</div></div><div className="mobile-store-pill"><Store size={14} /> Monterrey Centro <ChevronDown size={14} /></div><section className="mobile-hero"><div className="mobile-hero-top"><div><p className="eyebrow">TU JORNADA</p><h2>En turno</h2><p>09:00 — 18:00 · Piso principal</p></div><span className="live-dot"><i /> Activo</span></div><div className="mobile-sales"><p className="eyebrow">VENTA PERSONAL</p><strong>$12,450</strong><div><span>82% de tu meta</span><span>Meta $15,000</span></div><div className="mobile-progress"><i style={{ width: '82%' }} /></div></div></section><div className="mobile-section-title"><h3>Tu siguiente acción</h3><button>Ver plan <ChevronRight size={15} /></button></div><section className="mobile-next"><div className="task-icon"><ClipboardCheck size={20} /></div><div><span className="task-label">PENDIENTE · VENCE 14:30</span><h3>Revisar visual merchandising</h3><p>Zona de accesorios · 3 pasos</p></div><ChevronRight size={18} /></section><div className="mobile-section-title"><h3>Para ti</h3><button>Ver todo <ChevronRight size={15} /></button></div><div className="mobile-attention-row"><div className="mobile-attention-icon"><Bell size={17} /></div><div><strong>1 comunicado nuevo</strong><p>Lineamientos de cierre de mes</p></div><ChevronRight size={16} /></div><div className="mobile-attention-row"><div className="mobile-attention-icon purple"><Zap size={17} /></div><div><strong>Tu ritmo va arriba</strong><p>+8% vs. el sábado pasado</p></div><ChevronRight size={16} /></div><div className="mobile-sync"><Check size={13} /> Todo sincronizado · hace 2 min</div></MobileChrome>
}

function Plan({ setScreen }: { setScreen: (screen: Screen) => void }) {
  const tasks = [{ title: 'Revisar visual merchandising', time: '14:30', done: false, tag: 'PISO DE VENTA' }, { title: 'Validar faltantes de accesorios', time: '15:00', done: false, tag: 'INVENTARIO' }, { title: 'Compartir avance con el equipo', time: '16:30', done: true, tag: 'EQUIPO' }, { title: 'Checklist de cierre', time: '18:00', done: false, tag: 'CIERRE' }]
  return <MobileChrome screen="plan" setScreen={() => {}}><div className="mobile-topline"><button className="mobile-back"><ChevronRight size={18} /></button><div><p className="mobile-greeting">Plan del día</p><p className="mobile-date">Sábado, 27 de septiembre</p></div><button className="mobile-more"><MoreHorizontal size={19} /></button></div><div className="plan-summary"><div><span>3 de 4</span><p>acciones completadas</p></div><div className="plan-progress"><i style={{ width: '75%' }} /></div></div><div className="plan-section"><p className="eyebrow">EN PROGRESO</p>{tasks.filter(t => !t.done).map(task => <div className="plan-task" key={task.title}><button className="check-circle" /><div><span>{task.tag} · {task.time}</span><h3>{task.title}</h3></div><ChevronRight size={17} /></div>)}</div><div className="plan-section completed"><p className="eyebrow">COMPLETADAS</p>{tasks.filter(t => t.done).map(task => <div className="plan-task" key={task.title}><button className="check-circle checked"><Check size={13} /></button><div><span>{task.tag} · {task.time}</span><h3>{task.title}</h3></div></div>)}</div><button className="mobile-ai-cta"><Sparkles size={17} /> Optimizar mi plan con Clarvex</button></MobileChrome>
}

function MobileScreen({ screen, setScreen }: { screen: Screen; setScreen: (screen: Screen) => void }) {
  return screen === 'plan' ? <Plan setScreen={setScreen} /> : <Today setScreen={setScreen} />
}

export default function ConceptPage() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [mobile, setMobile] = useState(false)
  const [light, setLight] = useState(false)
  const title = useMemo(() => screen === 'kpis' ? 'KPIs' : screen === 'ai' ? 'AI' : screen === 'today' ? 'Hoy' : screen === 'plan' ? 'Plan' : 'Dashboard', [screen])
  return <main className={light ? 'concept-shell light-mode' : 'concept-shell'}><div className="concept-topbar"><div className="concept-brand"><span>c</span><strong>Clarvex</strong><small>Design concept · 01</small></div><div className="screen-switcher"><button className={!mobile && screen === 'dashboard' ? 'selected' : ''} onClick={() => { setMobile(false); setScreen('dashboard') }}>Dashboard</button><button className={!mobile && screen === 'kpis' ? 'selected' : ''} onClick={() => { setMobile(false); setScreen('kpis') }}>KPIs</button><button className={!mobile && screen === 'ai' ? 'selected' : ''} onClick={() => { setMobile(false); setScreen('ai') }}>Ask Clarvex</button><span /><button className={mobile && screen === 'today' ? 'selected' : ''} onClick={() => { setMobile(true); setScreen('today') }}>Mobile · Hoy</button><button className={mobile && screen === 'plan' ? 'selected' : ''} onClick={() => { setMobile(true); setScreen('plan') }}>Mobile · Plan</button></div><div className="concept-actions"><button onClick={() => setLight(!light)} aria-label="Cambiar tema">{light ? <Sun size={16} /> : <Zap size={16} />}</button><button aria-label="Cerrar concepto"><X size={16} /></button></div></div><div className="concept-caption"><span>PROTOTIPO DE ALTA FIDELIDAD</span><span>Vista: {title}</span><span className="caption-dot">● Datos simulados</span></div>{mobile ? <div className="mobile-stage"><MobileScreen screen={screen} setScreen={setScreen} /></div> : <div className="desktop-stage"><DesktopNav screen={screen} setScreen={setScreen} /><div className="desktop-main">{screen === 'dashboard' && <Dashboard setScreen={setScreen} />}{screen === 'kpis' && <Kpis setScreen={setScreen} />}{screen === 'ai' && <AiScreen setScreen={setScreen} />}</div></div>}</main>
}
