import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {VideoTaxonomyManager} from './VideoTaxonomyManager';

const taxonomy = {
  taskCategories: [
    {id: 'task-clean', kind: 'task' as const, name: '清洁', sortOrder: 10, isActive: true},
  ],
  positiveTags: [
    {id: 'tag-natural', kind: 'quality' as const, polarity: 'positive' as const, name: '动作自然', sortOrder: 10, isActive: true},
  ],
  negativeTags: [
    {id: 'tag-staged', kind: 'quality' as const, polarity: 'negative' as const, name: '摆拍严重', sortOrder: 10, isActive: true},
  ],
};

describe('VideoTaxonomyManager', () => {
  it('creates a backend-defined task category', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <VideoTaxonomyManager
        taxonomy={taxonomy}
        onClose={() => undefined}
        onCreate={onCreate}
        onUpdate={async () => undefined}
        onDelete={async () => undefined}
      />,
    );

    expect(screen.getByText('清洁')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('新增任务分类'), '家务整理');
    await user.click(screen.getByRole('button', {name: '添加'}));

    expect(onCreate).toHaveBeenCalledWith({kind: 'task', name: '家务整理'});
  });

  it('keeps positive and negative quality tags in separate views', async () => {
    const user = userEvent.setup();
    render(
      <VideoTaxonomyManager
        taxonomy={taxonomy}
        onClose={() => undefined}
        onCreate={async () => undefined}
        onUpdate={async () => undefined}
        onDelete={async () => undefined}
      />,
    );

    await user.click(screen.getByRole('tab', {name: /正向标签/}));
    expect(screen.getByText('动作自然')).toBeInTheDocument();
    expect(screen.queryByText('摆拍严重')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', {name: /负向标签/}));
    expect(screen.getByText('摆拍严重')).toBeInTheDocument();
    expect(screen.queryByText('动作自然')).not.toBeInTheDocument();
  });
});
