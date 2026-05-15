import {type OutreachRecord, type SmsTemplate} from './types';

export const outreachRecordsFixture: OutreachRecord[] = [
  {id: 'or-1', candidateId: 'c1', candidateName: '张伟', channel: 'phone', status: 'contacted', content: '电话确认面试时间，对方同意本周五下午2点', createdAt: '2026-05-08T10:30:00Z'},
  {id: 'or-2', candidateId: 'c2', candidateName: '李明', channel: 'wechat', status: 'responded', content: '微信跟进岗位意向，候选人表示感兴趣', createdAt: '2026-05-07T14:20:00Z'},
  {id: 'or-3', candidateId: 'c3', candidateName: '王芳', channel: 'email', status: 'pending', content: '发送岗位推荐邮件，等待回复', createdAt: '2026-05-06T09:15:00Z'},
  {id: 'or-4', candidateId: 'c4', candidateName: '陈静', channel: 'interview', status: 'contacted', content: '面试邀请已发送', createdAt: '2026-05-05T16:45:00Z'},
  {id: 'or-5', candidateId: 'c1', candidateName: '张伟', channel: 'sms', status: 'contacted', content: '您好张伟，我们对您应聘产品经理岗位非常感兴趣，请回复确认面试时间。', smsProviderRef: 'sn-abc123', smsStatus: 'sent', createdAt: '2026-05-09T11:00:00Z'},
];

export const smsTemplatesFixture: SmsTemplate[] = [
  {id: 'tpl-1', name: '面试邀请', templateId: '123456', content: '您好{0}，我们对您应聘{1}岗位非常感兴趣，请回复确认面试时间。', parameters: ['姓名', '岗位']},
  {id: 'tpl-2', name: '面试提醒', templateId: '123457', content: '{0}您好，提醒您明天{1}在{2}有一场面试，请准时参加。', parameters: ['姓名', '时间', '地点']},
  {id: 'tpl-3', name: '录用通知', templateId: '123458', content: '{0}您好，恭喜您通过面试，请于{1}前回复确认入职意向。', parameters: ['姓名', '截止日期']},
];
