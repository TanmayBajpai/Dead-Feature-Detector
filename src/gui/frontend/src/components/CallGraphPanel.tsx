import React, { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { api, GraphData } from '../api'

interface Props {
  onSelectNode: (name: string) => void
}

const KIND_COLOR: Record<string, string> = {
  compile_time: '#f87171',
  runtime: '#fb923c',
  interprocedural: '#facc15',
}

export default function CallGraphPanel({ onSelectNode }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [limit, setLimit] = useState(100)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.graph(limit).then(setGraph).catch(e => setError(String(e)))
  }, [limit])

  useEffect(() => {
    if (!graph || !svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const rect = svgRef.current.getBoundingClientRect()
    const W = rect.width || 800
    const H = rect.height || 600

    svg.attr('viewBox', `0 0 ${W} ${H}`)

    const nodes = graph.nodes.map(n => ({ ...n }))
    const edges = graph.edges.map(e => ({ ...e }))

    const sim = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(edges).id((d: any) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(W / 2, H / 2))

    const link = svg.append('g').selectAll('line').data(edges).join('line')
      .attr('stroke', '#2e3150').attr('stroke-width', 1.5)

    const node = svg.append('g').selectAll('g').data(nodes).join('g')
      .style('cursor', 'pointer')
      .call(d3.drag<any, any>()
        .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y })
        .on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )
      .on('click', (_ev, d: any) => onSelectNode(d.id))

    node.append('circle')
      .attr('r', (d: any) => 6 + d.confidence * 8)
      .attr('fill', (d: any) => KIND_COLOR[d.kind] || '#6c8aff')
      .attr('fill-opacity', 0.85)
      .attr('stroke', '#1a1d27')
      .attr('stroke-width', 1.5)

    node.append('title').text((d: any) => `${d.id}\n${d.kind} (${d.confidence.toFixed(2)})`)

    node.append('text')
      .attr('dy', (d: any) => -(6 + d.confidence * 8 + 3))
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', '#8892a4')
      .text((d: any) => d.id.length > 24 ? d.id.slice(0, 22) + '…' : d.id)

    sim.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y)
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    return () => { sim.stop() }
  }, [graph])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Node limit:&nbsp;
          <select value={limit} onChange={e => setLimit(Number(e.target.value))}>
            {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {graph && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{graph.nodes.length} nodes · click to inspect</span>}
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
          {Object.entries(KIND_COLOR).map(([k, c]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c }} />
              {k.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>
      {error && <div style={{ padding: 16, color: 'var(--dead-ct)' }}>{error}</div>}
      <svg ref={svgRef} style={{ flex: 1, width: '100%' }} />
    </div>
  )
}
