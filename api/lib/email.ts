import crypto from 'crypto';
import { logger } from './logger';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  logger.error('RESEND_API_KEY not configured in environment');
}

export function generateVerificationCode(): string {
  // Криптографически стойкая генерация 6-значного кода
  return crypto.randomInt(100000, 1000000).toString();
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@booleanclient.ru';
  
  try {
    if (!RESEND_API_KEY) {
      logger.error('RESEND_API_KEY is not set');
      return false;
    }
    
    logger.info('Attempting to send email via direct HTTP', { from: fromEmail, to, subject });
    
    // Используем прямой HTTP запрос вместо Resend SDK
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: subject,
        html: html,
      }),
    });

    const responseText = await response.text();
    logger.info('Resend API response', { 
      status: response.status, 
      statusText: response.statusText,
      body: responseText 
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { message: responseText };
      }
      
      logger.error('Resend API returned error', { 
        to, 
        subject,
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      return false;
    }

    const result = JSON.parse(responseText);
    
    if (!result.id) {
      logger.error('Resend API returned no ID', { to, subject, result });
      return false;
    }
    
    logger.info('Email sent successfully', { to, subject, id: result.id });
    return true;
  } catch (error: any) {
    logger.error('Email sending failed', { 
      subject, 
      to,
      from: fromEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, username: string, resetCode: string): Promise<boolean> {
  const html = `
    <!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#000;margin:0;padding:24px;color:#fff}
    .container{max-width:500px;margin:0 auto;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px}
    .header{background:#000;padding:32px 24px;text-align:center;border-bottom:1px solid #1a1a1a}
    .logo-container{display:flex;align-items:center;justify-content:center;gap:12px}
    .logo-img{width:32px;height:32px;object-fit:contain}
    .logo{font-size:20px;font-weight:600;color:#fff;letter-spacing:2px;margin:0}
    .content{padding:40px 24px;text-align:center}
    .title{font-size:18px;font-weight:500;color:#fff;margin:0 0 16px}
    .description{font-size:15px;line-height:1.5;color:#888;margin:0 0 32px}
    .code-container{background:#111;border:1px solid #2a2a2a;border-radius:6px;padding:24px;margin:24px 0}
    .code{font-size:32px;font-weight:600;letter-spacing:6px;color:#fff;font-family:monospace}
    .expiry{font-size:13px;color:#666;margin:16px 0 0}
    .footer{padding:24px;text-align:center;color:#666;font-size:12px;border-top:1px solid #1a1a1a}
    </style></head><body>
    <div class="container">
      <div class="header">
        <div class="logo-container">
          <img src="https://booleanclient.ru/icon.png" alt="Logo" class="logo-img" />
          <h1 class="logo">BOOLEAN CLIENT</h1>
        </div>
      </div>
      <div class="content">
        <h2 class="title">Сброс пароля</h2>
        <p class="description">Привет, ${username}! Вы запросили сброс пароля.</p>
        <div class="code-container"><div class="code">${resetCode}</div><p class="expiry">Код действителен 10 минут</p></div>
        <p class="description">Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</p>
      </div>
      <div class="footer"><p>© 2026 BOOLEAN. Все права защищены.</p></div>
    </div></body></html>`;
  return sendEmail(email, 'Сброс пароля - BOOLEAN', html);
}

export async function sendVerificationEmail(email: string, username: string, verificationCode: string): Promise<boolean> {
  const html = `
    <!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#000;margin:0;padding:24px;color:#fff}
    .container{max-width:500px;margin:0 auto;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px}
    .header{background:#000;padding:32px 24px;text-align:center;border-bottom:1px solid #1a1a1a}
    .logo-container{display:flex;align-items:center;justify-content:center;gap:12px}
    .logo-img{width:32px;height:32px;object-fit:contain}
    .logo{font-size:20px;font-weight:600;color:#fff;letter-spacing:2px;margin:0}
    .content{padding:40px 24px;text-align:center}
    .title{font-size:18px;font-weight:500;color:#fff;margin:0 0 16px}
    .description{font-size:15px;line-height:1.5;color:#888;margin:0 0 32px}
    .code-container{background:#111;border:1px solid #2a2a2a;border-radius:6px;padding:24px;margin:24px 0}
    .code{font-size:32px;font-weight:600;letter-spacing:6px;color:#fff;font-family:monospace}
    .expiry{font-size:13px;color:#666;margin:16px 0 0}
    .footer{padding:24px;text-align:center;color:#666;font-size:12px;border-top:1px solid #1a1a1a}
    </style></head><body>
    <div class="container">
      <div class="header">
        <div class="logo-container">
          <img src="https://booleanclient.ru/icon.png" alt="Logo" class="logo-img" />
          <h1 class="logo">BOOLEAN CLIENT</h1>
        </div>
      </div>
      <div class="content">
        <h2 class="title">Код подтверждения</h2>
        <p class="description">Код отправлен на ${email}</p>
        <div class="code-container"><div class="code">${verificationCode}</div><p class="expiry">Код действителен 10 минут</p></div>
        <p class="description">Если вы не запрашивали код, проигнорируйте это письмо.</p>
      </div>
      <div class="footer"><p>© 2026 BOOLEAN. Все права защищены.</p></div>
    </div></body></html>`;
  return sendEmail(email, 'Код подтверждения - BOOLEAN', html);
}
