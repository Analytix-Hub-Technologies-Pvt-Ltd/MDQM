def build_invite_payload(email: str, full_name: str, token: str, frontend_base_url: str, expires_hours: int):
    setup_url = f"{frontend_base_url.rstrip('/')}/complete-invite?token={token}"
    return {
        "to_email": email,
        "subject": "Your MDQM account is approved",
        "setup_url": setup_url,
        "expires_in_hours": expires_hours,
        "text": (
            f"Hello {full_name},\n\n"
            "Your access request was approved.\n"
            f"Set your password here: {setup_url}\n\n"
            f"This link expires in {expires_hours} hours."
        ),
    }
