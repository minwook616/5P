"""Email helpers (Resend). All sends are best-effort and never raise."""
import os
import asyncio
import logging
import resend

logger = logging.getLogger("5p.email")
resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
APP_NAME = os.environ.get("APP_NAME", "5P")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")


def _wrap(title: str, body_html: str) -> str:
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#0A0A0A;font-family:Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A;padding:48px 16px;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #2A2A2A;">
      <tr><td style="padding:32px 32px 16px 32px;border-bottom:1px solid #1F1F1F;">
        <span style="color:#F5F5F5;font-size:28px;font-weight:800;letter-spacing:-0.02em;">{APP_NAME}</span>
        <span style="color:#C8102E;font-size:28px;font-weight:800;">.</span>
      </td></tr>
      <tr><td style="padding:24px 32px 32px 32px;color:#F5F5F5;">
        <div style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#8C8C8C;margin-bottom:12px;">{title}</div>
        {body_html}
      </td></tr>
      <tr><td style="padding:16px 32px 24px 32px;border-top:1px solid #1F1F1F;color:#545454;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">
        Five Stories. Five People. Once a day.
      </td></tr>
    </table>
  </td></tr>
</table></body></html>"""


async def _send(to: str, subject: str, html: str):
    if not resend.api_key:
        logger.warning(f"[email] RESEND_API_KEY missing — would have sent to {to}: {subject}")
        return False
    params = {"from": SENDER, "to": [to], "subject": subject, "html": html}
    try:
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"[email] sent '{subject}' to {to}")
        return True
    except Exception as e:
        logger.error(f"[email] FAILED to send '{subject}' to {to}: {e}")
        return False


async def send_otp(to: str, code: str):
    body = f"""
      <p style="margin:0 0 8px 0;font-size:15px;color:#F5F5F5;">Your verification code:</p>
      <div style="margin:16px 0;padding:18px;background:#0A0A0A;border:1px solid #C8102E;text-align:center;">
        <span style="font-family:'Courier New',monospace;font-size:36px;letter-spacing:14px;color:#F5F5F5;font-weight:700;">{code}</span>
      </div>
      <p style="margin:8px 0 0 0;font-size:12px;color:#8C8C8C;">This code expires in 10 minutes.</p>
      <p style="margin:8px 0 0 0;font-size:12px;color:#8C8C8C;">If you didn't request this, ignore this email.</p>
    """
    return await _send(to, f"{APP_NAME} · Verify your inbox", _wrap("Verification", body))


async def send_password_reset(to: str, token: str):
    link = f"{PUBLIC_BASE_URL}/reset/{token}"
    body = f"""
      <p style="margin:0 0 8px 0;font-size:15px;color:#F5F5F5;">Reset your password.</p>
      <p style="margin:8px 0 24px 0;font-size:13px;color:#8C8C8C;">Click the link below. It expires in 1 hour.</p>
      <a href="{link}" style="display:inline-block;padding:14px 24px;background:#C8102E;color:#fff;text-decoration:none;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;font-size:12px;">Reset Password</a>
      <p style="margin:24px 0 0 0;font-size:11px;color:#545454;word-break:break-all;">{link}</p>
    """
    return await _send(to, f"{APP_NAME} · Password Reset", _wrap("Reset", body))


async def send_admin_decision(to: str, approved: bool):
    if approved:
        body = """
          <p style="margin:0 0 8px 0;font-size:18px;color:#F5F5F5;font-weight:700;">Welcome to 5P.</p>
          <p style="margin:8px 0 0 0;font-size:13px;color:#8C8C8C;">The admin has approved your application. Log in to claim your slot.</p>
        """
        subject = f"{APP_NAME} · You're in"
        title = "Approved"
    else:
        body = """
          <p style="margin:0 0 8px 0;font-size:18px;color:#F5F5F5;font-weight:700;">This is not your place.</p>
          <p style="margin:8px 0 0 0;font-size:13px;color:#8C8C8C;">The admin did not approve your application this time.</p>
        """
        subject = f"{APP_NAME} · Application Closed"
        title = "Rejected"
    return await _send(to, subject, _wrap(title, body))


async def send_key_granted(to: str, code: str):
    body = f"""
      <p style="margin:0 0 8px 0;font-size:18px;color:#F5F5F5;font-weight:700;">A post you wrote crossed 15 likes.</p>
      <p style="margin:8px 0 16px 0;font-size:13px;color:#8C8C8C;">As tradition, you receive one Pillar Key — for the rest of your life. Use it wisely.</p>
      <div style="margin:16px 0;padding:18px;background:#0A0A0A;border:1px solid #C8102E;text-align:center;">
        <span style="font-family:'Courier New',monospace;font-size:22px;letter-spacing:6px;color:#F5F5F5;font-weight:700;">{code}</span>
      </div>
      <p style="margin:8px 0 0 0;font-size:11px;color:#545454;">One key per lifetime. Non-renewable.</p>
    """
    return await _send(to, f"{APP_NAME} · Pillar Key Granted", _wrap("Pillar's Key", body))
