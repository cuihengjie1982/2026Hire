import {describe, it, expect, vi, beforeEach} from 'vitest';
import express from 'express';
import request from 'supertest';
import candidatesRouter from '../../modules/candidates/candidates.routes.js';

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
  app.use('/candidates', candidatesRouter);
  return app;
}

describe('Candidates routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /', () => {
    it('returns paginated candidates with tags', async () => {
      const fakeCandidates = [
        {id: '1', name: 'Alice', tags: ['python', 'senior']},
        {id: '2', name: 'Bob', tags: ['java']},
      ];
      mockedQuery.mockResolvedValue(fakeCandidates as any);
      mockedQueryOne.mockResolvedValue({total: 2} as any);

      const res = await request(createApp()).get('/candidates/');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual(fakeCandidates);
      expect(res.body.total).toBe(2);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(50);
    });
  });

  describe('GET /search', () => {
    it('returns filtered results when keyword is provided', async () => {
      const fakeItems = [{id: '1', name: 'Alice Smith', tags: []}];
      mockedQuery.mockResolvedValue(fakeItems as any);
      mockedQueryOne.mockResolvedValue({total: 1} as any);

      const res = await request(createApp()).get('/candidates/search?keyword=Alice');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual(fakeItems);
      expect(res.body.total).toBe(1);
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining([expect.stringContaining('Alice')]),
      );
    });
  });

  describe('GET /stats', () => {
    it('returns talent stats', async () => {
      mockedQueryOne.mockResolvedValueOnce({totalCount: 150} as any);
      mockedQueryOne.mockResolvedValueOnce({monthlyNew: 23} as any);
      mockedQuery.mockResolvedValueOnce([
        {grade: 'A', count: 10},
        {grade: 'B', count: 25},
      ] as any);

      const res = await request(createApp()).get('/candidates/stats');
      expect(res.status).toBe(200);
      expect(res.body.totalCount).toBe(150);
      expect(res.body.monthlyNew).toBe(23);
      expect(res.body.gradeDistribution).toEqual({A: 10, B: 25});
    });

    it('defaults to zero when results are empty', async () => {
      mockedQueryOne.mockResolvedValue(null);
      mockedQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/candidates/stats');
      expect(res.status).toBe(200);
      expect(res.body.totalCount).toBe(0);
      expect(res.body.monthlyNew).toBe(0);
      expect(res.body.gradeDistribution).toEqual({});
    });
  });

  describe('POST /import', () => {
    it('creates a candidate and returns 201', async () => {
      mockedQueryOne
        .mockResolvedValueOnce(null as any) // email check
        .mockResolvedValueOnce({id: '1', name: 'Charlie', email: 'c@test.com'} as any); // INSERT

      const res = await request(createApp())
        .post('/candidates/import')
        .send({name: 'Charlie', email: 'c@test.com'});

      expect(res.status).toBe(201);
      expect(res.body.duplicate).toBe(false);
      expect(res.body.id).toBe('1');
      expect(res.body.name).toBe('Charlie');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(createApp())
        .post('/candidates/import')
        .send({email: 'c@test.com'});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('name');
    });
  });
});