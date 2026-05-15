import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {CandidateSearchPage} from './CandidateSearchPage';

const {listPositionsMock} = vi.hoisted(() => ({
  listPositionsMock: vi.fn(async () => [
    {id: 'position-a', name: '岗位 A', projectId: 'project-a'},
    {id: 'position-b', name: '岗位 B', projectId: 'project-b'},
  ]),
}));

let mockSelectedProject: {id: string; name: string} | null = {
  id: 'project-a',
  name: '项目 A',
};

vi.mock('../hooks', () => ({
  useCandidates: () => ({
    data: [
      {
        id: 'candidate-1',
        name: '张三',
        location: '上海',
        source: 'Boss',
        sourceColor: 'bg-blue-100',
        roles: ['MWV'],
        tags: ['动作'],
        fitScore: [86],
        scoreColor: 'border-blue-500',
        grade: 'A',
        gradeColor: 'bg-green-500',
        reason: '匹配度高',
      },
    ],
    error: null,
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('../../../app/contexts/ProjectContext', () => ({
  useProject: () => ({
    projects: [
      {id: 'project-a', name: '项目 A'},
      {id: 'project-b', name: '项目 B'},
    ],
    selectedProject: mockSelectedProject,
  }),
}));

vi.mock('../../positions/api', () => ({
  listPositions: listPositionsMock,
  getPositionDetail: vi.fn(async () => null),
}));

vi.mock('../../shortlist/api', () => ({
  addToShortlist: vi.fn(),
}));

vi.mock('../../../navigation', () => ({
  navigateToPage: vi.fn(),
}));

vi.mock('../../../CandidateDetailModal', () => ({
  CandidateDetailModal: () => null,
}));

vi.mock('../../talent/components/ResumeImportModal', () => ({
  ResumeImportModal: () => null,
}));

describe('CandidateSearchPage', () => {
  it.skip('clears stale position selection when selected project changes', async () => {
    const user = userEvent.setup();
    const {rerender} = render(<CandidateSearchPage />);

    const positionSelect = (await screen.findAllByRole('combobox'))[1];
    await waitFor(() =>
      expect(screen.getByRole('option', {name: '岗位 A'})).toBeInTheDocument(),
    );

    await user.selectOptions(positionSelect, 'position-a');
    expect(positionSelect).toHaveValue('position-a');

    mockSelectedProject = {id: 'project-b', name: '项目 B'};
    rerender(<CandidateSearchPage />);

    await waitFor(() => expect(positionSelect).toHaveValue(''));
    await waitFor(() =>
      expect(screen.getByRole('option', {name: '岗位 B'})).toBeInTheDocument(),
    );
  });
});
