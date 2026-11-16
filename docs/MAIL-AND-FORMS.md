# Shared inbox and email setup

Each approved team member signs in to Pond Desk with their own email address. They see the same Contact and Join conversations. A shared login is unnecessary. Adding a member still requires the same allowlist update in Cloudflare Access and Render; this release changes neither list.

The inbox does not need email alerts to operate. POND_NOTIFY_EMAILS is empty by default. No notification recipients have been selected. An outgoing studio address (for example hello@frogpondboys.com) needs owner approval and a verified sending domain. Resend sending does not create a mailbox. Replies to Desk messages use a unique conversation address on a separate inbound subdomain.

## Current release status

The provider adapter and incoming-email Worker are implemented and tested with synthetic data. No Resend account, domain verification, incoming-mail route, Turnstile widget or real email delivery has been verified. Production sending and public forms remain disabled. A simulated reply never reports that an email was sent. This release must not be treated as a completed email launch.

## Setup sequence for the final rollout

1. The owner creates or grants access to the team's Resend account. Store its key privately, never in source or chat. Approve the sender address. Notifications can stay unset.
2. Add the approved sending domain in Resend and install exactly the DNS verification records returned by that account. Verify ownership before enabling sending. Keep existing DNS and mail records unless an explicit change is required.
3. Configure a dedicated inbound subdomain, for example reply.frogpondboys.com, in Cloudflare Email Routing. Deploy hosting/email-worker.mjs with its postal-mime dependency bundled using the Cloudflare Workers build tooling. Route only that subdomain's conversation addresses to this Worker. It does not supply a general hello@ mailbox.
4. Create separate random secrets of at least 32 characters for POND_FORM_PROXY_SECRET and POND_INBOUND_SECRET. The former is shared by Render and the website Worker; the latter by Render and the email Worker. Never use the Resend key as either secret.
5. In the email Worker set POND_REPLY_DOMAIN, RENDER_ORIGIN_HOST, POND_PUBLIC_HOST and POND_INBOUND_SECRET. It accepts Cloudflare-authenticated DMARC-passing messages, at most 1 MiB, plain-text replies up to 10,000 characters, and no attachments. HTML-only messages and new email attachments are rejected explicitly. Send new files through Join instead.
6. Create a Turnstile widget restricted to the public hostname. Store TURNSTILE_SECRET_KEY on Render. The public widget must use action contact or join and submit turnstileToken. The frontend must integrate the widget, accessible errors and disabled fallback before activation. The existing static export stays closed.
7. Set POND_MAIL_MODE=resend, RESEND_API_KEY, POND_MAIL_FROM, POND_REPLY_DOMAIN and POND_INBOUND_SECRET on Render only after validation. Keep POND_FORMS_ENABLED=false until the complete real submission/reply/received-reply test passes. Setting the backend flag alone does not wire the public form UI.
8. Enable POND_FORMS_ENABLED and POND_FORM_PROXY_SECRET in both Render and the website Worker only for the approved launch. Verify an outside visitor's submission, private attachment preview, team visibility, studio reply and the visitor's response in the original thread. Check rejected tokens, wrong origins and duplicate requests. Do not send acceptance emails without the owner's instructions and chosen recipients.

## API and security behavior

POST /api/v2/forms/contact and /api/v2/forms/join accept multipart full_name, email, message, website (empty honeypot) and turnstileToken. Join adds phone, portfolioUrl and one optional attachment. A successful durable save returns 201 {id,status:"received"}; notification delivery is independent. Repeated submissions are limited to five accepted and twenty attempted requests per hour per client IP, with four concurrent intake requests. Persistent rate keys are hashed, not logged IP addresses.

The website Worker strips caller-supplied forwarding secrets and stamps the actual client IP. Render requires that secret, the expected Origin and server-side Turnstile validation including hostname and action. Incoming replies use a separate timestamped HMAC endpoint with five-minute freshness, event deduplication and exact conversation/sender matching. No private message content appears in diagnostic logs or notification bodies.

Join allows PDF, DOCX, PNG/JPEG/WebP and supported short MP4/WebM videos, up to 10 MiB each. PDF pages are rasterized, DOCX text is extracted from bounded OOXML without Office or external resources and rendered to an image-only PDF, images are decoded/re-encoded, and video is parsed/remuxed. DOC and DOCM are unsupported. Rebuilt previews lose original document formatting, searchable text and interactive content. Original files remain private and require explicit confirmation to download; an original is not certified safe. Binary bytes are separate from the JSON state. A 500 MiB metadata-accounted budget covers retained public files and both attachment copies; database capacity still requires monitoring because failed writes can leave private orphan blobs.

GET /api/v2/attachments/:id serves a sanitized attachment only to signed-in team members. The original requires ?original=1&confirm=1. Private files never appear in the public /files route. Deleting a conversation hides it and retains it until the established retention deadline (12 months for Join, 24 for Contact, from creation). Archived content can be restored through the API; the archive interface still requires frontend integration.

Replies return queued, simulated or an existing delivery status. Provider requests happen outside the editor mutation queue, with stable idempotency keys. Receipts merge into current state without overwriting another member's edit. Failures retry at increasing intervals, up to five attempts and 23 hours; uncertain older deliveries become review_required rather than risking a duplicate. There is no manual retry UI yet. Monitor and resolve these entries before enabling real mail.

References: [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction), [Resend sending API](https://resend.com/docs/api-reference/emails/send-email), [Turnstile server verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Cloudflare email handler](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/).
