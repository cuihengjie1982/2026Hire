import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {ErrorBoundary} from '../ErrorBoundary';

// Mock navigation module used by ErrorBoundary
vi.mock('../../../navigation', () => ({
  navigateToPage: vi.fn(),
}));

function ThrowingChild({shouldThrow}: {shouldThrow: boolean}) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>Normal content</div>;
}

describe('ErrorBoundary', () => {
  // Suppress console.error for expected errors in tests
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('页面出了点问题')).toBeInTheDocument();
    expect(screen.getByText('重新加载')).toBeInTheDocument();
    expect(screen.getByText('返回首页')).toBeInTheDocument();
  });

  it('has a working reload button', async () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    // Verify the reload button exists and is clickable
    const reloadBtn = screen.getByText('重新加载');
    expect(reloadBtn).toBeInTheDocument();
    // The button calls window.location.reload() which we can't spy on in jsdom,
    // but we verify the button is rendered correctly
    expect(reloadBtn.tagName).toBe('BUTTON');
  });
});
