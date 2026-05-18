import React, { useState, useMemo, useCallback } from 'react'
import { Finding } from '../api'

interface Props {
  findings: Finding[]
  selected: Finding | null
  onSelect: (f: Finding) => void
}

type SortKey = 'confidence' | 'kind' | 'feature_name' | 'estimated_lines'

function useUrlParam(key: string, fallback: string): [string, (v: string) => void] {
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

export default function FindingTable({ findings, selected, onSelect }: Props) {
  const [sortKey, setSortKey] = useUrlParam('sort', 'confidence') as [SortKey, (v: string) => void]
  const [sortAsc, setSortAscRaw] = useState(() => (new URLSearchParams(window.location.search).get('asc') ?? '') === '1')
  const setSortAsc = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(sortAsc) : v
    const sp = new URLSearchParams(window.location.search)
    next ? sp.set('asc', '1') : sp.delete('asc')
    window.history.replaceState(null, '', sp.toString() ? `?${sp}` : window.location.pathname)
    setSortAscRaw(next)
  }
  const [filterKind, setFilterKind] = useUrlParam('kind', '')
  const [filterFile, setFilterFile] = useUrlParam('file', '')
  const [minConf, setMinConfRaw] = useState(() => Number(new URLSearchParams(window.location.search).get('conf') ?? '0'))
  const setMinConf = (v: number) => {
    const sp = new URLSearchParams(window.location.search)
    v > 0 ? sp.set('conf', String(v)) : sp.delete('conf')
    window.history.replaceState(null, '', sp.toString() ? `?${sp}` : window.location.pathname)
    setMinConfRaw(v)
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const filtered = useMemo(() => {
    return findings
      .filter(f => !filterKind || f.kind === filterKind)
      .filter(f => !filterFile || f.source_file.includes(filterFile))
      .filter(f => f.confidence >= minConf)
      .sort((a, b) => {
        const av = a[sortKey as keyof Finding] as string | number
        const bv = b[sortKey as keyof Finding] as string | number
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return sortAsc ? cmp : -cmp
      })
  }, [findings, sortKey, sortAsc, filterKind, filterFile, minConf])

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(k)}>
      {label} {sortKey === k ? (sortAsc ? '▲' : '▼') : ''}
    </th>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', background: 'var(--surface)' }}>
        <select value={filterKind} onChange={e => setFilterKind(e.target.value)}>
          <option value=''>All kinds</option>
          <option value='compile_time'>compile_time</option>
          <option value='runtime'>runtime</option>
          <option value='interprocedural'>interprocedural</option>
        </select>
        <input placeholder='Filter by file…' value={filterFile} onChange={e => setFilterFile(e.target.value)} style={{ width: 200 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13 }}>
          Min conf:
          <input type='number' min={0} max={1} step={0.05} value={minConf}
            onChange={e => setMinConf(Number(e.target.value))} style={{ width: 60 }} />
        </label>
        <span style={{ color: 'var(--text-muted)', fontSize: 12, alignSelf: 'center' }}>
          {filtered.length} / {findings.length}
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <SortHeader label='Conf' k='confidence' />
              <SortHeader label='Kind' k='kind' />
              <SortHeader label='Feature' k='feature_name' />
              <th>File</th>
              <SortHeader label='Lines' k='estimated_lines' />
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr key={f.id}
                onClick={() => onSelect(f)}
                style={{ cursor: 'pointer', background: selected?.id === f.id ? 'var(--surface2)' : undefined }}
              >
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  <ConfBar value={f.confidence} />
                  {f.confidence.toFixed(2)}
                </td>
                <td><span className={`tag tag-${f.kind}`}>{f.kind.replace(/_/g, ' ')}</span></td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{f.feature_name}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.source_file}:{f.start_line}
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{f.estimated_lines}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>No findings match current filters.</div>
        )}
      </div>
    </div>
  )
}

function ConfBar({ value }: { value: number }) {
  const color = value >= 0.8 ? 'var(--dead-ct)' : value >= 0.6 ? 'var(--dead-rt)' : 'var(--dead-ip)'
  return (
    <span style={{
      display: 'inline-block', width: 40, height: 6, background: 'var(--border)',
      borderRadius: 3, marginRight: 6, verticalAlign: 'middle', position: 'relative', overflow: 'hidden',
    }}>
      <span style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${value * 100}%`, background: color, borderRadius: 3 }} />
    </span>
  )
}
