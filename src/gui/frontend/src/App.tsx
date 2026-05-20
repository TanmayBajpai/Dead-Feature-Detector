import React, { useState, useEffect, useCallback } from 'react'
import { api, Finding, Stats, ConfigData, EvalData } from './api'
import Dashboard from './components/Dashboard'
import FindingTable from './components/FindingTable'
import SourceViewer from './components/SourceViewer'
import PipelineRunner from './components/PipelineRunner'
import ObjectivesOverview from './components/ObjectivesOverview'
import ConfigView from './components/ConfigView'
import ReachabilityView from './components/ReachabilityView'
import EvaluationView from './components/EvaluationView'

type Tab = 'objectives' | 'setup' | 'configs' | 'reachability' | 'findings' | 'evaluation' | 'impact'

const RESULT_TABS: { id: Tab; label: string }[] = [
  { id: 'objectives', label: 'Objectives' },
  { id: 'configs', label: 'Configurations' },
  { id: 'reachability', label: 'Reachability' },
  { id: 'findings', label: 'Findings' },
  { id: 'evaluation', label: 'Evaluation' },
  { id: 'impact', label: 'Impact' },
]

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
  const [config, setConfig] = useState<ConfigData | null>(null)
  const [evalData, setEvalData] = useState<EvalData | null>(null)
  const [selected, setSelected] = useState<Finding | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTabRaw] = useSearchParam('tab', 'objectives')
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
    Promise.all([api.stats(), api.findings(), api.config().catch(() => null), api.eval().catch(() => null)])
      .then(([s, f, c, e]) => {
        setStats(s)
        setFindings(f)
        setConfig(c)
        setEvalData(e)
        // If no report yet, fall back to setup.
        if (!s.has_report) setTab('setup')
      })
      .catch(() => {/* stay on setup */})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [])

  const handleRunComplete = useCallback(() => {
    loadData()
    setSelected(null)
    setTab('objectives')
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
  const scrollPane: React.CSSProperties = { flex: 1, overflow: 'auto', padding: 24 }

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
      <div style={{ display: 'flex', gap: 2, padding: '8px 24px 0', background: 'var(--bg)', flexWrap: 'wrap' }}>
        <button style={tabStyle('setup')} onClick={() => setTab('setup')}>
          {hasResults ? '↺ Setup' : '⚙ Setup'}
        </button>
        {hasResults && RESULT_TABS.map(t => (
          <button key={t.id} style={tabStyle(t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
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
        {tab === 'objectives' && hasResults && stats && (
          <div style={scrollPane}>
            <ObjectivesOverview stats={stats} config={config} evalData={evalData} onNavigate={setTab} />
          </div>
        )}
        {tab === 'configs' && hasResults && (
          <div style={scrollPane}>
            <ConfigView config={config} />
          </div>
        )}
        {tab === 'reachability' && hasResults && stats && (
          <div style={scrollPane}>
            <ReachabilityView stats={stats} />
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
        {tab === 'evaluation' && hasResults && (
          <div style={scrollPane}>
            <EvaluationView evalData={evalData} />
          </div>
        )}
        {tab === 'impact' && hasResults && stats && (
          <div style={scrollPane}>
            <Dashboard
              stats={stats}
              findings={findings}
              onSelect={f => { setSelected(f); setTab('findings') }}
            />
          </div>
        )}
      </main>
    </div>
  )
}
