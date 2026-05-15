import {type PositionSummary, type PositionDetail} from './types';

export const positionsFixture: PositionSummary[] = [];

export const positionDetailFixture: PositionDetail = {
  position: {id: '', code: '', name: '', category: '', status: 'inactive'},
  profileRules: [],
  scoringRules: [],
  gradeRules: [],
  baseScoreConfig: null,
};
