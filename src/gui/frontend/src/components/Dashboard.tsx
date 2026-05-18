import React, { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { Stats, Finding } from '../api'

interface Props {
  stats: Stats
  findings: Finding[]
  onSelect: (f: Finding) => void
}

const KIND_COLOR: Record<string, string> = {
  compile_time: '#f87171',
  runtime: '#fb923c',
  interprocedural: '#facc15',
}

function ConfidenceHistogram({ data }: { data: Stats['confidence_histogram'] }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const W = 360, H = 140, pad = { top: 10, right: 10, bottom: 30, left: 36 }
    const w = W - pad.left - pad.right
    const h = H - pad.top - pad.bottom
    const g = svg.append('g').attr('transform', `translate(${pad.left},${pad.top})`)
    const x = d3.scaleBand().domain(data.map(d => d.range)).range([0, w]).padding(0.15)
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count) || 1]).range([h, 0])
    g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(x).tickSize(0))
      .select('.domain').remove()
    g.append('g').call(d3.axisLeft(y).ticks(4)).select('.domain').remove()
    g.selectAll('.bar').data(data).join('rect').attr('class', 'bar')
      .attr('x', d => x(d.range)!).attr('y', d => y(d.count))
      .attr('width', x.bandwidth()).attr('height', d => h - y(d.count))
      .attr('fill', '#6c8aff').attr('rx', 2)
    svg.selectAll('text').attr('fill', '#8892a4').attr('font-size', 11)
  }, [data])
  return <svg ref={ref} width={360} height={140} />
}

export default function Dashboard({ stats, findings, onSelect }: Props) {
  const topFindings = [...findings].slice(0, 5)

  const card = (label: string, value: string | number) => (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '16px 20px', minWidth: 160,
    }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {card('Findings', stats.total_findings)}
        {card('Dead lines', stats.total_dead_lines.toLocaleString())}
        {card('Avg confidence', stats.avg_confidence.toFixed(2))}
        {Object.entries(stats.by_kind).map(([k, v]) =>
          card(k.replace('_', ' '), v)
        )}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* Histogram */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>CONFIDENCE DISTRIBUTION</div>
          <ConfidenceHistogram data={stats.confidence_histogram} />
        </div>

        {/* Top findings */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, flex: 1, minWidth: 300 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>TOP FINDINGS BY CONFIDENCE</div>
          <table>
            <tbody>
              {topFindings.map(f => (
                <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(f)}>
                  <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{f.confidence.toFixed(2)}</span></td>
                  <td>
                    <span className={`tag tag-${f.kind}`}>{f.kind.replace('_', ' ')}</span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>
                    {f.feature_name}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {f.estimated_lines} lines
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
