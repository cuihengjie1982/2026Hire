import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {ShortlistPage} from './ShortlistPage';

const {sendShortlistInterviewInviteMock, navigateToPageMock} = vi.hoisted(() => ({
  sendShortlistInterviewInviteMock: vi.fn(),
  navigateToPageMock: vi.fn(),
}));

vi.mock('../api', () => ({
  listShortlist: vi.fn(async () => [
    {
      id: 'entry-1',
      candidateId: 'candidate-1',
      candidateName: '张三',
      positionId: 'position-1',
      positionName: '动作采集',
      projectId: 'project-1',
      projectName: '具身项目',
      role: 'MWV',
      fitScore: 91,
      grade: 'A',
      nextStep: '安排面试',
    },
  ]),
  promoteShortlistEntry: vi.fn(),
  sendShortlistInterviewInvite: sendShortlistInterviewInviteMock,
}));

vi.mock('../../contacts/api', () => ({
  createContact: vi.fn(),
}));

vi.mock('../../../navigation', () => ({
  navigateToPage: navigateToPageMock,
}));

vi.mock('../../../CandidateDetailModal', () => ({
  CandidateDetailModal: () => null,
}));

describe('ShortlistPage', () => {
  it('blocks interview invite submission until a valid email is provided', async () => {
    const user = userEvent.setup();
    render(<ShortlistPage />);

    await screen.findByText('张三');
    await user.click(screen.getByRole('button', {name: /发送面试邀请/}));

    const sendButton = screen.getByRole('button', {name: /^发送邀请$/});
    expect(sendButton).toBeDisabled();

    const emailInput = screen.getByPlaceholderText('请输入候选人邮箱地址');
    await user.type(emailInput, 'zhangsan');
    expect(sendButton).toBeEnabled();

    await user.click(sendButton);
    expect(screen.getByText('请输入有效的邮箱地址')).toBeInTheDocument();
    expect(sendShortlistInterviewInviteMock).not.toHaveBeenCalled();

    await user.clear(emailInput);
    await user.type(emailInput, 'zhangsan@example.com');
    await user.click(sendButton);

    await waitFor(() =>
      expect(sendShortlistInterviewInviteMock).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({candidateEmail: 'zhangsan@example.com'}),
      ),
    );
    expect(navigateToPageMock).toHaveBeenCalledWith('ai-interview-preview');
  });
});
