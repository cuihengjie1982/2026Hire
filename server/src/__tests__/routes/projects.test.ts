import {describe, it, expect, vi, beforeEach} from 'vitest';
import express from 'express';
import request from 'supertest';
import projectsRouter from '../../modules/projects/projects.routes.js';

// Mock database module
vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  getClient: vi.fn(),
  transaction: vi.fn(),
}));

import {query, queryOne} from '../../config/database.js';
const mockedQuery = vi.mocked(query);
const mockedQueryOne = vi.mocked(queryOne);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/projects', projectsRouter);
  return app;
}

describe('Projects routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /', () => {
    it('returns a list of projects', async () => {
      const fakeProjects = [
        {id: '1', name: 'Project A', status: '进行中', created_at: '2026-01-01'},
        {id: '2', name: 'Project B', status: '筹备中', created_at: '2026-01-02'},
      ];
      mockedQuery.mockResolvedValue(fakeProjects as any);

      const res = await request(createApp()).get('/projects/');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeProjects);
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM projects'),
      );
    });
  });

  describe('GET /stats', () => {
    it('returns aggregated stats', async () => {
      mockedQuery.mockResolvedValueOnce([{activeProjects: 5}] as any);
      mockedQuery.mockResolvedValueOnce([{candidateReserve: 42}] as any);
      mockedQuery.mockResolvedValueOnce([{weeklyInterviews: 8}] as any);

      const res = await request(createApp()).get('/projects/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        activeProjects: 5,
        candidateReserve: 42,
        weeklyInterviews: 8,
      });
    });

    it('defaults to zero when results are empty', async () => {
      mockedQuery.mockResolvedValue([] as any);

      const res = await request(createApp()).get('/projects/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        activeProjects: 0,
        candidateReserve: 0,
        weeklyInterviews: 0,
      });
    });
  });

  describe('POST /', () => {
    it('creates a project and returns 201', async () => {
      const newProject = {id: '3', name: 'New Project', status: '筹备中'};
      mockedQueryOne.mockResolvedValue(newProject as any);

      const res = await request(createApp())
        .post('/projects/')
        .send({name: 'New Project'});

      expect(res.status).toBe(201);
      expect(res.body).toEqual(newProject);
      expect(mockedQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects'),
        expect.arrayContaining(['New Project']),
      );
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(createApp())
        .post('/projects/')
        .send({city: 'Shanghai'});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('name');
      expect(mockedQueryOne).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /:id/status', () => {
    it('updates project status', async () => {
      const updated = {id: '1', name: 'Project A', status: '已完成'};
      mockedQueryOne.mockResolvedValue(updated as any);

      const res = await request(createApp())
        .patch('/projects/1/status')
        .send({status: '已完成'});

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updated);
      expect(mockedQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE projects'),
        ['已完成', '1'],
      );
    });

    it('returns 400 when status is missing', async () => {
      const res = await request(createApp())
        .patch('/projects/1/status')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(mockedQueryOne).not.toHaveBeenCalled();
    });

    it('returns 404 when project does not exist', async () => {
      mockedQueryOne.mockResolvedValue(null);

      const res = await request(createApp())
        .patch('/projects/999/status')
        .send({status: '已完成'});

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
