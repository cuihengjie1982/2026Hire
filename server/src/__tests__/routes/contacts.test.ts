import {describe, it, expect, vi, beforeEach} from 'vitest';
import express from 'express';
import request from 'supertest';
import contactsRouter from '../../modules/contacts/contacts.routes.js';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  getClient: vi.fn(),
  transaction: vi.fn(),
}));

import {queryOne} from '../../config/database.js';

const mockedQueryOne = vi.mocked(queryOne);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/contacts', contactsRouter);
  return app;
}

const contactId = '00000000-0000-0000-0000-000000000010';

describe('Contacts routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /', () => {
    it('returns 409 when duplicate candidate+position exists', async () => {
      mockedQueryOne.mockResolvedValueOnce({id: 'existing'} as any);

      const res = await request(createApp())
        .post('/contacts/')
        .send({
          candidateId: 'c1',
          candidateName: 'Alice',
          positionId: 'p1',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE');
    });

    it('creates contact when no duplicate', async () => {
      const created = {id: contactId, candidate_name: 'Alice', status: 'pending'};
      mockedQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(created as any);

      const res = await request(createApp())
        .post('/contacts/')
        .send({
          candidateId: 'c1',
          candidateName: 'Alice',
          positionId: 'p1',
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(created);
    });
  });

  describe('PATCH /', () => {
    it('updates outreach fields without requiring status', async () => {
      const updated = {
        id: contactId,
        outreach_person: 'Bob',
        channel: 'email',
        reason: 'Updated',
        status: 'pending',
      };
      mockedQueryOne.mockResolvedValueOnce(updated as any);

      const res = await request(createApp())
        .patch('/contacts/')
        .send({
          id: contactId,
          outreachPerson: 'Bob',
          channel: 'email',
          reason: 'Updated',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updated);
      expect(mockedQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE contacts SET'),
        expect.arrayContaining(['Bob', 'email', 'Updated', contactId]),
      );
    });
  });

  describe('DELETE /:id', () => {
    it('deletes contact by path id', async () => {
      mockedQueryOne.mockResolvedValueOnce({id: contactId} as any);

      const res = await request(createApp())
        .delete(`/contacts/${contactId}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({success: true, id: contactId});
    });
  });
});
