import { Resend } from 'resend';
import crypto from 'crypto';
import { logger } from './logger';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  logger.error('RESEND_API_KEY not configured in environment');
}

// Для EU региона нужно установить переменную окружения RESEND_BASE_URL
// или использовать API ключ, который автоматически определяет регион
const resend = new Resend(RESEND_API_KEY || 're_UymLriaL_9mVm5gLZGdebr1rENH37Agcx');

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
    
    logger.info('Attempting to send email', { from: fromEmail, to, subject });
    
    const result = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    });
    
    // Проверяем, что письмо действительно отправлено
    if (result.error) {
      logger.error('Resend API returned error', { 
        to, 
        subject,
        error: result.error,
        statusCode: result.error.statusCode,
        message: result.error.message
      });
      return false;
    }
    
    if (!result.data || !result.data.id) {
      logger.error('Resend API returned no data', { to, subject, result });
      return false;
    }
    
    logger.info('Email sent successfully', { to, subject, id: result.data.id });
    return true;
  } catch (error: any) {
    logger.error('Email sending failed', { 
      subject, 
      to,
      from: fromEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
      statusCode: error?.statusCode,
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
