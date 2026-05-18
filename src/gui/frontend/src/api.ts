export interface Finding {
  id: number
  feature_name: string
  kind: 'compile_time' | 'runtime' | 'interprocedural' | string
  confidence: number
  function: string
  basic_block: string
  source_file: string
  start_line: number
  end_line: number
  estimated_lines: number
  dead_in_targets: string[]
}

export interface Stats {
  total_findings: number
  total_dead_lines: number
  avg_confidence: number
  by_kind: Record<string, number>
  confidence_histogram: { range: string; count: number }[]
  has_report: boolean
}

export interface SourceResult {
  file: string
  total_lines: number
  returned_start: number
  returned_end: number
  lines: string[]
}

export interface GraphData {
  nodes: { id: string; confidence: number; kind: string; source_file: string; start_line: number }[]
  edges: { source: string; target: string }[]
}

export interface RunStatus {
  state: 'idle' | 'running' | 'done' | 'error'
  step: number
  step_label: string
  total_steps: number
  log_lines: number
  error: string | null
}

const BASE = ''

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(detail.detail ?? res.statusText)
  }
  return res.json()
}

export const api = {
  findings: (params?: { kind?: string; min_confidence?: number; file?: string }) => {
    const q = new URLSearchParams()
    if (params?.kind) q.set('kind', params.kind)
    if (params?.min_confidence != null) q.set('min_confidence', String(params.min_confidence))
    if (params?.file) q.set('file', params.file)
    return get<Finding[]>(`/findings?${q}`)
  },

  finding: (id: number) => get<Finding>(`/findings/${id}`),

  source: (file: string, start: number, end: number, context = 20) =>
    get<SourceResult>(`/source?file=${encodeURIComponent(file)}&start=${start}&end=${end}&context=${context}`),

  graph: (limit = 100) => get<GraphData>(`/graph?limit=${limit}`),

  stats: () => get<Stats>('/stats'),

  run: (params: {
    build_dir: string
    source_root: string
    bitcode_files?: string[]
    pass_plugin?: string
    out_dir?: string
  }) => post<{ status: string }>('/run', params),

  runStatus: () => get<RunStatus>('/run/status'),

  detectBc: (build_dir: string) =>
    get<{ files: string[]; count: number }>(`/run/detect-bc?build_dir=${encodeURIComponent(build_dir)}`),

  detectPlugin: () => get<{ path: string; exists: boolean }>('/run/detect-plugin'),
}
