"""Email service for sending credentials to users."""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def _render_template(template, uid, password, full_name):
    """Replace placeholders in a template string."""
    return template.replace('{uid}', uid).replace(
        '{password}', password).replace('{full_name}', full_name)


def send_credentials(mail_cfg, recipient_email, uid, password, full_name='',
                     scenario='new_user'):
    """Send login credentials to a user via email.

    scenario: 'new_user' or 'reset'
    """
    subject_key = f'mail_template_{scenario}_subject'
    body_key = f'mail_template_{scenario}_body'

    subject = mail_cfg.get(subject_key, 'Данные для входа в систему')
    body_tpl = mail_cfg.get(body_key, '')

    subject = _render_template(subject, uid, password, full_name)
    body_text = _render_template(body_tpl, uid, password, full_name)

    body_html = body_text.replace('&', '&amp;').replace('<', '&lt;').replace(
        '>', '&gt;').replace('\n', '<br>')

    msg = MIMEMultipart('alternative')
    msg['From'] = mail_cfg['mail_from']
    msg['To'] = recipient_email
    msg['Subject'] = subject

    msg.attach(MIMEText(body_text, 'plain', 'utf-8'))
    msg.attach(MIMEText(
        f'<html><body style="font-family:sans-serif">{body_html}</body></html>',
        'html', 'utf-8'))

    with smtplib.SMTP(mail_cfg['mail_server'], int(mail_cfg['mail_port'])) as srv:
        if mail_cfg.get('mail_use_tls'):
            srv.starttls()
        if mail_cfg.get('mail_username'):
            srv.login(mail_cfg['mail_username'], mail_cfg['mail_password'])
        srv.sendmail(mail_cfg['mail_from'], [recipient_email], msg.as_string())


def test_mail_connection(mail_cfg):
    """Test SMTP connection. Returns (True, '') or (False, error_message)."""
    try:
        with smtplib.SMTP(mail_cfg['mail_server'], int(mail_cfg['mail_port']), timeout=10) as srv:
            if mail_cfg.get('mail_use_tls'):
                srv.starttls()
            if mail_cfg.get('mail_username'):
                srv.login(mail_cfg['mail_username'], mail_cfg['mail_password'])
        return True, ''
    except Exception as e:
        return False, str(e)
