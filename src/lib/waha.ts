export type WahaEnv = {
  WAHA_API_KEY: string;
  WAHA_BASE_URL?: string;
};

const DEFAULT_BASE_URL = 'https://waha.yeguez.com';

export async function sendWhatsApp(
  env: WahaEnv,
  phone: string,
  text: string,
  session = 'default'
): Promise<boolean> {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  if (!cleanPhone) return false;

  const baseUrl = env.WAHA_BASE_URL || DEFAULT_BASE_URL;
  const chatId = `${cleanPhone}@c.us`;

  try {
    const res = await fetch(`${baseUrl}/api/sendText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': env.WAHA_API_KEY,
      },
      body: JSON.stringify({ session, chatId, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
