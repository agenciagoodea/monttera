import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import dbAsync from './dbAsync';

interface SendEmailParams {
  to: string;
  templateKey: string;
  variables?: Record<string, any>;
}

async function loadSettingsMap(keys?: string[]) {
  const rows = keys && keys.length > 0
    ? await dbAsync.all(`SELECT \`key\`, value FROM settings WHERE \`key\` IN (${keys.map(() => '?').join(',')})`, ...keys)
    : await dbAsync.all('SELECT `key`, value FROM settings');

  return (rows as any[]).reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

export async function sendEmail({ to, templateKey, variables = {} }: SendEmailParams) {
  try {
    // 1. Load settings
    const settings = await loadSettingsMap([
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
    const template = await dbAsync.get('SELECT * FROM email_templates WHERE `key` = ? AND active = 1', templateKey) as any;
    if (!template) {
      console.error(`[Mailer] Template '${templateKey}' not found or inactive`);
      return { success: false, error: 'Template não encontrado ou inativo' };
    }

    // 3. Prepare variables
    const baseAppUrl = (app_url || 'https://monttera.com.br').replace(/\/+$/, '');
    let resolvedLogo = logo_url || '';
    if (resolvedLogo && !resolvedLogo.startsWith('http://') && !resolvedLogo.startsWith('https://')) {
      resolvedLogo = `${baseAppUrl}/${resolvedLogo.replace(/^\/+/, '')}`;
    }

    const templateVars = {
      store_logo: resolvedLogo,
      store_name: site_name || 'Monttera',
      app_url: baseAppUrl,
      ...variables
    };

    // 4. Compile with Handlebars
    const compileSubject = Handlebars.compile(template.subject);
    const compileBody = Handlebars.compile(template.body);

    const subject = compileSubject(templateVars);
    const html = compileBody(templateVars);

    // 5. Send with Nodemailer
    const allowInvalidTls = process.env.SMTP_ALLOW_INVALID_TLS === 'true';
    const transporter = nodemailer.createTransport({
      host: smtp_host,
      port: Number(smtp_port) || 587,
      secure: smtp_secure === 'true' || smtp_secure === '1',
      auth: {
        user: smtp_user,
        pass: smtp_pass
      },
      tls: {
        rejectUnauthorized: !allowInvalidTls
      }
    });

    const info = await transporter.sendMail({
      from: `"${smtp_from_name || templateVars.store_name}" <${smtp_from_email || smtp_user}>`,
      to,
      subject,
      html
    });

    // 6. Log success
    await dbAsync.run(
      'INSERT INTO email_logs (to_email, subject, template_key, status) VALUES (?, ?, ?, ?)',
      to, subject, templateKey, 'sent'
    );

    return { success: true, messageId: info.messageId };

  } catch (error: any) {
    console.error('[Mailer] Error sending email:', error);
    // Log error
    await dbAsync.run(
      'INSERT INTO email_logs (to_email, subject, template_key, status, error) VALUES (?, ?, ?, ?, ?)',
      to, '', templateKey, 'failed', error.message || String(error)
    );
    return { success: false, error: error.message };
  }
}
