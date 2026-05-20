import React from 'react'
import { Stats, ConfigData, EvalData } from '../api'
import { formatBytes } from '../format'

export type ObjectiveTab = 'configs' | 'reachability' | 'findings' | 'evaluation' | 'impact'

interface Props {
  stats: Stats
  config: ConfigData | null
  evalData: EvalData | null
  onNavigate: (tab: ObjectiveTab) => void
}

interface ObjectiveCard {
  num: number
  title: string
  deliverable: string
  tab: ObjectiveTab
  outcome: string[]
  met: boolean
}

export default function ObjectivesOverview({ stats, config, evalData, onNavigate }: Props) {
  const byKind = stats.by_kind || {}
  const ct = byKind.compile_time || 0
  const rt = byKind.runtime || 0
  const ip = byKind.interprocedural || 0

  const sizeOutcome = stats.binary_size_measured
    ? `${formatBytes(stats.removable_bytes)} removable (measured via llvm-nm)`
    : 'binary size not measured — re-run pipeline to measure'

  const llvm = evalData?.large_scale?.status ?? 'not run'

  const cards: ObjectiveCard[] = [
    {
      num: 1,
      title: 'Build configuration extractor',
      deliverable: 'Parse CMake / Makefile for the actual #define combinations used across real build targets.',
      tab: 'configs',
      outcome: [
        `${config?.target_count ?? 0} build target(s)`,
        `${config?.global_definitions?.length ?? 0} #define(s) enumerated`,
      ],
      met: !!config?.has_config,
    },
    {
      num: 2,
      title: 'Whole-program reachability analysis',
      deliverable: 'Correlate configuration predicates with IR-level reachability across the whole program.',
      tab: 'reachability',
      outcome: [
        `${stats.total_findings} unreachable region(s)`,
        `${ct} compile-time · ${rt} runtime · ${ip} interprocedural`,
      ],
      met: stats.total_findings > 0,
    },
    {
      num: 3,
      title: 'Dead-feature report',
      deliverable: 'Report dead features with confidence scores and affected source regions.',
      tab: 'findings',
      outcome: [
        `${stats.total_findings} finding(s)`,
        `avg confidence ${stats.avg_confidence?.toFixed(2) ?? '0.00'}`,
      ],
      met: stats.total_findings > 0,
    },
    {
      num: 4,
      title: 'Evaluation on LLVM / large OSS',
      deliverable: 'Evaluate the pipeline on LLVM itself (or another large open-source project).',
      tab: 'evaluation',
      outcome: [
        `${evalData?.aggregate?.suite_size ?? 0} test case(s), ${evalData?.aggregate?.all_passing ? 'all passing' : 'see results'}`,
        `LLVM target: ${llvm}`,
      ],
      met: !!evalData?.has_eval,
    },
    {
      num: 5,
      title: 'Removable code volume',
      deliverable: 'Estimate removable code volume — lines and binary size savings.',
      tab: 'impact',
      outcome: [
        `${stats.total_dead_lines.toLocaleString()} dead line(s)`,
        sizeOutcome,
      ],
      met: stats.total_dead_lines > 0,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Objectives</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
          Each problem-statement deliverable maps to a component below. Click a card to open its view.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {cards.map(c => (
          <button
            key={c.num}
            onClick={() => onNavigate(c.tab)}
            style={{
              textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 18, cursor: 'pointer', color: 'var(--text)',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0,
              }}>{c.num}</span>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{c.title}</span>
              <span style={{ marginLeft: 'auto' }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                  background: c.met ? 'rgba(74,222,128,0.14)' : 'var(--surface2)',
                  color: c.met ? 'var(--alive)' : 'var(--text-muted)',
                  border: `1px solid ${c.met ? 'var(--alive)' : 'var(--border)'}`,
                }}>{c.met ? '✓ met' : 'pending'}</span>
              </span>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.5 }}>{c.deliverable}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 'auto' }}>
              {c.outcome.map((o, i) => (
                <div key={i} style={{ fontSize: 13, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                  {o}
                </div>
              ))}
            </div>
            <div style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>View →</div>
          </button>
        ))}
      </div>
    </div>
  )
}
