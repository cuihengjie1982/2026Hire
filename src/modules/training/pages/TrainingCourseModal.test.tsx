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
          videoTaxonomy={{taskCategories: [], positiveTags: [], negativeTags: []}}
          onManageTaxonomy={onManageTaxonomy}
          onClose={() => undefined}
          onSubmit={async () => undefined}
        />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', {name: '管理分类'}));

    expect(onManageTaxonomy).toHaveBeenCalledTimes(1);
  });
});
