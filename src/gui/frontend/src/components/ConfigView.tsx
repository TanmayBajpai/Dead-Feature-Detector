import React, { useState } from 'react'
import { ConfigData } from '../api'

interface Props {
  config: ConfigData | null
}

function DefineChip({ text }: { text: string }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: '2px 8px', borderRadius: 6,
      background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--accent2)',
      whiteSpace: 'nowrap',
    }}>{text}</span>
  )
}

export default function ConfigView({ config }: Props) {
  const [expanded, setExpanded] = useState<number | null>(0)

  if (!config || !config.has_config) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)' }}>
        No build configuration was captured for this run. The extractor reads CMake File API
        data or <code>compile_commands.json</code> from the build directory.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Build configurations</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
          Objective 1 — the <code>#define</code> combinations extracted from CMake / Makefile that the
          reachability analysis is correlated against.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Card label="Build targets" value={config.target_count} />
        <Card label="Global #defines" value={config.global_definitions.length} />
        <Card label="Unique source files"
          value={new Set(config.targets.flatMap(t => t.source_files)).size} />
      </div>

      {config.global_definitions.length > 0 && (
        <Section title="Global definitions">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {config.global_definitions.map((d, i) => <DefineChip key={i} text={d} />)}
          </div>
        </Section>
      )}

      <Section title={`Per-target definitions (${config.target_count})`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {config.targets.map((t, i) => {
            const open = expanded === i
            return (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <button
                  onClick={() => setExpanded(open ? null : i)}
                  style={{
                    width: '100%', textAlign: 'left', background: 'var(--surface2)', color: 'var(--text)',
                    padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 0,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.name}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.define_count} defines</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.source_count} files</span>
                </button>
                {open && (
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {t.compile_definitions.length === 0
                        ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No target-specific defines.</span>
                        : t.compile_definitions.map((d, j) => <DefineChip key={j} text={d} />)}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
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
