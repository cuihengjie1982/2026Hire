import {supabase} from '../../shared/lib/supabase';
import {fetchJson, mockDelay} from '../../shared/lib/apiClient';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {projectStatsFixture, projectsFixture} from './fixtures';
import {type Project, type ProjectStats, type ProjectStatus} from './types';

/** Escape hatch for supabase without generated Database types */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string) => supabase.from(table) as any;

export type TimeRange = 'today' | 'week' | 'month' | 'all';

interface GetStatsParams {
  timeRange?: TimeRange;
  startDate?: string;
  endDate?: string;
}

let projectsData: Project[] = (() => { try { const r = localStorage.getItem('em-box.mock.projects'); return r ? JSON.parse(r) : [...projectsFixture]; } catch { return [...projectsFixture]; } })();
const saveProjects = () => localStorage.setItem('em-box.mock.projects', JSON.stringify(projectsData));

/** camelCase → snake_case for PostgREST columns (empty strings → null for date cols) */
const toSnake = (p: Partial<Project>): Record<string, unknown> => {
  const o: Record<string, unknown> = {};
  if (p.name !== undefined) o.name = p.name;
  if (p.description !== undefined) o.description = p.description || null;
  if (p.city !== undefined) o.city = p.city;
  if (p.progress !== undefined) o.progress = p.progress;
  if (p.startDate !== undefined) o.start_date = p.startDate || null;
  if (p.endDate !== undefined) o.end_date = p.endDate || null;
  if (p.status !== undefined) o.status = p.status;
  if (p.createdAt !== undefined) o.created_at = p.createdAt || null;
  if (p.manager !== undefined) o.manager = p.manager || null;
  return o;
};

/** snake_case DB row → camelCase Project */
const fromSnake = (r: Record<string, unknown>): Project => ({
  id: String(r.id ?? ''),
  name: String(r.name ?? ''),
  description: r.description ? String(r.description) : undefined,
  city: String(r.city ?? ''),
  progress: Number(r.progress ?? 0),
  startDate: (r.start_date ?? r.startDate ?? '') as string || undefined,
  endDate: (r.end_date ?? r.endDate ?? '') as string || undefined,
  status: String(r.status ?? '筹备中') as ProjectStatus,
  createdAt: String(r.created_at ?? r.createdAt ?? ''),
  manager: r.manager ? String(r.manager) : undefined,
});

const getMockProjectStats = (params: GetStatsParams): ProjectStats => {
  const {timeRange = 'week', startDate, endDate} = params;
  const now = new Date();
  const today = now.toDateString();

  // Filter projects based on time range or custom date range
  const filtered = projectsData.filter((p) => {
    if (startDate && endDate) {
      const date = new Date(p.createdAt ?? now);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return date >= start && date <= end;
    }
    if (timeRange === 'all') return true;
    if (timeRange === 'month') {
      const date = new Date(p.createdAt ?? now);
      return date.getMonth() === now.getMonth();
    }
    if (timeRange === 'week') {
      const date = new Date(p.createdAt ?? now);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return date >= weekAgo;
    }
    if (timeRange === 'today') {
      const date = new Date(p.createdAt ?? now);
      return date.toDateString() === today;
    }
    return true;
  });

  const activeProjects = filtered.filter((p) => p.status === '进行中').length;

  return {
    activeProjects,
    candidateReserve: 0,
    weeklyInterviews: 0,
  };
};

export const getProjectStats = async (params: GetStatsParams = {}): Promise<ProjectStats> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    return getMockProjectStats(params);
  }

  const res = await fetchJson<{activeProjects: number; candidateReserve: number; weeklyInterviews: number}>(
    `/functions/v1/embox-api/analytics/project-stats`,
  );
  return {
    activeProjects: res.activeProjects ?? 0,
    candidateReserve: res.candidateReserve ?? 0,
    weeklyInterviews: res.weeklyInterviews ?? 0,
  };
};

export const listProjects = async (): Promise<Project[]> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    return Array.from(new Map(projectsData.map(p => [p.id, p])).values());
  }

  const {data, error} = await db('projects').select('*').order('created_at', {ascending: false});
  if (error) throw new Error(error.message);
  return Array.from(new Map(((data ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), fromSnake(r)])).values());
};

export const createProject = async (data: Omit<Project, 'id'>): Promise<Project> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    const newProject: Project = {
      ...data,
      id: Date.now().toString(),
      createdAt: data.createdAt || new Date().toISOString(),
    };
    projectsData.push(newProject);
    saveProjects();
    return newProject;
  }

  const row = toSnake({...data, createdAt: data.createdAt || new Date().toISOString()});
  const {data: result, error} = await db('projects').insert(row).select().single();
  if (error) throw new Error(error.message);
  if (!result) throw new Error('Failed to create project');
  return fromSnake(result as Record<string, unknown>);
};

export const updateProjectStatus = async (id: string, status: Project['status']): Promise<Project> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    const index = projectsData.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Project not found');
    projectsData[index] = {...projectsData[index], status};
    saveProjects();
    return projectsData[index];
  }

  const {data: row, error} = await db('projects').update({status}).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  if (!row) throw new Error('Project not found');
  return fromSnake(row as Record<string, unknown>);
};

export const updateProject = async (id: string, data: Partial<Pick<Project, 'name' | 'city' | 'manager' | 'progress' | 'startDate' | 'endDate' | 'description' | 'status'>>): Promise<Project> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    const index = projectsData.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Project not found');
    projectsData[index] = {...projectsData[index], ...data};
    saveProjects();
    return projectsData[index];
  }

  const {data: row, error} = await db('projects').update(toSnake(data)).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  if (!row) throw new Error('Project not found');
  return fromSnake(row as Record<string, unknown>);
};

export const deleteProject = async (id: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise((r) => setTimeout(r, 120));
    const index = projectsData.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Project not found');
    projectsData.splice(index, 1);
    saveProjects();
    return;
  }

  const {error} = await db('projects').delete().eq('id', id);
  if (error) throw new Error(error.message);
};
