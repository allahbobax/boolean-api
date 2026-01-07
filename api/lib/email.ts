import nodemailer from 'nodemailer';

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const transporter = getTransporter();
    await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html });
    return true;
  } catch (error) {
    console.error('Email error:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, username: string, resetCode: string): Promise<boolean> {
  const html = `
    <!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#000;margin:0;padding:24px;color:#fff}
    .container{max-width:500px;margin:0 auto;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px}
    .header{background:#000;padding:32px 24px;text-align:center;border-bottom:1px solid #1a1a1a}
    .logo{font-size:20px;font-weight:600;color:#fff;letter-spacing:2px}
    .content{padding:40px 24px;text-align:center}
    .title{font-size:18px;font-weight:500;color:#fff;margin:0 0 16px}
    .description{font-size:15px;line-height:1.5;color:#888;margin:0 0 32px}
    .code-container{background:#111;border:1px solid #2a2a2a;border-radius:6px;padding:24px;margin:24px 0}
    .code{font-size:32px;font-weight:600;letter-spacing:6px;color:#fff;font-family:monospace}
    .expiry{font-size:13px;color:#666;margin:16px 0 0}
    .footer{padding:24px;text-align:center;color:#666;font-size:12px;border-top:1px solid #1a1a1a}
    </style></head><body>
    <div class="container">
      <div class="header"><h1 class="logo">BOOLEAN CLIENT</h1></div>
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
    .logo{font-size:20px;font-weight:600;color:#fff;letter-spacing:2px}
    .content{padding:40px 24px;text-align:center}
    .title{font-size:18px;font-weight:500;color:#fff;margin:0 0 16px}
    .description{font-size:15px;line-height:1.5;color:#888;margin:0 0 32px}
    .code-container{background:#111;border:1px solid #2a2a2a;border-radius:6px;padding:24px;margin:24px 0}
    .code{font-size:32px;font-weight:600;letter-spacing:6px;color:#fff;font-family:monospace}
    .expiry{font-size:13px;color:#666;margin:16px 0 0}
    .footer{padding:24px;text-align:center;color:#666;font-size:12px;border-top:1px solid #1a1a1a}
    </style></head><body>
    <div class="container">
      <div class="header"><h1 class="logo">BOOLEAN CLIENT</h1></div>
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
