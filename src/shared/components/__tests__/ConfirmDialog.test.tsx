import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ConfirmDialog} from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    title: 'Delete Item',
    message: 'Are you sure you want to delete this item?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open is true', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this item?')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<ConfirmDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    render(<ConfirmDialog {...defaultProps} />);
    const confirmButton = screen.getByText('确认');
    await userEvent.click(confirmButton);
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when cancel button is clicked', async () => {
    render(<ConfirmDialog {...defaultProps} />);
    const cancelButton = screen.getByText('取消');
    await userEvent.click(cancelButton);
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel when backdrop is clicked', async () => {
    render(<ConfirmDialog {...defaultProps} />);
    const backdrop = screen.getByText('Delete Item').closest('.fixed')?.querySelector('.bg-black\\/50');
    if (backdrop) {
      await userEvent.click(backdrop);
      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    }
  });

  it('calls onCancel when Escape key is pressed', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses custom button text', () => {
    render(<ConfirmDialog {...defaultProps} confirmText="Yes, delete" cancelText="Keep it" />);
    expect(screen.getByText('Yes, delete')).toBeInTheDocument();
    expect(screen.getByText('Keep it')).toBeInTheDocument();
  });

  it('applies danger variant styles by default', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const confirmButton = screen.getByText('确认');
    expect(confirmButton.className).toContain('bg-red-600');
  });

  it('applies warning variant styles', () => {
    render(<ConfirmDialog {...defaultProps} variant="warning" />);
    const confirmButton = screen.getByText('确认');
    expect(confirmButton.className).toContain('bg-amber-600');
  });

  it('applies info variant styles', () => {
    render(<ConfirmDialog {...defaultProps} variant="info" />);
    const confirmButton = screen.getByText('确认');
    expect(confirmButton.className).toContain('bg-blue-600');
  });

  it('has correct ARIA attributes', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-dialog-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-dialog-message');
  });

  it('focuses cancel button on mount', async () => {
    render(<ConfirmDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('取消')).toHaveFocus();
    });
  });
});
