-- Configurable taxonomy for the standalone video-sharing module.
-- This migration is intentionally additive and does not update existing courses.

create table if not exists public.training_video_taxonomy_options (
  id uuid primary key default gen_random_uuid(),
  kind varchar(20) not null check (kind in ('task', 'quality')),
  polarity varchar(20) check (polarity in ('positive', 'negative')),
  name varchar(100) not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_video_taxonomy_option_shape check (
    (kind = 'task' and polarity is null)
    or (kind = 'quality' and polarity is not null)
  )
);

create unique index if not exists training_video_taxonomy_option_name_uidx
  on public.training_video_taxonomy_options (kind, coalesce(polarity, ''), lower(name));
create index if not exists training_video_taxonomy_option_list_idx
  on public.training_video_taxonomy_options (kind, polarity, is_active, sort_order, name);

alter table public.training_courses
  add column if not exists video_polarity varchar(20),
  add column if not exists video_task_category_id uuid,
  add column if not exists video_severity varchar(20),
  add column if not exists video_review_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'training_courses_video_polarity_check'
  ) then
    alter table public.training_courses
      add constraint training_courses_video_polarity_check
      check (video_polarity is null or video_polarity in ('positive', 'negative'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'training_courses_video_severity_check'
  ) then
    alter table public.training_courses
      add constraint training_courses_video_severity_check
      check (video_severity is null or video_severity in ('minor', 'moderate', 'severe'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'training_courses_video_task_category_fkey'
  ) then
    alter table public.training_courses
      add constraint training_courses_video_task_category_fkey
      foreign key (video_task_category_id)
      references public.training_video_taxonomy_options(id)
      on delete restrict;
  end if;
end $$;

create index if not exists training_courses_video_polarity_idx
  on public.training_courses (video_polarity) where video_polarity is not null;
create index if not exists training_courses_video_task_category_idx
  on public.training_courses (video_task_category_id) where video_task_category_id is not null;

create table if not exists public.training_course_video_quality_tags (
  course_id uuid not null references public.training_courses(id) on delete cascade,
  tag_id uuid not null references public.training_video_taxonomy_options(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (course_id, tag_id)
);

create index if not exists training_course_video_quality_tags_tag_idx
  on public.training_course_video_quality_tags (tag_id, course_id);

insert into public.training_video_taxonomy_options (kind, polarity, name, sort_order)
values
  ('task', null, '清洁', 10),
  ('task', null, '收纳', 20),
  ('task', null, '烹饪', 30),
  ('task', null, '洗涤', 40),
  ('task', null, '办公操作', 50),
  ('quality', 'positive', '动作自然', 10),
  ('quality', 'positive', '节奏合理', 20),
  ('quality', 'positive', '流程完整', 30),
  ('quality', 'positive', '操作规范', 40),
  ('quality', 'positive', '连贯高效', 50),
  ('quality', 'positive', '目标明确', 60),
  ('quality', 'positive', '视角清晰', 70),
  ('quality', 'negative', '摆拍严重', 10),
  ('quality', 'negative', '动作太慢', 20),
  ('quality', 'negative', '家务不自然', 30),
  ('quality', 'negative', '步骤遗漏', 40),
  ('quality', 'negative', '操作顺序错误', 50),
  ('quality', 'negative', '重复或无效动作', 60),
  ('quality', 'negative', '中断过多', 70),
  ('quality', 'negative', '视角遮挡', 80),
  ('quality', 'negative', '画面不稳定', 90),
  ('quality', 'negative', '安全风险', 100)
on conflict do nothing;

alter table public.training_video_taxonomy_options enable row level security;
alter table public.training_course_video_quality_tags enable row level security;

revoke all on table public.training_video_taxonomy_options from anon, authenticated;
revoke all on table public.training_course_video_quality_tags from anon, authenticated;
grant select, insert, update, delete on table public.training_video_taxonomy_options to service_role;
grant select, insert, update, delete on table public.training_course_video_quality_tags to service_role;
