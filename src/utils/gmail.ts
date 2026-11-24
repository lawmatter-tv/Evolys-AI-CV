function encodeUtf8Base64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function encodeBase64Url(input: string): string {
  return encodeUtf8Base64(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendApplicationViaGmail(params: {
  accessToken: string;
  to: string;
  subject: string;
  body: string;
  senderName?: string;
}): Promise<{ id: string; threadId: string }> {
  const cleanTo = params.to.trim();
  const cleanSubject = params.subject.trim();
  const encodedSubject = `=?UTF-8?B?${encodeUtf8Base64(cleanSubject)}?=`;

  const headers = [
    `To: ${cleanTo}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];

  const rawEmail = `${headers.join('\r\n')}\r\n\r\n${params.body}`;
  const raw = encodeBase64Url(rawEmail);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMsg = data?.error?.message || `Échec d'envoi Gmail (${response.status})`;
    throw new Error(errMsg);
  }

  return {
    id: String(data.id || ''),
    threadId: String(data.threadId || ''),
  };
}

export async function createDraftViaGmail(params: {
  accessToken: string;
  to: string;
  subject: string;
  body: string;
}): Promise<{ id: string }> {
  const encodedSubject = `=?UTF-8?B?${encodeUtf8Base64(params.subject.trim())}?=`;
  const headers = [
    params.to.trim() ? `To: ${params.to.trim()}` : '',
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ].filter(Boolean);

  const raw = encodeBase64Url(`${headers.join('\r\n')}\r\n\r\n${params.body}`);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { raw } }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Échec création brouillon Gmail (${response.status})`);
  }

  return { id: String(data.id || '') };
}
