"""Email service for sending credentials to users."""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def send_credentials(mail_cfg, recipient_email, uid, password, full_name=''):
    """Send login credentials to a user via email.

    mail_cfg keys: mail_server, mail_port, mail_use_tls,
                   mail_username, mail_password, mail_from
    """
    msg = MIMEMultipart('alternative')
    msg['From'] = mail_cfg['mail_from']
    msg['To'] = recipient_email
    msg['Subject'] = 'Данные для входа в систему'

    text = (
        f"Здравствуйте, {full_name}!\n\n"
        f"Ваши данные для входа:\n"
        f"Логин: {uid}\n"
        f"Пароль: {password}\n\n"
        f"Пожалуйста, смените пароль при первом входе.\n"
    )
    html = (
        f"<html><body>"
        f"<p>Здравствуйте, <b>{full_name}</b>!</p>"
        f"<p>Ваши данные для входа:</p>"
        f"<table border='0' cellpadding='4'>"
        f"<tr><td><b>Логин:</b></td><td>{uid}</td></tr>"
        f"<tr><td><b>Пароль:</b></td><td><code>{password}</code></td></tr>"
        f"</table>"
        f"<p>Пожалуйста, смените пароль при первом входе.</p>"
        f"</body></html>"
    )

    msg.attach(MIMEText(text, 'plain', 'utf-8'))
    msg.attach(MIMEText(html, 'html', 'utf-8'))

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
