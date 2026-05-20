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
  estimated_bytes?: number
  dead_in_targets: string[]
}

export interface Stats {
  total_findings: number
  total_dead_lines: number
  avg_confidence: number
  by_kind: Record<string, number>
  confidence_histogram: { range: string; count: number }[]
  has_report: boolean
  removable_bytes?: number
  binary_size_measured?: boolean
  binary_size_method?: string
}

export interface ConfigTarget {
  name: string
  compile_definitions: string[]
  source_files: string[]
  define_count: number
  source_count: number
}

export interface ConfigData {
  has_config: boolean
  global_definitions: string[]
  target_count: number
  targets: ConfigTarget[]
}

export interface EvalTestCase {
  id: string
  name: string
  path: string
  focus: string
  expected_findings: number
  expected_confidence: number
  status: string
  note: string
}

export interface EvalIntegration {
  id: string
  name: string
  path: string
  files: number
  findings: number
  dead_lines: number
  kinds: Record<string, number>
  status: string
  note: string
}

export interface EvalData {
  has_eval: boolean
  about?: string
  aggregate?: { suite_size: number; all_passing: boolean; total_findings: number; documented_dead_lines: number }
  test_cases: EvalTestCase[]
  integration: EvalIntegration[]
  large_scale: {
    target?: string
    status?: string
    reason?: string
    build_script?: string
    run_script?: string
    fallback_targets?: string[]
    expected_categories?: string[]
  }
}

export interface SourceResult {
  file: string
  total_lines: number
  returned_start: number
  returned_end: number
  lines: string[]
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

  stats: () => get<Stats>('/stats'),

  config: () => get<ConfigData>('/config'),

  eval: () => get<EvalData>('/eval'),

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
