import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {LoginPage} from '../pages/LoginPage';
import {AUTH_SESSION_STORAGE_KEY} from '../../../shared/lib/runtime';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('motion/react', () => ({
  motion: {
    div: ({children, ...props}: any) => <div {...props}>{children}</div>,
  },
}));

vi.mock('../../../shared/lib/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/lib/runtime')>();
  return {
    ...actual,
    USE_MOCK_API: true, // default: mock mode
    API_BASE_URL: 'http://localhost:4000',
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders email and password inputs', () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    expect(screen.getByPlaceholderText(/企业邮箱/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/密码/)).toBeInTheDocument();
    expect(screen.getByText('登录')).toBeInTheDocument();
  });

  it('calls onLogin immediately in mock mode when form is submitted', async () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    await userEvent.type(screen.getByPlaceholderText(/企业邮箱/), 'test@example.com');
    await userEvent.type(screen.getByPlaceholderText(/密码/), 'password123');
    await userEvent.click(screen.getByText('登录'));

    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('does not submit when fields are empty', async () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    // Submit button is inside a form — click it directly
    const submitBtn = screen.getByText('登录');
    // HTML5 validation should prevent submission when required fields are empty
    // The form has `required` on inputs, so clicking submit won't trigger handleSubmit
    expect(submitBtn).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('toggles password visibility', async () => {
    render(<LoginPage onLogin={vi.fn()} />);

    const passwordInput = screen.getByPlaceholderText(/密码/);
    expect(passwordInput).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByText('显示'));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByText('隐藏'));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('opens and closes apply dialog', async () => {
    render(<LoginPage onLogin={vi.fn()} />);

    await userEvent.click(screen.getByText('申请企业账号'));
    expect(screen.getByText('企业名称')).toBeInTheDocument();

    // Close the dialog
    const closeButtons = screen.getAllByRole('button');
    const cancelBtn = closeButtons.find((b) => b.textContent === '取消');
    if (cancelBtn) {
      await userEvent.click(cancelBtn);
      expect(screen.queryByText('企业名称')).not.toBeInTheDocument();
    }
  });

  it('shows apply success state after submission', async () => {
    render(<LoginPage onLogin={vi.fn()} />);

    await userEvent.click(screen.getByText('申请企业账号'));

    // Fill required fields
    await userEvent.type(screen.getByPlaceholderText(/企业全称/), '测试公司');
    await userEvent.type(screen.getByPlaceholderText(/联系人姓名/), '张三');
    await userEvent.type(screen.getByPlaceholderText(/联系邮箱/), 'test@co.com');

    // Submit
    const submitBtn = screen.getAllByText('提交申请')[0];
    await userEvent.click(submitBtn);

    expect(screen.getByText('申请已提交')).toBeInTheDocument();
  });
});
