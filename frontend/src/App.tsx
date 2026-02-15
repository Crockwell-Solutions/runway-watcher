import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from 'recharts'
import {
  AlertTriangle, Camera, Clock, Shield,
  TrendingUp, Bell, Activity, Target,
  ChevronRight, Filter, Search, Play, Pause,
  Radio, Eye, Zap
} from 'lucide-react'
import './App.css'

// Types
interface Hazard {
  id: string
  type: 'bird' | 'drone' | 'debris' | 'vehicle'
  confidence: number
  location: string
  camera: string
  timestamp: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'detected' | 'tracking' | 'resolved'
}

interface CameraData {
  id: string
  name: string
  location: string
  status: 'online' | 'offline' | 'maintenance'
  hazards: number
  lastUpdate: string
}

interface Alert {
  id: string
  title: string
  message: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  timestamp: string
  acknowledged: boolean
}

// Dummy Data
const cameras: CameraData[] = [
  { id: 'CAM-001', name: 'Runway 27L Threshold', location: 'North Apron', status: 'online', hazards: 2, lastUpdate: '2 min ago' },
  { id: 'CAM-002', name: 'Runway 09R Approach', location: 'East Perimeter', status: 'online', hazards: 0, lastUpdate: '1 min ago' },
  { id: 'CAM-003', name: 'Taxiway Alpha', location: 'Taxiway A', status: 'online', hazards: 1, lastUpdate: '5 min ago' },
  { id: 'CAM-004', name: 'Cargo Apron', location: 'South Cargo', status: 'online', hazards: 3, lastUpdate: '3 min ago' },
  { id: 'CAM-005', name: 'Runway 27R Threshold', location: 'South Apron', status: 'maintenance', hazards: 0, lastUpdate: '1 hour ago' },
  { id: 'CAM-006', name: 'Terminal Gate A1', location: 'Terminal A', status: 'online', hazards: 1, lastUpdate: '4 min ago' },
]

const hazards: Hazard[] = [
  { id: 'HZ-001', type: 'bird', confidence: 94, location: 'Runway 27L — 500ft AGL', camera: 'CAM-001', timestamp: '10:23:45', severity: 'high', status: 'tracking' },
  { id: 'HZ-002', type: 'drone', confidence: 87, location: 'North Apron — 200ft AGL', camera: 'CAM-001', timestamp: '10:21:12', severity: 'critical', status: 'detected' },
  { id: 'HZ-003', type: 'debris', confidence: 76, location: 'Taxiway Alpha — Gate A3', camera: 'CAM-003', timestamp: '10:18:33', severity: 'medium', status: 'tracking' },
  { id: 'HZ-004', type: 'bird', confidence: 91, location: 'Cargo Apron — Ground Level', camera: 'CAM-004', timestamp: '10:15:22', severity: 'low', status: 'resolved' },
  { id: 'HZ-005', type: 'vehicle', confidence: 98, location: 'Terminal A — Gate A1', camera: 'CAM-006', timestamp: '10:12:45', severity: 'medium', status: 'tracking' },
  { id: 'HZ-006', type: 'bird', confidence: 88, location: 'Cargo Apron — 300ft AGL', camera: 'CAM-004', timestamp: '10:08:11', severity: 'high', status: 'detected' },
  { id: 'HZ-007', type: 'drone', confidence: 92, location: 'North Apron — 150ft AGL', camera: 'CAM-001', timestamp: '10:05:33', severity: 'critical', status: 'tracking' },
]

const alerts: Alert[] = [
  { id: 'ALT-001', title: 'Critical: Drone Detected', message: 'Unauthorized drone detected in restricted airspace near Runway 27L', severity: 'critical', timestamp: '10:23:45', acknowledged: false },
  { id: 'ALT-002', title: 'High: Bird Activity', message: 'Flock of birds detected at 500ft approaching approach path', severity: 'high', timestamp: '10:21:12', acknowledged: false },
  { id: 'ALT-003', title: 'Medium: Foreign Object', message: 'Possible debris detected on Taxiway Alpha', severity: 'medium', timestamp: '10:18:33', acknowledged: true },
  { id: 'ALT-004', title: 'Low: Vehicle Movement', message: 'Unidentified vehicle detected in terminal area', severity: 'low', timestamp: '10:12:45', acknowledged: true },
]

const hourlyData = [
  { hour: '06:00', birds: 12, drones: 2, debris: 3 },
  { hour: '07:00', birds: 18, drones: 4, debris: 5 },
  { hour: '08:00', birds: 25, drones: 3, debris: 4 },
  { hour: '09:00', birds: 22, drones: 5, debris: 6 },
  { hour: '10:00', birds: 28, drones: 7, debris: 4 },
  { hour: '11:00', birds: 19, drones: 4, debris: 3 },
  { hour: '12:00', birds: 15, drones: 2, debris: 2 },
  { hour: '13:00', birds: 21, drones: 3, debris: 4 },
  { hour: '14:00', birds: 24, drones: 6, debris: 5 },
  { hour: '15:00', birds: 20, drones: 4, debris: 3 },
  { hour: '16:00', birds: 16, drones: 3, debris: 2 },
  { hour: '17:00', birds: 14, drones: 2, debris: 1 },
]

const riskScoreData = [
  { time: '00:00', score: 25 },
  { time: '04:00', score: 20 },
  { time: '08:00', score: 65 },
  { time: '12:00', score: 55 },
  { time: '16:00', score: 70 },
  { time: '20:00', score: 45 },
  { time: '23:59', score: 30 },
]

// Animation variants
const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] }
  })
}

const pageTransition = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } }
}

// Tooltip style
const tooltipStyle = {
  backgroundColor: 'rgba(17, 24, 39, 0.95)',
  border: '1px solid rgba(148, 163, 184, 0.1)',
  borderRadius: '10px',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  padding: '10px 14px',
  fontSize: '12px',
}

// Components
const StatCard = ({ icon: Icon, label, value, trend, trendUp, index }: { icon: React.ElementType, label: string, value: string, trend?: string, trendUp?: boolean, index: number }) => (
  <motion.div className="stat-card" custom={index} variants={fadeIn} initial="hidden" animate="visible">
    <div className="stat-icon">
      <Icon size={22} />
    </div>
    <div className="stat-content">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {trend && (
        <span className={`stat-trend ${trendUp ? 'up' : 'down'}`}>
          <TrendingUp size={12} style={{ transform: trendUp ? 'none' : 'rotate(180deg)' }} />
          {trend}
        </span>
      )}
    </div>
  </motion.div>
)

const HazardTypeIcon = ({ type }: { type: Hazard['type'] }) => {
  const icons = { bird: '🐦', drone: '🛸', debris: '⚠️', vehicle: '🚗' }
  return <span style={{ fontSize: '18px' }}>{icons[type]}</span>
}

const SeverityBadge = ({ severity }: { severity: Hazard['severity'] }) => {
  const styles: Record<string, { bg: string; color: string }> = {
    low: { bg: 'rgba(52, 211, 153, 0.15)', color: '#34d399' },
    medium: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24' },
    high: { bg: 'rgba(251, 146, 60, 0.15)', color: '#fb923c' },
    critical: { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' },
  }
  const s = styles[severity]
  return (
    <span className="severity-badge" style={{ backgroundColor: s.bg, color: s.color }}>
      {severity}
    </span>
  )
}

const CameraCard = ({ camera, index }: { camera: CameraData; index: number }) => (
  <motion.div
    className={`camera-card ${camera.status}`}
    custom={index}
    variants={fadeIn}
    initial="hidden"
    animate="visible"
    whileHover={{ y: -4 }}
  >
    <div className="camera-header">
      <Camera size={14} />
      <span className="camera-id">{camera.id}</span>
      <span className={`camera-status ${camera.status}`}>{camera.status}</span>
    </div>
    <div className="camera-preview">
      <div className="camera-feed">
        <Eye size={28} strokeWidth={1.5} />
        <span>{camera.location}</span>
      </div>
    </div>
    <div className="camera-info">
      <span className="camera-name">{camera.name}</span>
      <div className="camera-stats">
        <span className="hazards-count">{camera.hazards} active</span>
        <span className="last-update">{camera.lastUpdate}</span>
      </div>
    </div>
  </motion.div>
)

const AlertItem = ({ alert, index }: { alert: Alert; index: number }) => (
  <motion.div
    className={`alert-item ${alert.severity} ${alert.acknowledged ? 'acknowledged' : ''}`}
    custom={index}
    variants={fadeIn}
    initial="hidden"
    animate="visible"
  >
    <div className="alert-icon">
      {alert.severity === 'critical' ? <Zap size={16} /> : <Bell size={16} />}
    </div>
    <div className="alert-content">
      <span className="alert-title">{alert.title}</span>
      <span className="alert-message">{alert.message}</span>
      <span className="alert-time">{alert.timestamp}</span>
    </div>
    {!alert.acknowledged && <button className="acknowledge-btn">Ack</button>}
  </motion.div>
)

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cameras' | 'hazards' | 'history'>('dashboard')
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null)
  const [isPaused, setIsPaused] = useState(false)

  const activeHazards = hazards.filter(h => h.status !== 'resolved').length
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length
  const onlineCameras = cameras.filter(c => c.status === 'online').length

  const tabs = [
    { key: 'dashboard' as const, icon: Activity, label: 'Dashboard' },
    { key: 'cameras' as const, icon: Camera, label: 'Cameras' },
    { key: 'hazards' as const, icon: AlertTriangle, label: 'Hazards' },
    { key: 'history' as const, icon: Clock, label: 'History' },
  ]

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <Target size={26} strokeWidth={2.5} />
          <span>RunwayWatcher</span>
        </div>
        <nav className="nav">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`nav-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
              aria-label={tab.label}
            >
              <tab.icon size={20} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="system-status">
            <div className="status-indicator online" />
            <span>System Online</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          <div className="header-left">
            <h1>Hazard Detection</h1>
            <span className="airport-code">KJFK</span>
          </div>
          <div className="header-right">
            <div className="live-indicator">
              <span className="pulse" />
              <span>Live</span>
            </div>
            <button className="control-btn" onClick={() => setIsPaused(!isPaused)} aria-label={isPaused ? 'Resume' : 'Pause'}>
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button className="control-btn" aria-label="Notifications">
              <Bell size={16} />
              {criticalAlerts > 0 && <span className="notification-badge">{criticalAlerts}</span>}
            </button>
            <div className="search-box">
              <Search size={16} />
              <input type="text" placeholder="Search..." aria-label="Search cameras and hazards" />
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {/* Dashboard */}
          {activeTab === 'dashboard' && (
            <motion.div className="dashboard" key="dashboard" variants={pageTransition} initial="hidden" animate="visible" exit="exit">
              <div className="stats-row">
                <StatCard icon={AlertTriangle} label="Active Hazards" value={activeHazards.toString()} trend="+3 today" trendUp index={0} />
                <StatCard icon={Radio} label="Online Cameras" value={`${onlineCameras}/${cameras.length}`} index={1} />
                <StatCard icon={Zap} label="Critical Alerts" value={criticalAlerts.toString()} trend="2 unresolved" trendUp={false} index={2} />
                <StatCard icon={Shield} label="Risk Score" value="72" trend="−5 from avg" trendUp={false} index={3} />
              </div>

              <div className="dashboard-grid">
                {/* Map */}
                <motion.div className="card map-section" custom={4} variants={fadeIn} initial="hidden" animate="visible">
                  <div className="card-header">
                    <h2>Airport Overview</h2>
                    <button className="filter-btn" aria-label="Filter map"><Filter size={16} /></button>
                  </div>
                  <div className="airport-map">
                    <div className="runway runway-27l">RWY 27L</div>
                    <div className="runway runway-27r">RWY 27R</div>
                    <div className="taxiway taxiway-a">TWY A</div>
                    <div className="taxiway taxiway-b">TWY B</div>
                    <div className="apron north-apron">N. Apron</div>
                    <div className="apron south-apron">S. Apron</div>
                    <div className="apron cargo-apron">Cargo</div>
                    <div className="terminal terminal-a">Term A</div>
                    <div className="terminal terminal-b">Term B</div>
                    <div className="hazard-marker critical" style={{ top: '20%', left: '30%' }} title="Drone — Critical">
                      <AlertTriangle size={14} />
                    </div>
                    <div className="hazard-marker high" style={{ top: '35%', left: '25%' }} title="Bird — High">
                      <AlertTriangle size={14} />
                    </div>
                    <div className="hazard-marker medium" style={{ top: '60%', left: '45%' }} title="Debris — Medium">
                      <AlertTriangle size={14} />
                    </div>
                    <div className="hazard-marker high" style={{ top: '70%', left: '35%' }} title="Bird — High">
                      <AlertTriangle size={14} />
                    </div>
                    <div className="camera-marker" style={{ top: '15%', left: '28%' }} title="CAM-001"><Camera size={13} /></div>
                    <div className="camera-marker" style={{ top: '10%', left: '60%' }} title="CAM-002"><Camera size={13} /></div>
                    <div className="camera-marker" style={{ top: '45%', left: '40%' }} title="CAM-003"><Camera size={13} /></div>
                    <div className="camera-marker" style={{ top: '75%', left: '30%' }} title="CAM-004"><Camera size={13} /></div>
                    <div className="camera-marker offline" style={{ top: '25%', left: '35%' }} title="CAM-005 (Offline)"><Camera size={13} /></div>
                    <div className="camera-marker" style={{ top: '50%', left: '55%' }} title="CAM-006"><Camera size={13} /></div>
                  </div>
                </motion.div>

                {/* Alerts */}
                <motion.div className="card alerts-panel" custom={5} variants={fadeIn} initial="hidden" animate="visible">
                  <div className="card-header">
                    <h2>Alerts</h2>
                    <button className="view-all-btn">All <ChevronRight size={14} /></button>
                  </div>
                  <div className="alerts-list">
                    {alerts.map((alert, i) => <AlertItem key={alert.id} alert={alert} index={i} />)}
                  </div>
                </motion.div>

                {/* Hazard Activity Chart */}
                <motion.div className="card chart-card" custom={6} variants={fadeIn} initial="hidden" animate="visible">
                  <div className="card-header">
                    <h2>Hazard Activity (24h)</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={190}>
                    <AreaChart data={hourlyData}>
                      <defs>
                        <linearGradient id="gradBirds" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradDrones" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f87171" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                      <XAxis dataKey="hour" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="birds" stroke="#34d399" strokeWidth={2} fill="url(#gradBirds)" />
                      <Area type="monotone" dataKey="drones" stroke="#f87171" strokeWidth={2} fill="url(#gradDrones)" />
                      <Line type="monotone" dataKey="debris" stroke="#fbbf24" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="chart-legend">
                    <span className="legend-item"><span className="dot birds" /> Birds</span>
                    <span className="legend-item"><span className="dot drones" /> Drones</span>
                    <span className="legend-item"><span className="dot debris" /> Debris</span>
                  </div>
                </motion.div>

                {/* Risk Score Chart */}
                <motion.div className="card chart-card" custom={7} variants={fadeIn} initial="hidden" animate="visible">
                  <div className="card-header">
                    <h2>Risk Score Trend</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={riskScoreData}>
                      <defs>
                        <linearGradient id="gradRisk" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#818cf8" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.4} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                      <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#475569" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="score" fill="url(#gradRisk)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>

                {/* Active Hazards Table */}
                <motion.div className="card hazards-panel" custom={8} variants={fadeIn} initial="hidden" animate="visible">
                  <div className="card-header">
                    <h2>Active Hazards</h2>
                    <button className="view-all-btn" onClick={() => setActiveTab('hazards')}>All <ChevronRight size={14} /></button>
                  </div>
                  <div className="hazards-table">
                    <div className="table-header">
                      <span>Type</span>
                      <span>Location</span>
                      <span>Confidence</span>
                      <span>Severity</span>
                      <span>Status</span>
                    </div>
                    {hazards.slice(0, 5).map(hazard => (
                      <div
                        key={hazard.id}
                        className={`table-row ${selectedHazard?.id === hazard.id ? 'selected' : ''}`}
                        onClick={() => setSelectedHazard(hazard)}
                      >
                        <span className="hazard-type"><HazardTypeIcon type={hazard.type} /></span>
                        <span className="hazard-location">{hazard.location}</span>
                        <span className="hazard-confidence">{hazard.confidence}%</span>
                        <SeverityBadge severity={hazard.severity} />
                        <span className={`hazard-status ${hazard.status}`}>{hazard.status}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* Cameras */}
          {activeTab === 'cameras' && (
            <motion.div className="cameras-view" key="cameras" variants={pageTransition} initial="hidden" animate="visible" exit="exit">
              <div className="cameras-header">
                <h2>Camera Feeds</h2>
                <div className="camera-filters">
                  <button className="filter-chip active">All ({cameras.length})</button>
                  <button className="filter-chip">Online ({onlineCameras})</button>
                  <button className="filter-chip">Offline ({cameras.filter(c => c.status === 'offline').length})</button>
                  <button className="filter-chip">Maintenance ({cameras.filter(c => c.status === 'maintenance').length})</button>
                </div>
              </div>
              <div className="cameras-grid">
                {cameras.map((camera, i) => <CameraCard key={camera.id} camera={camera} index={i} />)}
              </div>
            </motion.div>
          )}

          {/* Hazards */}
          {activeTab === 'hazards' && (
            <motion.div className="hazards-view" key="hazards" variants={pageTransition} initial="hidden" animate="visible" exit="exit">
              <div className="hazards-header">
                <h2>All Hazards</h2>
                <div className="hazard-filters">
                  <select className="filter-select" aria-label="Filter by type">
                    <option>All Types</option>
                    <option>Birds</option>
                    <option>Drones</option>
                    <option>Debris</option>
                    <option>Vehicles</option>
                  </select>
                  <select className="filter-select" aria-label="Filter by severity">
                    <option>All Severities</option>
                    <option>Critical</option>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                  <select className="filter-select" aria-label="Filter by status">
                    <option>All Statuses</option>
                    <option>Detected</option>
                    <option>Tracking</option>
                    <option>Resolved</option>
                  </select>
                </div>
              </div>
              <div className="hazards-list">
                {hazards.map((hazard, i) => (
                  <motion.div key={hazard.id} className="hazard-detail-card" custom={i} variants={fadeIn} initial="hidden" animate="visible">
                    <div className="hazard-detail-header">
                      <HazardTypeIcon type={hazard.type} />
                      <div className="hazard-detail-info">
                        <span className="hazard-id">{hazard.id}</span>
                        <span className="hazard-camera">{hazard.camera} · {hazard.timestamp}</span>
                      </div>
                      <SeverityBadge severity={hazard.severity} />
                    </div>
                    <div className="hazard-detail-body">
                      <div className="detail-row">
                        <span className="detail-label">Location</span>
                        <span className="detail-value">{hazard.location}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Confidence</span>
                        <span className="detail-value">{hazard.confidence}%</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Status</span>
                        <span className={`detail-value status-${hazard.status}`}>{hazard.status}</span>
                      </div>
                    </div>
                    <div className="hazard-detail-actions">
                      <button className="action-btn primary">Track</button>
                      <button className="action-btn secondary">View Feed</button>
                      <button className="action-btn">Resolve</button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* History */}
          {activeTab === 'history' && (
            <motion.div className="history-view" key="history" variants={pageTransition} initial="hidden" animate="visible" exit="exit">
              <div className="history-header">
                <h2>Historical Data</h2>
                <div className="date-range">
                  <input type="date" defaultValue="2026-02-15" aria-label="Start date" />
                  <span>to</span>
                  <input type="date" defaultValue="2026-02-15" aria-label="End date" />
                </div>
              </div>
              <div className="history-stats">
                {[
                  { value: '247', label: 'Total Detections' },
                  { value: '89%', label: 'Avg Confidence' },
                  { value: '12', label: 'Critical Events' },
                  { value: '4.2m', label: 'Avg Response' },
                ].map((stat, i) => (
                  <motion.div key={stat.label} className="history-stat" custom={i} variants={fadeIn} initial="hidden" animate="visible">
                    <span className="history-stat-value">{stat.value}</span>
                    <span className="history-stat-label">{stat.label}</span>
                  </motion.div>
                ))}
              </div>
              <motion.div className="history-chart" custom={4} variants={fadeIn} initial="hidden" animate="visible">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                    <XAxis dataKey="hour" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="birds" stackId="a" fill="#34d399" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="drones" stackId="a" fill="#f87171" />
                    <Bar dataKey="debris" stackId="a" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App
