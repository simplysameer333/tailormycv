import logging
from datetime import datetime, timezone

import httpx

logger = logging.getLogger("tailormycv")


def _time_ago(dt_str: str | None) -> str:
    if not dt_str:
        return ""
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        diff = int((datetime.now(timezone.utc) - dt).total_seconds())
        if diff < 3600:
            return f"{diff // 60}m ago"
        if diff < 86400:
            return f"{diff // 3600}h ago"
        return f"{diff // 86400}d ago"
    except Exception:
        return ""


def _fmt_salary(job: dict) -> str:
    lo = job.get("job_min_salary")
    hi = job.get("job_max_salary")
    if not lo and not hi:
        return ""
    cur = job.get("job_salary_currency") or "$"
    period_raw = job.get("job_salary_period") or ""
    period = "/yr" if period_raw == "YEAR" else "/hr" if period_raw == "HOUR" else ""
    def fmt(n: float) -> str:
        return f"{round(n / 1000)}K" if n >= 1000 else str(int(n))
    if lo and hi:
        return f"{cur}{fmt(lo)}–{fmt(hi)}{period}"
    return f"{cur}{fmt(lo or hi)}{period}"


async def send_quality_alert(session_id: str, aggregated: dict, resume_json: dict) -> None:
    """Log a quality alert warning. Email delivery is log-only."""
    scores = [
        f"{r['model'].upper()}={r['score']}/100"
        for r in aggregated.get("evaluator_results", [])
    ]
    logger.warning(
        "[quality-alert] session=%s min_score=%s all_passed=%s evaluators=[%s]",
        session_id,
        aggregated.get("min_score"),
        aggregated.get("all_passed"),
        ", ".join(scores),
    )


async def send_job_alert_email(
    user_email: str,
    user_name: str,
    alert_name: str,
    jobs: list[dict],
) -> bool:
    """Send a daily job alert digest via Brevo HTTP API. Returns True on success."""
    from config import settings

    if not settings.brevo_api_key:
        raise RuntimeError("BREVO_API_KEY is not set — add it to .env and Railway")

    html = _render_alert_email(user_name, alert_name, jobs, settings.frontend_url)
    n = len(jobs)
    subject = f"Your job alert: {alert_name} — Top {n} job{'s' if n != 1 else ''}"

    payload = {
        "sender": {"name": "TailorMyCv Alerts", "email": settings.brevo_sender_email},
        "to": [{"email": user_email, "name": user_name}],
        "subject": subject,
        "htmlContent": html,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                json=payload,
                headers={"api-key": settings.brevo_api_key, "Content-Type": "application/json"},
            )
            resp.raise_for_status()
        logger.info("[job-alert] Sent alert email to %s via Brevo", user_email)
        return True
    except httpx.HTTPStatusError as exc:
        body = exc.response.text
        logger.error("[job-alert] Brevo HTTP %s for %s: %s", exc.response.status_code, user_email, body)
        raise RuntimeError(f"Brevo {exc.response.status_code}: {body}") from exc
    except Exception as exc:
        logger.error("[job-alert] Brevo error sending to %s: %s", user_email, exc)
        raise RuntimeError(str(exc)) from exc


def _render_alert_email(
    user_name: str,
    alert_name: str,
    jobs: list[dict],
    frontend_url: str,
) -> str:
    emp_type_map = {
        "FULLTIME": "Full-time",
        "PARTTIME": "Part-time",
        "CONTRACTOR": "Contract",
        "INTERN": "Internship",
    }

    job_cards_html = ""
    for job in jobs:
        title = job.get("job_title", "Untitled Role")
        employer = job.get("employer_name", "")
        publisher = job.get("job_publisher", "")
        logo = job.get("employer_logo", "")

        location = ", ".join(filter(None, [
            job.get("job_city"), job.get("job_state"), job.get("job_country"),
        ]))
        emp_type = emp_type_map.get(job.get("job_employment_type", ""), "")
        is_remote = job.get("job_is_remote", False)

        apply_link = job.get("job_apply_link") or f"{frontend_url}/jobs"
        if apply_link == "#":
            apply_link = f"{frontend_url}/jobs"

        salary = _fmt_salary(job)
        posted = _time_ago(job.get("job_posted_at_datetime_utc"))
        skills = (job.get("job_required_skills") or [])[:4]

        # Logo: use employer_logo from JSearch when available, else coloured initials
        initials = (employer[:2] if employer else "?").upper()
        logo_url = job.get("employer_logo", "")
        if logo_url:
            logo_cell = (
                f'<img src="{logo_url}" width="48" height="48" alt="{initials}" '
                f'style="border-radius:10px;border:1px solid #f1f5f9;display:block;background:#fff;" />'
            )
        else:
            _colours = ["#2B579A","#0f766e","#6d28d9","#b45309","#be185d","#065f46","#1d4ed8"]
            bg = _colours[sum(ord(c) for c in employer) % len(_colours)]
            logo_cell = (
                f'<div style="width:48px;height:48px;border-radius:10px;'
                f'background:{bg};text-align:center;line-height:48px;'
                f'font-size:15px;font-weight:700;color:#fff;">{initials}</div>'
            )

        via_html = (
            f' <span style="color:#94a3b8;font-size:11px;">via {publisher}</span>'
            if publisher else ""
        )

        # Salary · posted
        sal_parts = []
        if salary:
            sal_parts.append(f'<span style="font-weight:600;color:#0f172a;">{salary}</span>')
        if posted:
            sal_parts.append(f'<span style="color:#94a3b8;">{posted}</span>')
        sal_html = (
            f'<div style="font-size:12px;margin:6px 0 4px;">'
            f'{"&nbsp;&middot;&nbsp;".join(sal_parts)}</div>'
            if sal_parts else ""
        )

        # Location · type · remote
        meta_parts = list(filter(None, [location, emp_type, "Remote" if is_remote else ""]))
        meta_html = (
            f'<div style="font-size:12px;color:#94a3b8;margin-bottom:8px;">'
            f'{"&nbsp;&middot;&nbsp;".join(meta_parts)}</div>'
            if meta_parts else ""
        )

        # Skill chips
        skills_html = ""
        if skills:
            chips = "".join(
                f'<span style="display:inline-block;background:#f1f5f9;color:#475569;'
                f'font-size:11px;padding:3px 8px;border-radius:6px;'
                f'margin:0 4px 4px 0;">{s}</span>'
                for s in skills
            )
            skills_html = f'<div style="margin-bottom:6px;">{chips}</div>'

        btn = (
            f'<a href="{apply_link}" '
            f'style="display:inline-block;background:#2B579A;color:#fff;font-size:12px;'
            f'font-weight:600;padding:6px 14px;border-radius:8px;text-decoration:none;'
            f'white-space:nowrap;">Apply &rarr;</a>'
        )

        job_cards_html += f"""
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;
                    margin-bottom:10px;background:#fff;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="60" valign="top" style="padding-right:12px;">
                {logo_cell}
              </td>
              <td valign="top">
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
                  <tr>
                    <td valign="top">
                      <div style="font-size:15px;font-weight:600;color:#0f172a;margin-bottom:2px;">{title}</div>
                      <div style="font-size:13px;color:#475569;">{employer}{via_html}</div>
                    </td>
                    <td valign="top" align="right" style="padding-left:8px;">{btn}</td>
                  </tr>
                </table>
                {sal_html}
                {meta_html}
                {skills_html}
              </td>
            </tr>
          </table>
        </div>"""

    count = len(jobs)
    count_label = f"Top {count} job{'s' if count != 1 else ''}"

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;
             background:#f8fafc;margin:0;padding:0;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">

    <div style="background:#2B579A;border-radius:16px 16px 0 0;padding:28px 32px;">
      <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">TailorMyCv</div>
      <div style="font-size:13px;color:#bfdbfe;margin-top:4px;">Your daily job alert</div>
    </div>

    <div style="background:#f8fafc;padding:28px 32px 16px;">
      <p style="font-size:16px;color:#1e293b;margin:0 0 6px;">Hi {user_name},</p>
      <p style="font-size:14px;color:#475569;margin:0 0 24px;">
        Here are your <strong>{count_label}</strong> matching your alert
        <strong>&ldquo;{alert_name}&rdquo;</strong>.
      </p>

      {job_cards_html}

      <div style="text-align:center;margin:28px 0 8px;">
        <a href="{frontend_url}/jobs"
           style="display:inline-block;background:#f1f5f9;color:#2B579A;font-size:14px;
                  font-weight:600;padding:12px 28px;border-radius:10px;
                  text-decoration:none;border:1px solid #e2e8f0;">
          Search more jobs on TailorMyCv &rarr;
        </a>
      </div>
    </div>

    <div style="background:#f1f5f9;border-radius:0 0 16px 16px;
                padding:16px 32px;text-align:center;">
      <p style="font-size:11px;color:#94a3b8;margin:0;">
        You&rsquo;re receiving this because you set up a job alert on TailorMyCv.<br>
        <a href="{frontend_url}/jobs" style="color:#64748b;">Manage your alerts</a>
      </p>
    </div>

  </div>
</body>
</html>"""
