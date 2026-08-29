import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {ToastProvider} from '../../../shared/components/ToastProvider';
import {CreateCourseModal} from './TrainingAcademyPage';

describe('CreateCourseModal task taxonomy entry point', () => {
  it('opens task category management from the video form', async () => {
    const user = userEvent.setup();
    const onManageTaxonomy = vi.fn();

    render(
      <ToastProvider>
        <CreateCourseModal
          defaultContentType="video"
          videoSharingMode
          videoTaxonomy={{taskCategories: [], scenes: [], positiveTags: [], negativeTags: []}}
          onManageTaxonomy={onManageTaxonomy}
          onClose={() => undefined}
          onSubmit={async () => undefined}
        />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', {name: '管理分类'}));

    expect(onManageTaxonomy).toHaveBeenCalledTimes(1);
  });

  it('submits scene and review status for a new video course', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ToastProvider>
        <CreateCourseModal
          defaultContentType="video"
          videoSharingMode
          videoTaxonomy={{
            taskCategories: [],
            scenes: [{id: 'scene-kitchen', kind: 'scene', name: '厨房', sortOrder: 10, isActive: true}],
            positiveTags: [],
            negativeTags: [],
          }}
          onClose={() => undefined}
          onSubmit={onSubmit}
        />
      </ToastProvider>,
    );

    await user.type(screen.getByPlaceholderText('输入课程标题'), '擦桌子示范');
    await user.selectOptions(screen.getByLabelText('场景'), 'scene-kitchen');
    await user.selectOptions(screen.getByLabelText('审核状态'), 'pending_review');
    await user.click(screen.getByRole('button', {name: '创建课程'}));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      videoSceneId: 'scene-kitchen',
      videoReviewStatus: 'pending_review',
    }));
  });
});
