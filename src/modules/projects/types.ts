export type ProjectStatus = '进行中' | '筹备中' | '已关闭';

export interface Project {
  id: string;
  name: string;
  description?: string;
  city: string;
  progress: number;
  startDate?: string;
  endDate?: string;
  status: ProjectStatus;
  createdAt?: string;
  manager?: string;
}

export interface ProjectStats {
  activeProjects: number;
  candidateReserve: number;
  weeklyInterviews: number;
}
