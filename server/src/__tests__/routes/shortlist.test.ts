import {describe, it, expect, vi, beforeEach} from 'vitest';
import express from 'express';
import request from 'supertest';
import shortlistRouter from '../../modules/shortlist/shortlist.routes.js';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  getClient: vi.fn(),
  transaction: vi.fn(),
}));

import {query, queryOne, transaction} from '../../config/database.js';

const mockedQuery = vi.mocked(query);
const mockedQueryOne = vi.mocked(queryOne);
const mockedTransaction = vi.mocked(transaction);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/shortlist', shortlistRouter);
  return app;
}

const entryId = '00000000-0000-0000-0000-000000000001';

describe('Shortlist routes — promote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates next_step only when no outreach fields', async () => {
    const updated = {id: entryId, next_step: '安排面试', candidate_name: 'Alice'};
    mockedQueryOne
      .mockResolvedValueOnce({id: entryId, candidate_id: 'c1', status_log: []} as any)
      .mockResolvedValueOnce(updated as any);

    const res = await request(createApp())
      .post(`/shortlist/${entryId}/promote`)
      .send({nextStep: '安排面试'});

    expect(res.status).toBe(200);
    expect(res.body.entry).toEqual(updated);
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it('returns 404 when entry not found', async () => {
    mockedQueryOne.mockResolvedValueOnce(null);

    const res = await request(createApp())
      .post(`/shortlist/${entryId}/promote`)
      .send({nextStep: '安排面试'});

    expect(res.status).toBe(404);
  });

  it('atomically creates contact and updates shortlist for outreach promote', async () => {
    const entry = {
      id: entryId,
      candidate_id: 'c1',
      candidate_name: 'Alice',
      position_id: 'p1',
      position_name: 'Engineer',
      project_id: 'proj1',
      project_name: 'Project',
    };
    const contact = {id: 'contact-1', candidate_id: 'c1'};
    const updated = {...entry, next_step: '发起外联'};

    mockedQueryOne.mockResolvedValueOnce(entry as any);
    mockedTransaction.mockImplementation(async (fn) => {
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({rows: []})
          .mockResolvedValueOnce({rows: [contact]})
          .mockResolvedValueOnce({rows: [updated]}),
      };
      return fn(client as any);
    });

    const res = await request(createApp())
      .post(`/shortlist/${entryId}/promote`)
      .send({
        nextStep: '发起外联',
        outreachPerson: 'Recruiter',
        channel: 'wechat',
        reason: 'Good fit',
      });

    expect(res.status).toBe(200);
    expect(res.body.entry).toEqual(updated);
    expect(res.body.contact).toEqual(contact);
    expect(mockedTransaction).toHaveBeenCalled();
  });

  it('returns 409 when contact duplicate exists for outreach promote', async () => {
    const entry = {
      id: entryId,
      candidate_id: 'c1',
      candidate_name: 'Alice',
      position_id: 'p1',
    };

    mockedQueryOne.mockResolvedValueOnce(entry as any);
    mockedTransaction.mockImplementation(async (fn) => {
      const client = {
        query: vi.fn().mockResolvedValueOnce({rows: [{id: 'existing'}]}),
      };
      return fn(client as any);
    });

    const res = await request(createApp())
      .post(`/shortlist/${entryId}/promote`)
      .send({
        nextStep: '发起外联',
        outreachPerson: 'Recruiter',
        channel: 'wechat',
        reason: 'Good fit',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE');
  });
});
