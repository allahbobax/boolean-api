import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { logger } from './logger';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER;

if (!SMTP_USER || !SMTP_PASS) {
  logger.error('SMTP credentials not configured in environment');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export function generateVerificationCode(): string {
  // Криптографически стойкая генерация 6-значного кода
  return crypto.randomInt(100000, 1000000).toString();
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    if (!SMTP_USER || !SMTP_PASS) {
      logger.error('SMTP credentials are not set');
      return false;
    }
    
    logger.info('Attempting to send email via Gmail SMTP', { from: SMTP_FROM, to, subject });
    
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: to,
      subject: subject,
      html: html,
    });

    logger.info('Email sent successfully', { to, subject, messageId: info.messageId });
    return true;
  } catch (error: any) {
    logger.error('Email sending failed', { 
      subject, 
      to,
      from: SMTP_FROM,
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
