import {fetchJson, cached, invalidateCache} from '../../shared/lib/apiClient';
import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';
import {projectStatsFixture, projectsFixture} from './fixtures';
import {type Project, type ProjectStats, type ProjectStatus} from './types';

const efetch = async <T>(path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> => {
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const res = await fetch(`${base}/functions/v1/embox-api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken() ?? ''}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data as T;
};

export type TimeRange = 'today' | 'week' | 'month' | 'all';

interface GetStatsParams {
  timeRange?: TimeRange;
  startDate?: string;
  endDate?: string;
}

let projectsData: Project[] = (() => { try { const r = localStorage.getItem('em-box.mock.projects'); return r ? JSON.parse(r) : [...projectsFixture]; } catch { return [...projectsFixture]; } })();
const saveProjects = () => localStorage.setItem('em-box.mock.projects', JSON.stringify(projectsData));

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

  return cached('listProjects', async () => {
    const data = await efetch<Record<string, unknown>[]>('/projects', 'GET');
    return Array.from(new Map((data ?? []).map((r) => [String(r.id), fromSnake(r)])).values());
  });
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

  const result = await efetch<Record<string, unknown>>('/projects', 'POST', {
    name: data.name,
    description: data.description,
    city: data.city,
    progress: data.progress,
    startDate: data.startDate,
    endDate: data.endDate,
    status: data.status,
    manager: data.manager,
  });
  invalidateCache('listProjects');
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

  const row = await efetch<Record<string, unknown>>('/projects', 'PATCH', { id, status });
  invalidateCache('listProjects');
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

  const row = await efetch<Record<string, unknown>>('/projects', 'PATCH', {
    id,
    name: data.name,
    description: data.description,
    city: data.city,
    progress: data.progress,
    startDate: data.startDate,
    endDate: data.endDate,
    status: data.status,
    manager: data.manager,
  });
  invalidateCache('listProjects');
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

  await efetch('/projects', 'DELETE', { id });
  invalidateCache('listProjects');
};
