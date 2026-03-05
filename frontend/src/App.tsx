import React from 'react'
import { motion } from 'framer-motion'
import {
  Map, Bell, Video,
  Plus, Minus,
  Zap, MoreVertical, Eye, Locate, RefreshCw, X
} from 'lucide-react'
import runwayWatcherLogo from './assets/runway-watcher.svg'
import { config } from './config'
import './App.css'

// ── Types ──
type Page = 'map' | 'cameras'

interface Alert {
  id: string
  title: string
  severity: 'critical' | 'high' | 'info'
  label: string
  score: number
  description: string
  imageUrl?: string
  actionLabel: string
}

interface CameraFeed {
  id: string
  name: string
  location: string
  status: 'recording' | 'online' | 'offline' | 'maintenance'
  imageUrl: string
  timestamp?: string
}

// ── Camera metadata (static info for each camera ID) ──
const cameraMetadata: Record<string, { name: string; location: string }> = {
  CAMERA1: { name: 'RUNWAY SOUTH', location: 'South Runway 09L/27R' },
  CAMERA2: { name: 'PERIMETER WEST', location: 'West Perimeter Fence' },
  CAMERA3: { name: 'PERIMETER EAST', location: 'East Perimeter Fence' },
}

// ── Hook to fetch latest camera images from the API ──
function useCameraFeeds() {
  const [cameras, setCameras] = React.useState<CameraFeed[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const fetchCameras = React.useCallback(async () => {
    try {
      const res = await fetch(`${config.apiUrl}cameras/latest`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      const feeds: CameraFeed[] = (data.cameras ?? []).map((cam: { cameraId: string; key: string; timestamp: string; imageUrl: string }) => {
        const meta = cameraMetadata[cam.cameraId] ?? { name: cam.cameraId, location: 'Unknown' }
        return {
          id: cam.cameraId,
          name: meta.name,
          location: meta.location,
          status: 'recording' as const,
          imageUrl: cam.imageUrl,
          timestamp: cam.timestamp,
        }
      })

      setCameras(feeds)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch camera feeds', err)
      setError('Failed to load camera feeds')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchCameras()
    const interval = setInterval(fetchCameras, 30_000) // refresh every 30s
    return () => clearInterval(interval)
  }, [fetchCameras])

  return { cameras, loading, error, refresh: fetchCameras }
}

// ── Types for camera alerts from API ──
interface CameraAlert {
  id?: string
  cameraId?: string
  type?: string
  severity?: string
  alertLevel?: string
  confidence?: number
  timestamp?: string
}

// ── Hook to fetch camera alerts from the API ──
function useCameraAlerts() {
  const [cameraAlerts, setCameraAlerts] = React.useState<CameraAlert[]>([])

  const fetchAlerts = React.useCallback(async () => {
    try {
      const res = await fetch(`${config.apiUrl}cameras/alerts`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setCameraAlerts(data.alerts ?? [])
    } catch (err) {
      console.error('Failed to fetch camera alerts', err)
    }
  }, [])

  React.useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 15_000)
    return () => clearInterval(interval)
  }, [fetchAlerts])

  return { cameraAlerts }
}

// ── Camera positions on the map (2400x1200 canvas) ──
const cameraPositions: Record<string, { top: number; left: number; label: string; directionDeg: number }> = {
  CAMERA1: { top: 1000, left: 400, label: 'CAM 1 — RUNWAY SOUTH', directionDeg: 45 },
  CAMERA2: { top: 700, left: 50, label: 'CAM 2 — PERIMETER WEST', directionDeg: 90 },
  CAMERA3: { top: 1200, left: 1800, label: 'CAM 3 — PERIMETER EAST', directionDeg: -22.5 },
}

// ── Alert type to icon mapping (Material Symbols) ──
const alertTypeIcons: Record<string, string> = {
  drone: 'drone',
  birds: 'flutter_dash',
  debris: 'warning',
  vehicle: 'local_shipping',
}

function getAlertLevel(cameraAlerts: CameraAlert[], cameraId: string): 'normal' | 'warning' | 'alert' {
  const camAlerts = cameraAlerts.filter(a => a.cameraId === cameraId)
  if (camAlerts.some(a => a.alertLevel === 'alert')) return 'alert'
  if (camAlerts.some(a => a.alertLevel === 'warning')) return 'warning'
  return 'normal'
}

function getAlertDetails(cameraAlerts: CameraAlert[], cameraId: string): CameraAlert | undefined {
  // Return the highest-priority alert for this camera
  return cameraAlerts.find(a => a.cameraId === cameraId && a.alertLevel === 'alert')
    ?? cameraAlerts.find(a => a.cameraId === cameraId && a.alertLevel === 'warning')
}

function CameraMapMarker({ cameraId, position, cameraAlerts, onSelect }: {
  cameraId: string
  position: { top: number; left: number; label: string; directionDeg: number }
  cameraAlerts: CameraAlert[]
  onSelect?: () => void
}) {
  const level = getAlertLevel(cameraAlerts, cameraId)
  const detail = getAlertDetails(cameraAlerts, cameraId)

  const colors = {
    normal: { border: 'border-emerald-500', text: 'text-emerald-500', bg: 'bg-emerald-500', ping: '' },
    warning: { border: 'border-amber-500', text: 'text-amber-500', bg: 'bg-amber-500', ping: '' },
    alert: { border: 'border-red-500', text: 'text-red-500', bg: 'bg-red-500', ping: 'animate-ping' },
  }[level]

  const icon = level === 'normal'
    ? 'videocam'
    : alertTypeIcons[detail?.type ?? ''] ?? 'warning'

  const label = level === 'normal'
    ? position.label
    : `${(detail?.type ?? 'ALERT').toUpperCase()} DETECTED`

  const sublabel = level === 'normal'
    ? 'ALL CLEAR'
    : position.label

  return (
    <motion.div
      className="absolute pointer-events-auto cursor-pointer"
      style={{ top: position.top, left: position.left }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3 }}
      onClick={onSelect}
    >
      <div className="relative">
        {level === 'alert' && (
          <div className={`absolute -inset-10 ${colors.bg}/20 rounded-full ${colors.ping}`} />
        )}
        <div className={`relative bg-[#101c22] border-4 ${colors.border} p-8 rounded-3xl flex flex-col items-center gap-3 min-w-[180px]`}>
          <span className={`material-symbols-outlined ${colors.text} text-6xl`}>{icon}</span>
          <div className="text-center leading-tight font-bold">
            <p className={`${colors.text} text-xl`}>{label}</p>
            <p className="text-slate-300 text-sm">{sublabel}</p>
          </div>
          {/* Direction arrow */}
          <div className="absolute bottom-3 right-3">
            <svg
              width="28"
              height="28"
              viewBox="0 0 28 28"
              style={{ transform: `rotate(${position.directionDeg}deg)` }}
            >
              <path
                d="M14 2 L20 22 L14 17 L8 22 Z"
                fill="currentColor"
                className={colors.text}
                opacity={0.7}
              />
            </svg>
          </div>
        </div>
        <div className={`h-32 w-2 ${colors.bg}/50 absolute top-full left-1/2 -translate-x-1/2`} />
      </div>
    </motion.div>
  )
}

// ── Dummy Data ──
const alerts: Alert[] = [
  {
    id: 'ALT-001',
    title: 'Drone Sighted Sector 4',
    severity: 'critical',
    label: 'CRITICAL',
    score: 92,
    description: '',
    imageUrl: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=400&h=250&fit=crop',
    actionLabel: 'TAKE ACTION',
  },
  {
    id: 'ALT-002',
    title: 'Bird Strike - North',
    severity: 'high',
    label: 'HIGH RISK',
    score: 78,
    description: 'Increased activity detected on North approach Glide Path.',
    actionLabel: 'NOTIFY GROUND CREW',
  },
  {
    id: 'ALT-003',
    title: 'FOD Detected Taxiway B',
    severity: 'info',
    label: 'INFO',
    score: 45,
    description: 'Small metallic debris identified by automated sweeps. Priority: Routine.',
    actionLabel: 'ACKNOWLEDGE',
  },
]

// ── Severity colors ──
const severityColors = {
  critical: { border: 'border-red-500/20', bg: 'bg-red-500/5', text: 'text-red-500', scoreBg: 'bg-red-500/20' },
  high: { border: 'border-amber-500/20', bg: 'bg-amber-500/5', text: 'text-amber-500', scoreBg: 'bg-amber-500/20' },
  info: { border: 'border-slate-700', bg: 'bg-slate-800/20', text: 'text-slate-400', scoreBg: 'bg-slate-700/50' },
}

const statusColors: Record<string, { dot: string; text: string; label: string }> = {
  recording: { dot: 'bg-red-500', text: 'text-red-400', label: 'REC' },
  online: { dot: 'bg-emerald-500', text: 'text-emerald-400', label: 'ONLINE' },
  offline: { dot: 'bg-slate-500', text: 'text-slate-400', label: 'OFFLINE' },
  maintenance: { dot: 'bg-amber-500', text: 'text-amber-400', label: 'MAINT' },
}

// ── Components ──

function Sidebar({ page, onNavigate, alertsOpen, onToggleAlerts }: {
  page: Page
  onNavigate: (p: Page) => void
  alertsOpen: boolean
  onToggleAlerts: () => void
}) {
  const navItems = [
    { icon: Map, label: 'Live Map', id: 'map' as Page },
    { icon: Bell, label: 'Alerts', id: 'alerts' as const },
    { icon: Video, label: 'Cameras', id: 'cameras' as Page },
  ]

  return (
    <aside className="w-64 flex flex-col border-r border-slate-800 bg-[#101c22] shrink-0">
      {/* Logo */}
      <div className="p-6 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <img src={runwayWatcherLogo} alt="RunwayWatcher" className="w-8 h-8" />
          <h1 className="text-xl font-bold tracking-tight">RunwayWatcher</h1>
        </div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-[0.15em]">Mission Control</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-4 space-y-2">
        {navItems.map((item) => {
          const isAlerts = item.id === 'alerts'
          const isActive = isAlerts ? alertsOpen : page === item.id

          return (
            <button
              key={item.label}
              onClick={() => isAlerts ? onToggleAlerts() : onNavigate(item.id as Page)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-[#13a4ec]/10 text-[#13a4ec] border border-[#13a4ec]/20'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 border border-transparent'
              }`}
            >
              <item.icon size={20} />
              <span className="text-sm font-semibold">{item.label}</span>
              {isAlerts && alerts.length > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{alerts.length}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 mt-auto">
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400">STATUS</span>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
          </div>
          <p className="text-xs text-slate-300 font-medium">AI Core: Optimized</p>
          <div className="w-full bg-slate-800 h-1 mt-2 rounded-full overflow-hidden">
            <div className="bg-[#13a4ec] h-full w-[85%]" />
          </div>
        </div>
        <button className="w-full mt-4 flex items-center justify-center gap-2 bg-[#13a4ec] hover:bg-[#13a4ec]/90 text-white py-2.5 rounded-lg text-sm font-bold transition-all shadow-lg shadow-[#13a4ec]/20">
          <Zap size={14} />
          SYSTEM ONLINE
        </button>
      </div>
    </aside>
  )
}

function AlertCard({ alert }: { alert: Alert }) {
  const colors = severityColors[alert.severity]
  return (
    <div className={`p-4 rounded-xl ${colors.bg} ${colors.border} border flex flex-col gap-4`}>
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <span className={`text-[10px] font-bold ${colors.text} uppercase tracking-widest`}>{alert.label}</span>
          <h3 className="text-sm font-bold text-slate-100">{alert.title}</h3>
        </div>
        <div className={`${colors.scoreBg} px-2 py-1 rounded`}>
          <span className={`text-xs font-bold ${colors.text}`}>{alert.score}/100</span>
        </div>
      </div>

      {alert.imageUrl && (
        <div className="aspect-video w-full rounded-lg overflow-hidden border border-slate-700/50 bg-slate-900">
          <img src={alert.imageUrl} alt={alert.title} className="w-full h-full object-cover" />
        </div>
      )}

      {alert.description && !alert.imageUrl && (
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
            <span className={`material-symbols-outlined ${colors.text}`}>
              {alert.severity === 'high' ? 'nest_multi_room' : 'warning'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-tight">{alert.description}</p>
        </div>
      )}

      {alert.description && alert.severity === 'info' && (
        <p className="text-xs text-slate-400 leading-normal">{alert.description}</p>
      )}

      <div className="flex gap-2">
        {alert.severity === 'critical' ? (
          <>
            <button className="flex-1 py-2 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-colors">
              {alert.actionLabel}
            </button>
            <button className="p-2 border border-slate-700 text-slate-400 rounded-lg hover:text-slate-100 transition-colors">
              <Eye size={14} />
            </button>
          </>
        ) : alert.severity === 'high' ? (
          <button className="w-full py-2 bg-slate-800 text-slate-100 text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors">
            {alert.actionLabel}
          </button>
        ) : (
          <button className="w-full py-2 border border-slate-700 text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-800 transition-colors">
            {alert.actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function RightSidebar() {
  return (
    <aside className="w-80 flex flex-col border-l border-slate-800 bg-[#101c22] shrink-0">
      <div className="p-6 border-b border-slate-800 flex justify-between items-center">
        <h2 className="text-sm font-bold text-slate-100 tracking-wider">CRITICAL ALERTS</h2>
        <MoreVertical size={16} className="text-slate-500" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {alerts.map((alert) => (
          <AlertCard key={alert.id} alert={alert} />
        ))}
      </div>

      {/* Footer Stats */}
      <div className="p-4 border-t border-slate-800 bg-[#101c22]/50">
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-800">
            <p className="text-[10px] font-bold text-slate-500 mb-1">SCAN RATE</p>
            <p className="text-lg font-bold text-[#13a4ec]">1.2ms</p>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-800">
            <p className="text-[10px] font-bold text-slate-500 mb-1">OBJECTS</p>
            <p className="text-lg font-bold text-slate-100">142</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

function formatAge(timestamp: string): string {
  const mins = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000)
  if (mins < 1) return '<1m ago'
  return mins === 1 ? '1 min ago' : `${mins} mins ago`
}

function ImageAge({ timestamp }: { timestamp?: string }) {
  const [, setTick] = React.useState(0)

  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  if (!timestamp) return null

  return (
    <div className="absolute bottom-2 right-2 z-10 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold text-slate-300">
      {formatAge(timestamp)}
    </div>
  )
}

function CameraStrip({ cameraFeeds, loading, onSelectCamera }: { cameraFeeds: CameraFeed[]; loading: boolean; onSelectCamera: (cam: CameraFeed) => void }) {
  if (loading) {
    return (
      <div className="h-44 bg-[#101c22] border-t border-slate-800 p-4 flex items-center justify-center shrink-0">
        <p className="text-xs text-slate-500 animate-pulse">Loading camera feeds...</p>
      </div>
    )
  }

  if (cameraFeeds.length === 0) {
    return (
      <div className="h-44 bg-[#101c22] border-t border-slate-800 p-4 flex items-center justify-center shrink-0">
        <p className="text-xs text-slate-500">No camera feeds available</p>
      </div>
    )
  }

  return (
    <div className="h-44 bg-[#101c22] border-t border-slate-800 p-4 flex gap-4 overflow-x-auto shrink-0">
      {cameraFeeds.map((cam) => (
        <div
          key={cam.id}
          className="flex-none w-64 group relative overflow-hidden rounded-lg border border-slate-700 cursor-pointer hover:border-[#13a4ec]/50 transition-colors"
          onClick={() => onSelectCamera(cam)}
        >
          <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white">
            <span className={`w-1.5 h-1.5 rounded-full ${cam.status === 'recording' ? 'bg-red-600' : 'bg-emerald-600'}`} />
            {cam.id} ({cam.name})
          </div>
          <img
            src={cam.imageUrl}
            alt={`${cam.id} - ${cam.name}`}
            className="h-full w-full object-cover transition-transform group-hover:scale-110"
          />
          <ImageAge timestamp={cam.timestamp} />
        </div>
      ))}
    </div>
  )
}
function CameraOverlay({ camera, onClose }: { camera: CameraFeed | null; onClose: () => void }) {
  if (!camera) return null

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <motion.div
        className="relative max-w-4xl w-full mx-8 rounded-xl overflow-hidden border-2 border-slate-700 shadow-2xl"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-bold text-white">{camera.id} — {camera.name}</span>
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 bg-black/70 backdrop-blur-sm rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
        <img
          src={camera.imageUrl}
          alt={`${camera.id} - ${camera.name}`}
          className="w-full aspect-video object-cover"
        />
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <p className="text-xs text-slate-400">{camera.location}</p>
          {camera.timestamp && (
            <p className="text-[10px] text-slate-500 mt-1">{formatAge(camera.timestamp)}</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}


function CamerasPage({ cameraFeeds, loading, onRefresh, onSelectCamera }: { cameraFeeds: CameraFeed[]; loading: boolean; onRefresh: () => void; onSelectCamera: (cam: CameraFeed) => void }) {
  return (
    <div className="flex-1 flex flex-col bg-[#0c1419] overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-800 bg-[#101c22]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100 tracking-wide">CAMERA OVERVIEW</h2>
            <p className="text-xs text-slate-400 mt-1">
              {loading ? 'Loading...' : `${cameraFeeds.length} cameras deployed · ${cameraFeeds.filter(c => c.status === 'recording').length} recording`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onRefresh} className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-[#13a4ec] hover:border-[#13a4ec]/40 transition-colors">
              <RefreshCw size={14} />
            </button>
            {Object.entries(statusColors).map(([key, val]) => {
              const count = cameraFeeds.filter(c => c.status === key).length
              if (count === 0) return null
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${val.dot}`} />
                  <span className={`text-xs font-bold ${val.text}`}>{count} {val.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Camera Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {cameraFeeds.map((cam) => {
            const status = statusColors[cam.status]
            const isDisabled = cam.status === 'offline' || cam.status === 'maintenance'
            return (
              <div
                key={cam.id}
                className={`group relative rounded-xl border overflow-hidden cursor-pointer ${isDisabled ? 'border-slate-700/50 opacity-60' : 'border-slate-700 hover:border-[#13a4ec]/40'} transition-all`}
                onClick={() => !isDisabled && onSelectCamera(cam)}
              >
                {/* Feed */}
                <div className="aspect-video relative bg-slate-900">
                  <img
                    src={cam.imageUrl}
                    alt={`${cam.id} - ${cam.name}`}
                    className={`w-full h-full object-cover ${isDisabled ? 'grayscale opacity-30' : 'group-hover:scale-105'} transition-transform`}
                  />
                  {/* Status badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-lg">
                    <span className={`w-2 h-2 rounded-full ${status.dot} ${cam.status === 'recording' ? 'animate-pulse' : ''}`} />
                    <span className="text-[10px] font-bold text-white">{status.label}</span>
                  </div>
                  {/* Scanline overlay for active feeds */}
                  {!isDisabled && <div className="absolute inset-0 scanline pointer-events-none opacity-50" />}
                  <ImageAge timestamp={cam.timestamp} />
                </div>
                {/* Info */}
                <div className="p-3 bg-[#101c22] border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-100">{cam.id} — {cam.name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{cam.location}</p>
                    </div>
                    <Video size={14} className="text-slate-600" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MapViewport({ cameraAlerts, cameraFeeds, onSelectCamera }: { cameraAlerts: CameraAlert[]; cameraFeeds: CameraFeed[]; onSelectCamera: (cam: CameraFeed) => void }) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = React.useState(false)
  const dragStart = React.useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const [fitted, setFitted] = React.useState(false)

  const MAP_W = 2400
  const MAP_H = 1200
  const MIN_ZOOM = 0.3
  const MAX_ZOOM = 2
  const ZOOM_STEP = 0.05

  // Fit-to-frame logic
  const fitToFrame = React.useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const scaleX = el.clientWidth / MAP_W
    const scaleY = el.clientHeight / MAP_H
    const fitScale = Math.min(scaleX, scaleY)
    setZoom(fitScale)
    setPan({ x: 0, y: 0 })
    setFitted(true)
  }, [])

  // Fit-to-frame on mount and resize
  React.useEffect(() => {
    fitToFrame()
    window.addEventListener('resize', fitToFrame)
    return () => window.removeEventListener('resize', fitToFrame)
  }, [fitToFrame])

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

  // Wheel zoom — zoom toward cursor position
  const handleWheel = React.useCallback((e: WheelEvent) => {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const cx = e.clientX - rect.left - rect.width / 2
    const cy = e.clientY - rect.top - rect.height / 2

    const direction = e.deltaY < 0 ? 1 : -1
    const newZoom = clampZoom(zoom + direction * ZOOM_STEP * zoom)
    const ratio = newZoom / zoom

    setPan(prev => ({
      x: cx - ratio * (cx - prev.x),
      y: cy - ratio * (cy - prev.y),
    }))
    setZoom(newZoom)
  }, [zoom])

  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const zoomTo = (direction: 1 | -1) => {
    const newZoom = clampZoom(zoom + direction * ZOOM_STEP * zoom)
    const ratio = newZoom / zoom
    setPan(prev => ({ x: prev.x * ratio, y: prev.y * ratio }))
    setZoom(newZoom)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    })
  }
  const handleMouseUp = () => setIsDragging(false)

  return (
    <div className="flex-1 relative bg-slate-900 scanline overflow-hidden">
      <div
        ref={containerRef}
        className={`absolute inset-0 overflow-hidden ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: MAP_W,
            height: MAP_H,
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            opacity: fitted ? 1 : 0,
            transition: isDragging ? 'none' : 'opacity 0.3s',
          }}
        >
          <img
            src="/airport-apron.png"
            alt="Airport apron"
            className="absolute inset-0 w-full h-full object-cover opacity-50 grayscale contrast-125"
            draggable={false}
          />

          {/* Camera markers driven by alerts API */}
          {Object.entries(cameraPositions).map(([camId, pos]) => (
            <CameraMapMarker
              key={camId}
              cameraId={camId}
              position={pos}
              cameraAlerts={cameraAlerts}
              onSelect={() => {
                const feed = cameraFeeds.find(c => c.id === camId)
                if (feed) onSelectCamera(feed)
              }}
            />
          ))}
        </div>
      </div>

      {/* Map Controls */}
      <div className="absolute bottom-6 right-6 flex flex-row gap-1 z-10">
        <button
          onClick={() => zoomTo(1)}
          className="bg-[#101c22]/80 backdrop-blur-md border border-slate-700/50 p-2 rounded-l-lg text-slate-300 hover:text-[#13a4ec] transition-colors"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={() => zoomTo(-1)}
          className="bg-[#101c22]/80 backdrop-blur-md border border-slate-700/50 p-2 border-l-0 text-slate-300 hover:text-[#13a4ec] transition-colors"
        >
          <Minus size={18} />
        </button>
        <button
          onClick={fitToFrame}
          className="bg-[#101c22]/80 backdrop-blur-md border border-slate-700/50 p-2 rounded-r-lg border-l-0 text-slate-300 hover:text-[#13a4ec] transition-colors"
        >
          <Locate size={18} />
        </button>
      </div>
    </div>
  )
}

function App() {
  const [page, setPage] = React.useState<Page>('map')
  const [alertsOpen, setAlertsOpen] = React.useState(true)
  const [selectedCamera, setSelectedCamera] = React.useState<CameraFeed | null>(null)
  const { cameras, loading, refresh } = useCameraFeeds()
  const { cameraAlerts } = useCameraAlerts()

  return (
    <div className="flex h-screen w-full">
      <Sidebar
        page={page}
        onNavigate={setPage}
        alertsOpen={alertsOpen}
        onToggleAlerts={() => setAlertsOpen(prev => !prev)}
      />

      {/* Main Content */}
      {page === 'map' ? (
        <main className="flex-1 flex flex-col relative overflow-hidden bg-[#0c1419]">
          <MapViewport cameraAlerts={cameraAlerts} cameraFeeds={cameras} onSelectCamera={setSelectedCamera} />
          <CameraStrip cameraFeeds={cameras} loading={loading} onSelectCamera={setSelectedCamera} />
        </main>
      ) : (
        <CamerasPage cameraFeeds={cameras} loading={loading} onRefresh={refresh} onSelectCamera={setSelectedCamera} />
      )}

      {alertsOpen && <RightSidebar />}

      <CameraOverlay camera={selectedCamera} onClose={() => setSelectedCamera(null)} />
    </div>
  )
}

export default App
