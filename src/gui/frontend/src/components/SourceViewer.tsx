import React, { useEffect, useState } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import { api, Finding, SourceResult } from '../api'

interface Props {
  finding: Finding
  onClose: () => void
}

export default function SourceViewer({ finding, onClose }: Props) {
  const [src, setSrc] = useState<SourceResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSrc(null); setError(null)
    if (!finding.source_file) return
    api.source(finding.source_file, finding.start_line, finding.end_line)
      .then(setSrc)
      .catch(e => setError(String(e)))
  }, [finding.id])

  const isCpp = finding.source_file.match(/\.(cpp|cxx|cc|hpp)$/i)
  const grammar = isCpp ? Prism.languages.cpp : Prism.languages.c
  const lang = isCpp ? 'cpp' : 'c'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {finding.source_file}:{finding.start_line}–{finding.end_line}
        </span>
        <span className={`tag tag-${finding.kind}`}>{finding.kind.replace(/_/g, ' ')}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{finding.confidence.toFixed(2)}</span>
        <button onClick={onClose} style={{ background: 'var(--surface2)', color: 'var(--text)', padding: '2px 10px' }}>✕</button>
      </div>

      {/* Code */}
      <div style={{ flex: 1, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6 }}>
        {error && <div style={{ padding: 16, color: 'var(--dead-ct)' }}>{error}</div>}
        {!src && !error && <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading…</div>}
        {src && src.lines.map((line, i) => {
          const lineNum = src.returned_start + i
          const isDead = lineNum >= finding.start_line && lineNum <= finding.end_line
          const highlighted = Prism.highlight(line, grammar, lang)
          return (
            <div key={lineNum} style={{
              display: 'flex',
              background: isDead ? 'rgba(248,113,113,0.12)' : 'transparent',
              borderLeft: isDead ? '3px solid var(--dead-ct)' : '3px solid transparent',
            }}>
              <span style={{
                width: 48, textAlign: 'right', paddingRight: 12, color: isDead ? 'var(--dead-ct)' : 'var(--text-muted)',
                userSelect: 'none', flexShrink: 0,
              }}>
                {lineNum}
              </span>
              <span
                dangerouslySetInnerHTML={{ __html: highlighted || '&nbsp;' }}
                style={{ whiteSpace: 'pre', flex: 1, paddingRight: 16 }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
