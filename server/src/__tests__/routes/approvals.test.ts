import {describe, it, expect, vi, beforeEach} from 'vitest';
import express from 'express';
import request from 'supertest';
import approvalsRouter from '../../modules/approvals/approvals.routes.js';

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
  app.use('/approvals', approvalsRouter);
  return app;
}

describe('Approvals routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /', () => {
    it('returns pending approval requests', async () => {
      const fakeApprovals = [
        {id: '1', status: 'pending', candidate_name: 'Alice'},
      ];
      mockedQuery.mockResolvedValue(fakeApprovals as any);
      mockedQueryOne.mockResolvedValue({total: 1} as any);

      const res = await request(createApp()).get('/approvals/');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual(fakeApprovals);
      expect(res.body.total).toBe(1);
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'pending'"),
        expect.any(Array),
      );
    });
  });

  describe('POST /', () => {
    it('creates an approval request and returns 201', async () => {
      const newApproval = {id: '2', status: 'pending', type: 'interview_result'};
      mockedQueryOne.mockResolvedValue(newApproval as any);

      const res = await request(createApp())
        .post('/approvals/')
        .send({candidateName: 'Bob', positionName: 'Engineer'});

      expect(res.status).toBe(201);
      expect(res.body).toEqual(newApproval);
      expect(mockedQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO approval_requests'),
        expect.arrayContaining(['interview_result', null, 'Bob', null, null, 'Engineer']),
      );
    });
  });

  describe('POST /:id/decide', () => {
    it('approves a pending request', async () => {
      const approved = {id: '00000000-0000-0000-0000-000000000001', status: 'approved', approver_name: 'Manager'};
      mockedQueryOne.mockResolvedValue(approved as any);

      const res = await request(createApp())
        .post('/approvals/00000000-0000-0000-0000-000000000001/decide')
        .send({status: 'approved', approverName: 'Manager'});

      expect(res.status).toBe(200);
      expect(res.body).toEqual(approved);
      expect(mockedQueryOne).toHaveBeenCalledWith(
        expect.stringContaining("SET status = $1"),
        expect.arrayContaining(['approved', null, 'Manager', '00000000-0000-0000-0000-000000000001']),
      );
    });

    it('returns 400 for invalid status value', async () => {
      const res = await request(createApp())
        .post('/approvals/00000000-0000-0000-0000-000000000001/decide')
        .send({status: 'maybe'});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('approved');
      expect(res.body.error.message).toContain('rejected');
      expect(mockedQueryOne).not.toHaveBeenCalled();
    });

    it('returns 404 when approval request does not exist or is not pending', async () => {
      mockedQueryOne.mockResolvedValue(null);

      const res = await request(createApp())
        .post('/approvals/00000000-0000-0000-0000-000000000999/decide')
        .send({status: 'approved'});

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /history', () => {
    it('returns non-pending approval requests', async () => {
      const historyItems = [
        {id: '1', status: 'approved', decided_at: '2026-01-10'},
        {id: '2', status: 'rejected', decided_at: '2026-01-11'},
      ];
      mockedQuery.mockResolvedValue(historyItems as any);
      mockedQueryOne.mockResolvedValue({total: 2} as any);

      const res = await request(createApp()).get('/approvals/history');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual(historyItems);
      expect(res.body.total).toBe(2);
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining("status != 'pending'"),
        expect.any(Array),
      );
    });
  });
});
