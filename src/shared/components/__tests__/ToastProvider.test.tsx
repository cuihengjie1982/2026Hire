import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {ToastProvider, useToast} from '../ToastProvider';

// Helper component to trigger toasts
const ToastTrigger = ({
  type,
  message,
}: {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}) => {
  const toast = useToast();
  return (
    <button
      onClick={() => toast[type](message)}
      data-testid={`trigger-${type}`}
    >
      Show {type}
    </button>
  );
};

describe('ToastProvider', () => {
  it('renders children', () => {
    render(
      <ToastProvider>
        <div data-testid="child">Hello</div>
      </ToastProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('shows success toast', async () => {
    render(
      <ToastProvider>
        <ToastTrigger type="success" message="操作成功" />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByTestId('trigger-success'));
    expect(screen.getByText('操作成功')).toBeInTheDocument();
  });

  it('shows error toast', async () => {
    render(
      <ToastProvider>
        <ToastTrigger type="error" message="出错了" />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByTestId('trigger-error'));
    expect(screen.getByText('出错了')).toBeInTheDocument();
  });

  it('shows warning toast', async () => {
    render(
      <ToastProvider>
        <ToastTrigger type="warning" message="注意" />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByTestId('trigger-warning'));
    expect(screen.getByText('注意')).toBeInTheDocument();
  });

  it('shows info toast', async () => {
    render(
      <ToastProvider>
        <ToastTrigger type="info" message="提示信息" />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByTestId('trigger-info'));
    expect(screen.getByText('提示信息')).toBeInTheDocument();
  });

  it('dismisses toast on close button click', async () => {
    render(
      <ToastProvider>
        <ToastTrigger type="success" message="可关闭" />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByTestId('trigger-success'));
    expect(screen.getByText('可关闭')).toBeInTheDocument();

    const closeButton = screen.getByLabelText('关闭通知');
    await userEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText('可关闭')).not.toBeInTheDocument();
    });
  });

  it('useToast throws when used outside provider', () => {
    // Suppress console.error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<ToastTrigger type="success" message="test" />);
    }).toThrow('useToast must be used within a <ToastProvider>');

    spy.mockRestore();
  });
});
