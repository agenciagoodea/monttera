import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import db from './db';

interface SendEmailParams {
  to: string;
  templateKey: string;
  variables?: Record<string, any>;
}

function loadSettingsMap(keys?: string[]) {
  const rows = keys && keys.length > 0
    ? db.all(`SELECT \`key\`, value FROM settings WHERE \`key\` IN (${keys.map(() => '?').join(',')})`, ...keys)
    : db.all('SELECT `key`, value FROM settings');

  return (rows as any[]).reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

export async function sendEmail({ to, templateKey, variables = {} }: SendEmailParams) {
  try {
    // 1. Load settings
    const settings = loadSettingsMap([
      'smtp_host',
      'smtp_port',
      'smtp_secure',
      'smtp_user',
      'smtp_pass',
      'smtp_from_name',
      'smtp_from_email',
      'logo_url',
      'site_name',
      'app_url'
    ]);

    const {
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_user,
      smtp_pass,
      smtp_from_name,
      smtp_from_email,
      logo_url,
      site_name,
      app_url
    } = settings;

    if (!smtp_host || !smtp_user || !smtp_pass) {
      console.error('[Mailer] SMTP not fully configured');
      return { success: false, error: 'SMTP não configurado' };
    }

    // 2. Fetch template
    const template = db.get('SELECT * FROM email_templates WHERE `key` = ? AND active = 1', templateKey) as any;
    if (!template) {
      console.error(`[Mailer] Template '${templateKey}' not found or inactive`);
      return { success: false, error: 'Template não encontrado ou inativo' };
    }

    // 3. Prepare variables
    const templateVars = {
      store_logo: logo_url || '',
      store_name: site_name || 'Digital Bordados',
      app_url: app_url || 'http://localhost:3000',
      ...variables
    };

    // 4. Compile with Handlebars
    const compileSubject = Handlebars.compile(template.subject);
    const compileBody = Handlebars.compile(template.body);

    const subject = compileSubject(templateVars);
    const html = compileBody(templateVars);

    // 5. Send with Nodemailer
    const transporter = nodemailer.createTransport({
      host: smtp_host,
      port: Number(smtp_port) || 587,
      secure: smtp_secure === 'true' || smtp_secure === '1',
      auth: {
        user: smtp_user,
        pass: smtp_pass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const info = await transporter.sendMail({
      from: `"${smtp_from_name || templateVars.store_name}" <${smtp_from_email || smtp_user}>`,
      to,
      subject,
      html
    });

    // 6. Log success
    db.run(
      'INSERT INTO email_logs (to_email, subject, template_key, status) VALUES (?, ?, ?, ?)',
      to, subject, templateKey, 'sent'
    );

    return { success: true, messageId: info.messageId };

  } catch (error: any) {
    console.error('[Mailer] Error sending email:', error);
    // Log error
    db.run(
      'INSERT INTO email_logs (to_email, subject, template_key, status, error) VALUES (?, ?, ?, ?, ?)',
      to, '', templateKey, 'failed', error.message || String(error)
    );
    return { success: false, error: error.message };
  }
}
