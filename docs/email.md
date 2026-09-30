# Email

Services send email through the `Mailer` interface (`src/email/mailer.ts`): one recipient, a subject and a plain-text body. The app picks one with `getMailer()` (`src/email/app-mailer.ts`):

- **Production** sends through [Resend](https://resend.com). It needs `RESEND_API_KEY`, `EMAIL_FROM` (on a domain verified in Resend) and `APP_URL` (the base for links in emails). Run `scripts/setup-email.sh` to set them up; it writes them to `.env` and reminds you to set them on the production host.
- **Development** prints each email, links included, to the `npm run dev` console. `APP_URL` defaults to `http://localhost:3000`.
- **Tests** use the in-memory fake in `test/mailer.ts`, which keeps sent emails in `sent`; `linkToken` pulls the token out of a link.
