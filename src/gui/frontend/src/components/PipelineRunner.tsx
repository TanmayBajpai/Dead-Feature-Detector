import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api'

interface Props {
  onComplete: () => void
  initialBuildDir?: string
  initialSourceRoot?: string
}

const STEPS = [
  'Config extraction',
  'IR analysis',
  'Report generation',
  'Loading results',
]

export default function PipelineRunner({ onComplete, initialBuildDir = '', initialSourceRoot = '' }: Props) {
  const [buildDir, setBuildDir] = useState(initialBuildDir)
  const [sourceRoot, setSourceRoot] = useState(initialSourceRoot)
  const [passPlugin, setPassPlugin] = useState('')
  const [pluginOk, setPluginOk] = useState<boolean | null>(null)

  const [running, setRunning] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [stepLabel, setStepLabel] = useState('')
  const [logLines, setLogLines] = useState<string[]>([])
  const [runError, setRunError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const logRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  // Auto-detect pass plugin on mount.
  useEffect(() => {
    api.detectPlugin().then(r => {
      if (r.exists) { setPassPlugin(r.path); setPluginOk(true) }
      else { setPassPlugin(r.path || ''); setPluginOk(false) }
    }).catch(() => setPluginOk(false))
  }, [])

  // Auto-scroll log.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logLines])

  // Poll status while running.
  useEffect(() => {
    if (!running) return
    const id = setInterval(async () => {
      try {
        const s = await api.runStatus()
        setCurrentStep(s.step)
        setStepLabel(s.step_label)
        if (s.state === 'error') { setRunError(s.error); setRunning(false); clearInterval(id) }
      } catch { /* ignore */ }
    }, 800)
    return () => clearInterval(id)
  }, [running])

  async function handleRun(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setRunError(null)
    setLogLines([])
    setCurrentStep(0)

    try {
      await api.run({
        build_dir: buildDir,
        source_root: sourceRoot,
        pass_plugin: passPlugin || undefined,
      })
    } catch (err: any) {
      setSubmitError(err.message)
      return
    }

    setRunning(true)

    // Open SSE stream.
    if (esRef.current) esRef.current.close()
    const es = new EventSource('/run/log')
    esRef.current = es

    es.onmessage = (ev) => {
      const line: string = ev.data
      if (line === 'DONE') {
        es.close()
        setRunning(false)
        onComplete()
        return
      }
      if (line === 'PIPELINE_DONE') return
      setLogLines(prev => [...prev, line])
    }
    es.onerror = () => {
      es.close()
      setRunning(false)
    }
  }

  const field = (label: string, value: string, setter: (v: string) => void, hint?: React.ReactNode) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <input
        value={value}
        onChange={e => setter(e.target.value)}
        disabled={running}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 13, padding: '6px 10px', width: '100%' }}
      />
      {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</span>}
    </label>
  )

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: form */}
      <div style={{
        width: 420, flexShrink: 0, padding: '28px 24px',
        borderRight: '1px solid var(--border)', overflow: 'auto',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>New Analysis</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Point the tool at your project's build directory and click Run. The full pipeline runs automatically.
          </div>
        </div>

        <form onSubmit={handleRun} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {field(
            'Build directory',
            buildDir,
            setBuildDir,
            'Path to the CMake build dir (must have compile_commands.json or CMake File API data)',
          )}
          {field(
            'Source root',
            sourceRoot,
            setSourceRoot,
            'Root of the source tree (used for the source viewer)',
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pass plugin
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={passPlugin}
                onChange={e => { setPassPlugin(e.target.value); setPluginOk(null) }}
                disabled={running}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 13, padding: '6px 10px', flex: 1 }}
              />
              {pluginOk === true && <span style={{ color: 'var(--alive)', fontSize: 18 }} title="Plugin found">✓</span>}
              {pluginOk === false && <span style={{ color: 'var(--dead-ct)', fontSize: 18 }} title="Plugin not found">✗</span>}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Auto-detected from <code>build/src/ir_analyzer/DeadFeaturePass.so</code>.
              Build with <code>cmake --build build</code> if missing.
            </span>
          </label>

          {submitError && (
            <div style={{ background: '#7f1d1d', border: '1px solid var(--dead-ct)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--dead-ct)' }}>
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={running || !buildDir || !sourceRoot}
            style={{
              padding: '10px 0', fontSize: 14, fontWeight: 600,
              background: running ? 'var(--surface2)' : 'var(--accent)',
              color: running ? 'var(--text-muted)' : '#fff',
              borderRadius: 6, border: 'none', cursor: running ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {running ? 'Running…' : 'Run Analysis'}
          </button>
        </form>
      </div>

      {/* Right: progress + log */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Step indicators */}
        <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STEPS.map((label, i) => {
            const stepNum = i + 1
            const done = currentStep > stepNum || (currentStep === stepNum && !running && !runError)
            const active = currentStep === stepNum && running
            const pending = currentStep < stepNum
            return (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 12px', borderRadius: 99,
                background: done ? 'rgba(74,222,128,0.12)' : active ? 'rgba(108,138,255,0.15)' : 'var(--surface2)',
                border: `1px solid ${done ? 'var(--alive)' : active ? 'var(--accent)' : 'var(--border)'}`,
                fontSize: 12,
                color: done ? 'var(--alive)' : active ? 'var(--accent)' : 'var(--text-muted)',
              }}>
                <span>{done ? '✓' : active ? '●' : `${stepNum}`}</span>
                <span>{label}</span>
              </div>
            )
          })}
          {runError && (
            <div style={{ color: 'var(--dead-ct)', fontSize: 13, alignSelf: 'center', marginLeft: 8 }}>
              Error: {runError}
            </div>
          )}
          {!running && currentStep === 0 && logLines.length === 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: 13, alignSelf: 'center' }}>
              Fill the form and click Run Analysis to start.
            </span>
          )}
        </div>

        {/* Log output */}
        <div
          ref={logRef}
          style={{
            flex: 1, overflow: 'auto', padding: '12px 20px',
            fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7,
            background: 'var(--bg)',
          }}
        >
          {logLines.length === 0 && !running && (
            <span style={{ color: 'var(--text-muted)' }}>Log output will appear here…</span>
          )}
          {logLines.map((line, i) => (
            <div key={i} style={{
              color: line.startsWith('ERROR') ? 'var(--dead-ct)'
                   : line.startsWith('[') ? 'var(--accent)'
                   : line.startsWith('    →') ? 'var(--alive)'
                   : 'var(--text-muted)',
            }}>
              {line}
            </div>
          ))}
          {running && (
            <div style={{ color: 'var(--accent)', marginTop: 4 }}>
              {stepLabel || 'Running…'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
