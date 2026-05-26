import {createContext, useContext, useState, useEffect, ReactNode} from 'react';
import {listProjects} from '../../modules/projects/api';
import {type Project} from '../../modules/projects/types';
import {SELECTED_PROJECT_STORAGE_KEY} from '../../shared/lib/runtime';

interface ProjectContextValue {
  selectedProject: Project | null;
  setSelectedProject: (project: Project | null) => void;
  projects: Project[];
  loading: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export const ProjectProvider = ({children}: {children: ReactNode}) => {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await listProjects();
        setProjects(data);
        if (data.length > 0) {
          const savedProjectId =
            typeof window === 'undefined'
              ? null
              : window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY);
          const matchedProject = savedProjectId
            ? data.find((project) => project.id === savedProjectId) ?? null
            : null;
          setSelectedProject(matchedProject ?? data[0]);
        } else {
          setSelectedProject(null);
        }
      } catch (e) {
        console.error('Failed to load projects:', e);
        // 非静默：通知用户加载失败
        const toast = document.querySelector('[data-toast-provider]') as HTMLElement | null;
        if (toast) {
          toast.dispatchEvent(new CustomEvent('toast', {bubbles: true, detail: {type: 'error', message: '项目列表加载失败，请刷新重试'}}));
        }
      } finally {
        setLoading(false);
      }
    };
    loadProjects();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (selectedProject) {
      window.localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, selectedProject.id);
    } else {
      window.localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
    }
  }, [selectedProject]);

  return (
    <ProjectContext.Provider value={{selectedProject, setSelectedProject, projects, loading}}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used within ProjectProvider');
  return context;
};
