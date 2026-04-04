"""Email service for sending credentials to users."""

import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def _render_template(template, uid, password, full_name):
    """Replace placeholders in a template string."""
    return template.replace('{uid}', uid).replace(
        '{password}', password).replace('{full_name}', full_name)


def _get_smtp(mail_cfg):
    """Create and return an authenticated SMTP connection.

    Supports:
    - Port 465: SMTP_SSL (implicit TLS)
    - Port 587 or other with STARTTLS
    - Plain SMTP without encryption
    """
    server = mail_cfg['mail_server']
    port = int(mail_cfg.get('mail_port', 587))
    use_tls = mail_cfg.get('mail_use_tls', True)

    if port == 465:
        # Implicit SSL
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        srv = smtplib.SMTP_SSL(server, port, timeout=15, context=context)
    else:
        srv = smtplib.SMTP(server, port, timeout=15)
        if use_tls:
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            srv.starttls(context=context)

    if mail_cfg.get('mail_username'):
        srv.login(mail_cfg['mail_username'], mail_cfg['mail_password'])

    return srv


def send_credentials(mail_cfg, recipient_email, uid, password, full_name='',
                     scenario='new_user'):
    """Send login credentials to a user via email.

    scenario: 'new_user' or 'reset'
    """
    subject_key = 'mail_template_{}_subject'.format(scenario)
    body_key = 'mail_template_{}_body'.format(scenario)

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
        '<html><body style="font-family:sans-serif">' + body_html + '</body></html>',
        'html', 'utf-8'))

    with _get_smtp(mail_cfg) as srv:
        srv.sendmail(mail_cfg['mail_from'], [recipient_email], msg.as_string())


def test_mail_connection(mail_cfg):
    """Test SMTP connection. Returns (True, '') or (False, error_message)."""
    try:
        with _get_smtp(mail_cfg) as srv:
            srv.noop()
        return True, ''
    except Exception as e:
        return False, str(e)
