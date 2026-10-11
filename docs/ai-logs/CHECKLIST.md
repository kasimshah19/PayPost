# AI Log Sanitization Checklist

Before pasting or committing AI chat prompts or transcripts into this repository:

- [ ] **No MongoDB Atlas Credentials**: Ensure no connection strings contain real usernames or passwords (e.g. `mongodb+srv://...`). Use placeholders like `mongodb+srv://<username>:<password>@cluster...`.
- [ ] **No JWT Secrets or Private Keys**: Check that no actual HMAC signing secrets or RSA private key blocks are embedded in prompts or outputs.
- [ ] **No Personal Identifiable Information (PII)**: Scrub personal phone numbers, private email addresses, and real UPI VPAs.
- [ ] **No Tracked .env Files**: Verify with `npm run check:secrets` that no environment configuration files are committed to git.
- [ ] **Verify Placeholders**: Ensure any remaining review markers are updated or removed.
