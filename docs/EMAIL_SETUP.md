# Account emails (sign-up confirmation and password reset)

Supabase's built-in email sender is meant for testing: it sends only a few emails per hour, so
during a launch many students won't get their confirmation or reset email. Send them through your
own provider instead. Resend is used below (free tier: 3,000 emails a month, 100 a day); any SMTP
provider works the same way.

## 1. Set up Resend (about 10 minutes)
1. Create an account at resend.com.
2. **Domains → Add domain →** `lectureloop.org`.
3. Add the DNS records Resend shows (SPF and DKIM, plus DMARC if offered) wherever
   lectureloop.org's DNS is managed (for example Vercel → Domains). Wait until Resend shows
   **Verified**.
4. **API Keys → Create API key** with "Sending access". Copy it (it's shown once). Paste it only
   into the Supabase field below, never into chat or the code.

## 2. Point Supabase at Resend
Supabase dashboard → your project → **Authentication → Emails → SMTP Settings → Enable custom SMTP**:

| Field | Value |
|---|---|
| Sender email | `no-reply@lectureloop.org` |
| Sender name | `LectureLoop` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key |

Save. Then **Authentication → Rate Limits → "Rate limit for sending emails"**: raise it (for
example to 100 per hour) now that your own provider sends them.

## 3. Branded templates
**Authentication → Emails → Templates**:
- **Confirm signup**: subject `Confirm your LectureLoop account`; body = the contents of
  `supabase/templates/confirm-signup.html`.
- **Reset Password**: subject `Reset your LectureLoop password`; body = the contents of
  `supabase/templates/reset-password.html`.

The template links open LectureLoop's own pages (`/confirm-email`, `/reset-password`) with a
one-time code that is used only when the student presses the button. Mail scanners (common at
universities) open links to check them; with Supabase's default `{{ .ConfirmationURL }}` links
that uses up the code and the student sees "link expired". So always paste these templates, and
make sure **Site URL** below is `https://lectureloop.org` (the templates use `{{ .SiteURL }}`).

## 4. Allow the password-reset page
**Authentication → URL Configuration**:
- Site URL: `https://lectureloop.org`
- Redirect URLs: add `https://lectureloop.org/reset-password` and `https://lectureloop.org/confirm-email`
  (or `https://lectureloop.org/**`).

## 5. Test
1. lectureloop.org → Sign in → **Forgot password?** → enter your email. The branded email from
   `no-reply@lectureloop.org` should arrive within a minute.
2. Open the link → choose a new password → you land on the home page, signed in.
3. Sign up with a spare NYU address → the confirmation email arrives → confirm it.
4. In Resend → **Emails**, both messages show as Delivered.

If an email lands in spam, check that every DNS record in Resend shows as verified.
