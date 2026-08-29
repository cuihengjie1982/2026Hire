import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {ShortlistPage} from './ShortlistPage';

const {sendShortlistInterviewInviteMock, promoteShortlistEntryMock, navigateToPageMock} = vi.hoisted(() => ({
  sendShortlistInterviewInviteMock: vi.fn(),
  promoteShortlistEntryMock: vi.fn(),
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
  promoteShortlistEntry: promoteShortlistEntryMock,
  sendShortlistInterviewInvite: sendShortlistInterviewInviteMock,
  removeFromShortlist: vi.fn(),
}));

vi.mock('../../interviews/api', () => ({
  listInterviewTemplates: vi.fn(async () => []),
}));

vi.mock('../../candidates/api', () => ({
  listCandidates: vi.fn(async () => []),
}));

vi.mock('../../positions/api', () => ({
  getPositionDetail: vi.fn(async () => null),
}));

vi.mock('../../contacts/api', () => ({}));

vi.mock('../../../navigation', () => ({
  navigateToPage: navigateToPageMock,
}));

vi.mock('../../../CandidateDetailModal', () => ({
  CandidateDetailModal: () => null,
}));

vi.mock('../../../shared/lib/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/lib/runtime')>();
  return {
    ...actual,
    getUserName: () => '测试用户',
  };
});

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

  it('submits outreach promote via single promoteShortlistEntry call', async () => {
    promoteShortlistEntryMock.mockResolvedValue({entry: {id: 'entry-1', nextStep: '发起外联'}});
    const user = userEvent.setup();
    render(<ShortlistPage />);

    await screen.findByText('张三');
    await user.click(screen.getByRole('button', {name: /^推进$/}));

    const reasonInput = screen.getByPlaceholderText('请输入推进理由...');
    await user.type(reasonInput, '岗位匹配');
    await user.click(screen.getByRole('button', {name: /^提交$/}));

    await waitFor(() =>
      expect(promoteShortlistEntryMock).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({
          nextStep: '发起外联',
          outreachPerson: '测试用户',
          channel: 'wechat',
          reason: '岗位匹配',
        }),
      ),
    );
  });
});
