export type WahaEnv = {
  WAHA_API_KEY: string;
  WAHA_BASE_URL?: string;
};

export type WahaResult = {
  ok: boolean;
  error?: string;
};

const DEFAULT_BASE_URL = 'https://waha.yeguez.com';

export async function sendWhatsApp(
  env: WahaEnv,
  phone: string,
  text: string,
  session = 'default'
): Promise<WahaResult> {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  if (!cleanPhone) return { ok: false, error: 'Número inválido' };

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
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => '');
    return { ok: false, error: `WAHA ${res.status}: ${body.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: `Error de red: ${err instanceof Error ? err.message : 'desconocido'}` };
  }
}
