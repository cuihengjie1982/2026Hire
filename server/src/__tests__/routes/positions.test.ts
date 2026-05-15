import {describe, it, expect, vi, beforeEach} from 'vitest';
import express from 'express';
import request from 'supertest';
import positionsRouter from '../../modules/positions/positions.routes.js';

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
  app.use('/positions', positionsRouter);
  return app;
}

describe('Positions routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /', () => {
    it('returns a list of positions', async () => {
      const fakePositions = [
        {id: '1', code: 'ENG-001', name: 'Engineer', category: 'tech', projectName: 'Project A'},
      ];
      mockedQuery.mockResolvedValue(fakePositions as any);

      const res = await request(createApp()).get('/positions/');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakePositions);
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM positions p'),
        [],
      );
    });
  });

  describe('GET /:id', () => {
    it('returns a position with details', async () => {
      const fakePosition = {
        id: '1', code: 'ENG-001', name: 'Engineer', category: 'tech',
        projectName: 'Project A', profile: '{}', scoring_rules: '[]',
      };
      mockedQueryOne.mockResolvedValue(fakePosition as any);

      const res = await request(createApp()).get('/positions/1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakePosition);
      expect(mockedQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('position_details pd'),
        ['1'],
      );
    });

    it('returns 404 for an invalid/non-existent ID', async () => {
      mockedQueryOne.mockResolvedValue(null);

      const res = await request(createApp()).get('/positions/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /', () => {
    it('creates a position and returns 201', async () => {
      const newPosition = {id: '2', code: 'ENG-002', name: 'Senior Dev', category: 'tech', status: 'active'};
      // First call: duplicate check (returns null = no duplicate), Second call: INSERT
      mockedQueryOne
        .mockResolvedValueOnce(null as any) // duplicate check
        .mockResolvedValueOnce(newPosition as any); // INSERT

      const res = await request(createApp())
        .post('/positions/')
        .send({code: 'ENG-002', name: 'Senior Dev', category: 'tech'});

      expect(res.status).toBe(201);
      expect(res.body).toEqual(newPosition);
    });

    it('returns 409 when position with same name already exists', async () => {
      // Duplicate check returns an existing position
      mockedQueryOne.mockResolvedValue({id: '1', code: 'ENG-001', name: 'Senior Dev'} as any);

      const res = await request(createApp())
        .post('/positions/')
        .send({name: 'Senior Dev', category: 'tech'});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE');
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(createApp())
        .post('/positions/')
        .send({code: 'ENG-003'});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('name and category');
      expect(mockedQueryOne).not.toHaveBeenCalled();
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(createApp())
        .post('/positions/')
        .send({code: 'ENG-003', category: 'tech'});

      expect(res.status).toBe(400);
      expect(mockedQueryOne).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /:id', () => {
    it('deletes a position and returns success', async () => {
      mockedQuery.mockResolvedValue([] as any);

      const res = await request(createApp()).delete('/positions/1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({deleted: true});
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM positions'),
        ['1'],
      );
    });

    it('returns 404 when position does not exist', async () => {
      mockedQueryOne.mockResolvedValue(null);

      const res = await request(createApp()).delete('/positions/999');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
