import React from 'react'
import { EvalData } from '../api'

interface Props {
  evalData: EvalData | null
}

function statusTag(status: string) {
  const pass = status === 'pass'
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      background: pass ? 'rgba(74,222,128,0.14)' : 'var(--surface2)',
      color: pass ? 'var(--alive)' : 'var(--text-muted)',
      border: `1px solid ${pass ? 'var(--alive)' : 'var(--border)'}`,
    }}>{pass ? '✓ pass' : status}</span>
  )
}

export default function EvaluationView({ evalData }: Props) {
  if (!evalData || !evalData.has_eval) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No evaluation summary found (eval/eval_summary.json).</div>
  }

  const agg = evalData.aggregate
  const ls = evalData.large_scale || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Evaluation</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
          Objective 4 — {evalData.about}
        </div>
      </div>

      {agg && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Card label="Test cases" value={agg.suite_size} />
          <Card label="Status" value={agg.all_passing ? 'all passing' : 'mixed'} />
          <Card label="Findings (suite)" value={agg.total_findings} />
          <Card label="Documented dead lines" value={agg.documented_dead_lines.toLocaleString()} />
        </div>
      )}

      <Section title="Minimal test cases">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Focus</th><th>Findings</th><th>Confidence</th><th>Status</th><th>Note</th></tr>
          </thead>
          <tbody>
            {evalData.test_cases.map(tc => (
              <tr key={tc.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{tc.id}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{tc.name}</td>
                <td><span className={`tag tag-${tc.focus}`} style={tc.focus === 'negative' ? { background: 'var(--surface2)', color: 'var(--text-muted)' } : undefined}>{tc.focus}</span></td>
                <td>{tc.expected_findings}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{tc.expected_confidence > 0 ? tc.expected_confidence.toFixed(2) : '—'}</td>
                <td>{statusTag(tc.status)}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{tc.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Integration programs">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Files</th><th>Findings</th><th>Dead lines</th><th>compile · runtime · interproc</th><th>Status</th></tr>
          </thead>
          <tbody>
            {evalData.integration.map(it => (
              <tr key={it.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{it.id}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{it.name}</td>
                <td>{it.files}</td>
                <td>{it.findings}</td>
                <td>{it.dead_lines}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                  {it.kinds.compile_time} · {it.kinds.runtime} · {it.kinds.interprocedural}
                </td>
                <td>{statusTag(it.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Large-scale target">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{ls.target}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
              background: 'rgba(251,146,60,0.14)', color: 'var(--dead-rt)', border: '1px solid var(--dead-rt)',
            }}>{ls.status}</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{ls.reason}</div>
          <div style={{ fontSize: 12.5 }}>
            <span style={{ color: 'var(--text-muted)' }}>Build: </span>
            <code>{ls.build_script}</code>
            <span style={{ color: 'var(--text-muted)', marginLeft: 12 }}>Run: </span>
            <code>{ls.run_script}</code>
          </div>
          {ls.fallback_targets && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Fallback targets: {ls.fallback_targets.join(', ')}
            </div>
          )}
          {ls.expected_categories && (
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>Expected dead-feature categories:</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)' }}>
                {ls.expected_categories.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', minWidth: 160 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      {children}
    </div>
  )
}
