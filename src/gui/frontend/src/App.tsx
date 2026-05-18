import React, { useState, useEffect, useCallback } from 'react'
import { api, Finding, Stats } from './api'
import Dashboard from './components/Dashboard'
import FindingTable from './components/FindingTable'
import SourceViewer from './components/SourceViewer'
import CallGraphPanel from './components/CallGraphPanel'
import PipelineRunner from './components/PipelineRunner'

type Tab = 'setup' | 'dashboard' | 'findings' | 'graph'

function useSearchParam(key: string, fallback: string): [string, (v: string) => void] {
  const read = () => new URLSearchParams(window.location.search).get(key) ?? fallback
  const [value, setValue] = useState(read)
  const set = useCallback((v: string) => {
    const sp = new URLSearchParams(window.location.search)
    if (v === fallback) sp.delete(key)
    else sp.set(key, v)
    const next = sp.toString()
    window.history.replaceState(null, '', next ? `?${next}` : window.location.pathname)
    setValue(v)
  }, [key, fallback])
  return [value, set]
}

export default function App() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])
  const [selected, setSelected] = useState<Finding | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTabRaw] = useSearchParam('tab', 'setup')
  const setTab = (t: Tab) => setTabRaw(t)

  // Last run params for "Run Again".
  const [lastBuildDir, setLastBuildDir] = useState('')
  const [lastSourceRoot, setLastSourceRoot] = useState('')

  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('dfd-theme') !== 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('dfd-theme', dark ? 'dark' : 'light')
  }, [dark])

  const loadData = useCallback(() => {
    Promise.all([api.stats(), api.findings()])
      .then(([s, f]) => {
        setStats(s)
        setFindings(f)
        // If server already has a report loaded, go straight to dashboard.
        if (s.has_report && tab === 'setup') setTab('dashboard')
      })
      .catch(() => {/* stay on setup */})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [])

  const handleRunComplete = useCallback(() => {
    loadData()
    setSelected(null)
    setTab('dashboard')
  }, [loadData])

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '8px 18px',
    background: tab === t ? 'var(--accent)' : 'var(--surface2)',
    color: tab === t ? '#fff' : 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: '6px 6px 0 0',
    cursor: 'pointer',
    fontWeight: tab === t ? 600 : 400,
    fontSize: 13,
  })

  const hasResults = stats?.has_report ?? false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <header style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent)' }}>
          Dead Feature Detector
        </span>
        {hasResults && stats && (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {stats.total_findings} findings · {stats.total_dead_lines.toLocaleString()} dead lines
          </span>
        )}
        <span style={{ flex: 1 }} />
        {hasResults && tab !== 'setup' && (
          <button
            onClick={() => setTab('setup')}
            style={{
              background: 'var(--surface2)', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '4px 12px', fontSize: 13, cursor: 'pointer',
            }}
          >
            ↺ Run Again
          </button>
        )}
        <button
          onClick={() => setDark(d => !d)}
          style={{
            background: 'var(--surface2)', color: 'var(--text-muted)',
            border: '1px solid var(--border)', borderRadius: 6,
            padding: '4px 10px', fontSize: 13, cursor: 'pointer',
          }}
          title="Toggle dark/light mode"
        >
          {dark ? '☀ Light' : '☾ Dark'}
        </button>
      </header>

      {/* Tabs — hide results tabs until we have a report */}
      <div style={{ display: 'flex', gap: 2, padding: '8px 24px 0', background: 'var(--bg)' }}>
        <button style={tabStyle('setup')} onClick={() => setTab('setup')}>
          {hasResults ? '↺ Setup' : '⚙ Setup'}
        </button>
        {hasResults && (
          <>
            <button style={tabStyle('dashboard')} onClick={() => setTab('dashboard')}>Dashboard</button>
            <button style={tabStyle('findings')} onClick={() => setTab('findings')}>Findings</button>
            <button style={tabStyle('graph')} onClick={() => setTab('graph')}>Graph</button>
          </>
        )}
      </div>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {tab === 'setup' && (
          <PipelineRunner
            onComplete={handleRunComplete}
            initialBuildDir={lastBuildDir}
            initialSourceRoot={lastSourceRoot}
          />
        )}
        {tab === 'dashboard' && hasResults && stats && (
          <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
            <Dashboard
              stats={stats}
              findings={findings}
              onSelect={f => { setSelected(f); setTab('findings') }}
            />
          </div>
        )}
        {tab === 'findings' && hasResults && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <div style={{ width: selected ? '50%' : '100%', overflow: 'auto', borderRight: '1px solid var(--border)' }}>
              <FindingTable findings={findings} selected={selected} onSelect={setSelected} />
            </div>
            {selected && (
              <div style={{ flex: 1, overflow: 'auto' }}>
                <SourceViewer finding={selected} onClose={() => setSelected(null)} />
              </div>
            )}
          </div>
        )}
        {tab === 'graph' && hasResults && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CallGraphPanel onSelectNode={name => {
              const f = findings.find(x => x.function === name)
              if (f) { setSelected(f); setTab('findings') }
            }} />
          </div>
        )}
      </main>
    </div>
  )
}
