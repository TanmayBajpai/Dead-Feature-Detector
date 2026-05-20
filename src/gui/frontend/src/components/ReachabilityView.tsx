import React from 'react'
import { Stats } from '../api'

interface Props {
  stats: Stats
}

const MECHANISMS = [
  {
    key: 'compile_time',
    label: 'Compile-time',
    color: 'var(--dead-ct)',
    conf: '0.95',
    desc: 'Basic blocks with no CFG predecessors — unreachable under the build’s #define set.',
  },
  {
    key: 'runtime',
    label: 'Runtime flag',
    color: 'var(--dead-rt)',
    conf: '0.85',
    desc: 'Feature-flag predicates proven false (zero-initialized internal globals / LazyValueInfo).',
  },
  {
    key: 'interprocedural',
    label: 'Interprocedural',
    color: 'var(--dead-ip)',
    conf: '0.60',
    desc: 'Functions never reached by whole-program BFS from live roots (main + exported symbols).',
  },
]

export default function ReachabilityView({ stats }: Props) {
  const byKind = stats.by_kind || {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Whole-program reachability</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4, maxWidth: 820 }}>
          Objective 2 — configuration predicates correlated with IR-level reachability. Every dead
          region was found by one of three detection mechanisms in a single whole-program pass.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {MECHANISMS.map(m => (
          <div key={m.key} style={{
            flex: '1 1 260px', minWidth: 260, background: 'var(--surface)',
            border: '1px solid var(--border)', borderLeft: `3px solid ${m.color}`, borderRadius: 8, padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{m.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>conf {m.conf}</span>
              <span style={{ marginLeft: 'auto', fontSize: 24, fontWeight: 700, color: m.color }}>{byKind[m.key] || 0}</span>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12.5, marginTop: 6, lineHeight: 1.45 }}>{m.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
        {stats.total_findings} unreachable region(s) total. Open the <strong>Findings</strong> tab to
        inspect each region and its source.
      </div>
    </div>
  )
}
