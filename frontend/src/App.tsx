import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { 
  AlertTriangle, Camera, MapPin, Clock, Shield, 
  TrendingUp, Bell, Activity, Target,
  ChevronRight, Filter, Search, Play, Pause
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

interface Camera {
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
const cameras: Camera[] = [
  { id: 'CAM-001', name: 'Runway 27L Threshold', location: 'North Apron', status: 'online', hazards: 2, lastUpdate: '2 min ago' },
  { id: 'CAM-002', name: 'Runway 09R Approach', location: 'East Perimeter', status: 'online', hazards: 0, lastUpdate: '1 min ago' },
  { id: 'CAM-003', name: 'Taxiway Alpha', location: 'Taxiway A', status: 'online', hazards: 1, lastUpdate: '5 min ago' },
  { id: 'CAM-004', name: 'Cargo Apron', location: 'South Cargo', status: 'online', hazards: 3, lastUpdate: '3 min ago' },
  { id: 'CAM-005', name: 'Runway 27R Threshold', location: 'South Apron', status: 'maintenance', hazards: 0, lastUpdate: '1 hour ago' },
  { id: 'CAM-006', name: 'Terminal Gate A1', location: 'Terminal A', status: 'online', hazards: 1, lastUpdate: '4 min ago' },
]

const hazards: Hazard[] = [
  { id: 'HZ-001', type: 'bird', confidence: 94, location: 'Runway 27L - 500ft AGL', camera: 'CAM-001', timestamp: '10:23:45', severity: 'high', status: 'tracking' },
  { id: 'HZ-002', type: 'drone', confidence: 87, location: 'North Apron - 200ft AGL', camera: 'CAM-001', timestamp: '10:21:12', severity: 'critical', status: 'detected' },
  { id: 'HZ-003', type: 'debris', confidence: 76, location: 'Taxiway Alpha - Gate A3', camera: 'CAM-003', timestamp: '10:18:33', severity: 'medium', status: 'tracking' },
  { id: 'HZ-004', type: 'bird', confidence: 91, location: 'Cargo Apron - Ground Level', camera: 'CAM-004', timestamp: '10:15:22', severity: 'low', status: 'resolved' },
  { id: 'HZ-005', type: 'vehicle', confidence: 98, location: 'Terminal A - Gate A1', camera: 'CAM-006', timestamp: '10:12:45', severity: 'medium', status: 'tracking' },
  { id: 'HZ-006', type: 'bird', confidence: 88, location: 'Cargo Apron - 300ft AGL', camera: 'CAM-004', timestamp: '10:08:11', severity: 'high', status: 'detected' },
  { id: 'HZ-007', type: 'drone', confidence: 92, location: 'North Apron - 150ft AGL', camera: 'CAM-001', timestamp: '10:05:33', severity: 'critical', status: 'tracking' },
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

// Components
const StatCard = ({ icon: Icon, label, value, trend, trendUp }: { icon: any, label: string, value: string, trend?: string, trendUp?: boolean }) => (
  <div className="stat-card">
    <div className="stat-icon">
      <Icon size={24} />
    </div>
    <div className="stat-content">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {trend && (
        <span className={`stat-trend ${trendUp ? 'up' : 'down'}`}>
          <TrendingUp size={14} style={{ transform: trendUp ? 'none' : 'rotate(180deg)' }} />
          {trend}
        </span>
      )}
    </div>
  </div>
)

const HazardTypeIcon = ({ type }: { type: Hazard['type'] }) => {
  const icons = {
    bird: '🐦',
    drone: '🚁',
    debris: '📦',
    vehicle: '🚗'
  }
  return <span style={{ fontSize: '20px' }}>{icons[type]}</span>
}

const SeverityBadge = ({ severity }: { severity: Hazard['severity'] }) => {
  const colors = {
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#f97316',
    critical: '#ef4444'
  }
  return (
    <span className="severity-badge" style={{ backgroundColor: colors[severity] }}>
      {severity.toUpperCase()}
    </span>
  )
}

const CameraCard = ({ camera }: { camera: Camera }) => (
  <div className={`camera-card ${camera.status}`}>
    <div className="camera-header">
      <Camera size={18} />
      <span className="camera-id">{camera.id}</span>
      <span className={`camera-status ${camera.status}`}>{camera.status}</span>
    </div>
    <div className="camera-preview">
      <div className="camera-feed">
        <MapPin size={32} />
        <span>{camera.location}</span>
      </div>
    </div>
    <div className="camera-info">
      <span className="camera-name">{camera.name}</span>
      <div className="camera-stats">
        <span className="hazards-count">{camera.hazards} active hazards</span>
        <span className="last-update">{camera.lastUpdate}</span>
      </div>
    </div>
  </div>
)

const AlertItem = ({ alert }: { alert: Alert }) => (
  <div className={`alert-item ${alert.severity} ${alert.acknowledged ? 'acknowledged' : ''}`}>
    <div className="alert-icon">
      <Bell size={18} />
    </div>
    <div className="alert-content">
      <span className="alert-title">{alert.title}</span>
      <span className="alert-message">{alert.message}</span>
      <span className="alert-time">{alert.timestamp}</span>
    </div>
    {!alert.acknowledged && <button className="acknowledge-btn">Ack</button>}
  </div>
)

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cameras' | 'hazards' | 'history'>('dashboard')
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null)
  const [isPaused, setIsPaused] = useState(false)

  const activeHazards = hazards.filter(h => h.status !== 'resolved').length
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length
  const onlineCameras = cameras.filter(c => c.status === 'online').length

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <Target size={32} />
          <span>RunwayWatcher</span>
        </div>
        <nav className="nav">
          <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <Activity size={20} />
            <span>Dashboard</span>
          </button>
          <button className={`nav-item ${activeTab === 'cameras' ? 'active' : ''}`} onClick={() => setActiveTab('cameras')}>
            <Camera size={20} />
            <span>Cameras</span>
          </button>
          <button className={`nav-item ${activeTab === 'hazards' ? 'active' : ''}`} onClick={() => setActiveTab('hazards')}>
            <AlertTriangle size={20} />
            <span>Hazards</span>
          </button>
          <button className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            <Clock size={20} />
            <span>History</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="system-status">
            <div className="status-indicator online"></div>
            <span>System Online</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="header">
          <div className="header-left">
            <h1>Airport Hazard Detection System</h1>
            <span className="airport-code">KJFK - John F. Kennedy International</span>
          </div>
          <div className="header-right">
            <div className="live-indicator">
              <span className="pulse"></span>
              <span>LIVE</span>
            </div>
            <button className="control-btn" onClick={() => setIsPaused(!isPaused)}>
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
            </button>
            <button className="control-btn">
              <Bell size={18} />
              <span className="notification-badge">{criticalAlerts}</span>
            </button>
            <div className="search-box">
              <Search size={18} />
              <input type="text" placeholder="Search cameras, hazards..." />
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        {activeTab === 'dashboard' && (
          <div className="dashboard">
            {/* Stats Row */}
            <div className="stats-row">
              <StatCard icon={AlertTriangle} label="Active Hazards" value={activeHazards.toString()} trend="+3 today" trendUp={true} />
              <StatCard icon={Camera} label="Online Cameras" value={`${onlineCameras}/${cameras.length}`} />
              <StatCard icon={Bell} label="Critical Alerts" value={criticalAlerts.toString()} trend="2 unresolved" trendUp={false} />
              <StatCard icon={Shield} label="Risk Score" value="72/100" trend="-5 from avg" trendUp={false} />
            </div>

            {/* Main Grid */}
            <div className="dashboard-grid">
              {/* Map Section */}
              <div className="card map-section">
                <div className="card-header">
                  <h2>Airport Overview</h2>
                  <div className="card-actions">
                    <button className="filter-btn"><Filter size={16} /></button>
                  </div>
                </div>
                <div className="airport-map">
                  <div className="runway runway-27l">Runway 27L</div>
                  <div className="runway runway-27r">Runway 27R</div>
                  <div className="taxiway taxiway-a">Taxiway A</div>
                  <div className="taxiway taxiway-b">Taxiway B</div>
                  <div className="apron north-apron">North Apron</div>
                  <div className="apron south-apron">South Apron</div>
                  <div className="apron cargo-apron">Cargo Apron</div>
                  <div className="terminal terminal-a">Terminal A</div>
                  <div className="terminal terminal-b">Terminal B</div>
                  {/* Hazard Markers */}
                  <div className="hazard-marker critical" style={{ top: '20%', left: '30%' }} title="Drone - Critical">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="hazard-marker high" style={{ top: '35%', left: '25%' }} title="Bird - High">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="hazard-marker medium" style={{ top: '60%', left: '45%' }} title="Debris - Medium">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="hazard-marker high" style={{ top: '70%', left: '35%' }} title="Bird - High">
                    <AlertTriangle size={20} />
                  </div>
                  {/* Camera Markers */}
                  <div className="camera-marker" style={{ top: '15%', left: '28%' }} title="CAM-001">
                    <Camera size={16} />
                  </div>
                  <div className="camera-marker" style={{ top: '10%', left: '60%' }} title="CAM-002">
                    <Camera size={16} />
                  </div>
                  <div className="camera-marker" style={{ top: '45%', left: '40%' }} title="CAM-003">
                    <Camera size={16} />
                  </div>
                  <div className="camera-marker" style={{ top: '75%', left: '30%' }} title="CAM-004">
                    <Camera size={16} />
                  </div>
                  <div className="camera-marker offline" style={{ top: '25%', left: '35%' }} title="CAM-005 (Offline)">
                    <Camera size={16} />
                  </div>
                  <div className="camera-marker" style={{ top: '50%', left: '55%' }} title="CAM-006">
                    <Camera size={16} />
                  </div>
                </div>
              </div>

              {/* Alerts Panel */}
              <div className="card alerts-panel">
                <div className="card-header">
                  <h2>Recent Alerts</h2>
                  <button className="view-all-btn">View All <ChevronRight size={16} /></button>
                </div>
                <div className="alerts-list">
                  {alerts.map(alert => <AlertItem key={alert.id} alert={alert} />)}
                </div>
              </div>

              {/* Charts */}
              <div className="card chart-card">
                <div className="card-header">
                  <h2>Hazard Activity (24h)</h2>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="hour" stroke="#9ca3af" fontSize={12} />
                    <YAxis stroke="#9ca3af" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                    <Line type="monotone" dataKey="birds" stroke="#22c55e" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="drones" stroke="#ef4444" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="debris" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="chart-legend">
                  <span className="legend-item"><span className="dot birds"></span> Birds</span>
                  <span className="legend-item"><span className="dot drones"></span> Drones</span>
                  <span className="legend-item"><span className="dot debris"></span> Debris</span>
                </div>
              </div>

              <div className="card chart-card">
                <div className="card-header">
                  <h2>Risk Score Trend</h2>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={riskScoreData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
                    <YAxis stroke="#9ca3af" fontSize={12} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                    <Bar dataKey="score" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Recent Hazards */}
              <div className="card hazards-panel">
                <div className="card-header">
                  <h2>Active Hazards</h2>
                  <button className="view-all-btn">View All <ChevronRight size={16} /></button>
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
              </div>
            </div>
          </div>
        )}

        {/* Cameras Tab */}
        {activeTab === 'cameras' && (
          <div className="cameras-view">
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
              {cameras.map(camera => <CameraCard key={camera.id} camera={camera} />)}
            </div>
          </div>
        )}

        {/* Hazards Tab */}
        {activeTab === 'hazards' && (
          <div className="hazards-view">
            <div className="hazards-header">
              <h2>All Hazards</h2>
              <div className="hazard-filters">
                <select className="filter-select">
                  <option>All Types</option>
                  <option>Birds</option>
                  <option>Drones</option>
                  <option>Debris</option>
                  <option>Vehicles</option>
                </select>
                <select className="filter-select">
                  <option>All Severities</option>
                  <option>Critical</option>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
                <select className="filter-select">
                  <option>All Statuses</option>
                  <option>Detected</option>
                  <option>Tracking</option>
                  <option>Resolved</option>
                </select>
              </div>
            </div>
            <div className="hazards-list">
              {hazards.map(hazard => (
                <div key={hazard.id} className="hazard-detail-card">
                  <div className="hazard-detail-header">
                    <HazardTypeIcon type={hazard.type} />
                    <div className="hazard-detail-info">
                      <span className="hazard-id">{hazard.id}</span>
                      <span className="hazard-camera">{hazard.camera} • {hazard.timestamp}</span>
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
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="history-view">
            <div className="history-header">
              <h2>Historical Data</h2>
              <div className="date-range">
                <input type="date" defaultValue="2026-02-15" />
                <span>to</span>
                <input type="date" defaultValue="2026-02-15" />
              </div>
            </div>
            <div className="history-stats">
              <div className="history-stat">
                <span className="history-stat-value">247</span>
                <span className="history-stat-label">Total Detections</span>
              </div>
              <div className="history-stat">
                <span className="history-stat-value">89%</span>
                <span className="history-stat-label">Avg Confidence</span>
              </div>
              <div className="history-stat">
                <span className="history-stat-value">12</span>
                <span className="history-stat-label">Critical Events</span>
              </div>
              <div className="history-stat">
                <span className="history-stat-value">4.2 min</span>
                <span className="history-stat-label">Avg Response Time</span>
              </div>
            </div>
            <div className="history-chart">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="hour" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                  <Bar dataKey="birds" stackId="a" fill="#22c55e" />
                  <Bar dataKey="drones" stackId="a" fill="#ef4444" />
                  <Bar dataKey="debris" stackId="a" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
