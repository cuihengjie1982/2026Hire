// Tencent Cloud SMS — legacy API (yun.tim.qq.com)
// Signature: SHA256("appkey={key}&random={rand}&time={time}&mobile={phone}")

const SMS_API_URL = 'https://yun.tim.qq.com/v5/tlssmssvr/sendsms';

function randomInt(): number {
  return Math.floor(Math.random() * 1000000000);
}

async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizePhone(phone: string): { mobile: string; nationcode: string } {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('86') && digits.length === 13) {
    return { nationcode: '86', mobile: digits.slice(2) };
  }
  if (digits.length === 11) {
    return { nationcode: '86', mobile: digits };
  }
  return { nationcode: '86', mobile: digits };
}

export interface SmsSendResult {
  result: number;
  errmsg: string;
  ext: string;
  sid?: string;
}

export async function sendSms(params: {
  phoneNumber: string;
  templateId: string;
  templateParams: string[];
  signName?: string;
}): Promise<SmsSendResult> {
  const sdkAppId = Deno.env.get('TENCENT_SMS_SDK_APP_ID') ?? '';
  const appKey = Deno.env.get('TENCENT_SMS_APP_KEY') ?? '';
  const defaultSign = Deno.env.get('TENCENT_SMS_SIGN_NAME') ?? '';

  if (!sdkAppId || !appKey) {
    throw new Error('短信服务未配置：缺少 TENCENT_SMS_SDK_APP_ID 或 TENCENT_SMS_APP_KEY');
  }

  const rand = randomInt();
  const now = Math.floor(Date.now() / 1000);
  const { mobile, nationcode } = normalizePhone(params.phoneNumber);

  const sigStr = `appkey=${appKey}&random=${rand}&time=${now}&mobile=${mobile}`;
  const sig = await sha256Hex(sigStr);

  const body = {
    tel: { nationcode, mobile },
    sign: params.signName || defaultSign || '',
    tpl_id: parseInt(params.templateId, 10),
    params: params.templateParams,
    sig,
    time: now,
    extend: '',
    ext: '',
  };

  const response = await fetch(`${SMS_API_URL}?sdkappid=${sdkAppId}&random=${rand}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`SMS API HTTP error ${response.status}`);
  }

  const result = await response.json() as SmsSendResult;

  if (result.result !== 0) {
    throw new Error(`SMS send failed: ${result.errmsg} (code ${result.result})`);
  }

  return result;
}
