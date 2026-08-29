import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createAdminClient, listCourses } from './training-video-compatibility.mjs';

export function inferCategory(course) {
  const groups = new Set();
  for (const section of Array.isArray(course.content) ? course.content : []) {
    if ((section.contentType ?? section.content_type) !== 'video') continue;
    const title = String(section.sectionTitle ?? section.section_title ?? '').trim();
    if (title.startsWith('正向视频')) groups.add('正向视频');
    if (/^负[向面]视频/.test(title)) groups.add('负向视频');
  }
  return groups.size === 1 ? [...groups][0] : null;
}

export function planChanges(courses) {
  return courses.flatMap(course => {
    if (['正向视频', '负向视频'].includes(course.category)) return [];
    const next = inferCategory(course);
    return next && next !== course.category ? [{ id: course.id, oldCategory: course.category, newCategory: next }] : [];
  });
}

async function main() {
  const args = process.argv.slice(2);
  const snapshotPath = args[args.indexOf('--snapshot') + 1];
  if (!args.includes('--snapshot') || !snapshotPath || snapshotPath.startsWith('--')) {
    throw new Error('Supply --snapshot /absolute/path.json; dry run is the default');
  }
  const client = createAdminClient();
  if (!args.includes('--apply')) {
    const courses = await listCourses(client);
    const changes = planChanges(courses);
    await writeFile(snapshotPath, JSON.stringify({ createdAt: new Date().toISOString(), courses, changes }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ snapshotPath, courses: courses.length, changes: changes.length,
      positive: changes.filter(c => c.newCategory === '正向视频').length,
      negative: changes.filter(c => c.newCategory === '负向视频').length }, null, 2));
    return;
  }

  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  const changes = planChanges(snapshot.courses);
  if (!isDeepStrictEqual(changes, snapshot.changes)) throw new Error('Snapshot change list is inconsistent');
  for (const change of changes) {
    const original = snapshot.courses.find(c => c.id === change.id);
    const { data: current, error: readError } = await client.from('training_courses').select('*').eq('id', change.id).single();
    if (readError || !isDeepStrictEqual(original, current)) throw new Error(`Course changed since snapshot: ${change.id}`);
    let request = client.from('training_courses').update({ category: change.newCategory }).eq('id', change.id);
    request = change.oldCategory == null ? request.is('category', null) : request.eq('category', change.oldCategory);
    if (original.updated_at) request = request.eq('updated_at', original.updated_at);
    const { data, error } = await request.select('*').single();
    if (error) throw new Error(`Category update failed for ${change.id}: ${error.message}`);
    const expected = { ...original, category: change.newCategory, updated_at: data.updated_at };
    if (!isDeepStrictEqual(expected, data)) throw new Error(`Unexpected non-category change: ${change.id}`);
    console.log(`${change.id}: ${change.oldCategory} -> ${change.newCategory}`);
  }
  const current = await listCourses(client);
  await writeFile(`${snapshotPath}.after.json`, JSON.stringify(current, null, 2), { mode: 0o600 });
  console.log(`Updated and verified ${changes.length} course categories; all media and configuration fields unchanged.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
