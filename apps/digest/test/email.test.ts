import { describe, expect, it } from 'vitest';
import { createSources } from '../src/main.ts';
import { normalize } from '../src/normalize/normalize.ts';
import {
  alertItems,
  dkimPassDomains,
  MAX_ITEMS_PER_MAIL,
  type MailMessage,
} from '../src/sources/alerts.ts';
import {
  emailSource,
  htmlPart,
  LOOKBACK_DAYS,
  readImapConfig,
  type Mailbox,
} from '../src/sources/email.ts';

const now = new Date('2026-11-20T06:00:00Z');
const date = new Date('2026-11-19T18:30:00Z');
/** A mail whose From domain also passed DKIM (what a genuine alert looks like), unless `dkim` overrides it. */
const mail = (
  from: string,
  html: string,
  dkim = [from.slice(from.indexOf('@') + 1)],
): MailMessage => ({
  from,
  dkimDomains: dkim,
  date,
  html,
});

// Synthetic, anonymised alert layouts: image link + title link + button per vacancy, tracking params.
const WORKUA = `
<table><tr><td>
  <a href="https://www.work.ua/jobs/7123456/?utm_source=alert&amp;utm_medium=email"><img src="logo.png"></a>
  <a href="https://www.work.ua/jobs/7123456/?utm_source=alert"><b>Senior Node.js</b> Developer &amp; Team</a>
  <p>Example Co · Дистанційно · 120 000 грн</p>
  <a href="https://www.work.ua/jobs/7123456/?utm_source=alert">Переглянути</a>
</td></tr><tr><td>
  <a href="https://www.work.ua/ru/jobs/7000001/">Full-stack розробник (React, Node.js)</a>
  <a href="https://www.work.ua/jobs/by-category/it/">Усі вакансії</a>
  <a href="https://djinni.co/jobs/1-x/">Not a Work.ua link</a>
</td></tr></table>`;

describe('alertItems', () => {
  it('turns each vacancy link into one item with a canonical url and the descriptive title', () => {
    expect(alertItems(mail('alerts@work.ua', WORKUA))).toEqual([
      {
        source: 'workua',
        sourceId: '7123456',
        url: 'https://www.work.ua/jobs/7123456/',
        title: 'Senior Node.js Developer & Team',
        publishedAt: '2026-11-19T18:30:00.000Z',
      },
      {
        source: 'workua',
        sourceId: '7000001',
        url: 'https://www.work.ua/jobs/7000001/',
        title: 'Full-stack розробник (React, Node.js)',
        publishedAt: '2026-11-19T18:30:00.000Z',
      },
    ]);
  });
  it('unwraps tracking redirects that carry the target url-encoded', () => {
    const target = encodeURIComponent('https://robota.ua/company123/vacancy456?utm_source=mail');
    const html = `<a href="https://click.mailer.example/r?u=${target}&amp;sig=abc">Backend Engineer (TypeScript)</a>`;
    expect(alertItems(mail('no-reply@email.robota.ua', html))).toEqual([
      expect.objectContaining({
        source: 'robotaua',
        sourceId: '456',
        url: 'https://robota.ua/company123/vacancy456',
        title: 'Backend Engineer (TypeScript)',
      }),
    ]);
  });
  it('reads LinkedIn job links with and without a slug', () => {
    const html = `
      <a href="https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=x&amp;refId=y">Senior Full Stack Engineer</a>
      <a href="https://www.linkedin.com/jobs/view/senior-backend-developer-at-example-4099999999">Senior Backend Developer</a>
      <a href="https://www.linkedin.com/comm/jobs/view/4012345678/">View job</a>`;
    expect(
      alertItems(mail('jobalerts-noreply@linkedin.com', html)).map((i) => [i.sourceId, i.title]),
    ).toEqual([
      ['4012345678', 'Senior Full Stack Engineer'],
      ['4099999999', 'Senior Backend Developer'],
    ]);
  });
  it('ignores mail from other senders and vacancies with only button/image links', () => {
    expect(alertItems(mail('someone@example.com', WORKUA))).toEqual([]);
    expect(alertItems(mail('spoof@notwork.ua', WORKUA))).toEqual([]);
    const buttons =
      '<a href="https://www.work.ua/jobs/7123456/"><img src="x"></a><a href="https://www.work.ua/jobs/7123456/">Переглянути</a>';
    expect(alertItems(mail('alerts@work.ua', buttons))).toEqual([]);
  });
  it('normalizes into vacancies with a site-scoped id', () => {
    const [v] = alertItems(mail('alerts@work.ua', WORKUA)).map((r) => normalize(r, now));
    expect(v).toMatchObject({
      id: 'workua:7123456',
      source: 'workua',
      url: 'https://www.work.ua/jobs/7123456',
      publishedAt: date,
      location: { remote: 'unknown' },
    });
  });
  it('stays linear on hostile html', () => {
    const start = performance.now();
    alertItems(mail('alerts@work.ua', '<a '.repeat(300_000)));
    alertItems(mail('alerts@work.ua', `<a href="x">${'<'.repeat(500_000)}</a>`.repeat(2)));
    alertItems(
      mail(
        'alerts@work.ua',
        `<a href="https://www.linkedin.com/jobs/view/${'1-'.repeat(2000)}">x</a>`,
      ),
    );
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('alertItems — authenticity and limits', () => {
  it('drops mail with a forged From (no DKIM pass for the site domain)', () => {
    expect(alertItems(mail('alerts@work.ua', WORKUA, []))).toEqual([]);
    expect(alertItems(mail('alerts@work.ua', WORKUA, ['attacker.example']))).toEqual([]);
    expect(alertItems(mail('alerts@work.ua', WORKUA, ['mail.work.ua']))).toHaveLength(2);
  });
  it(`keeps at most ${MAX_ITEMS_PER_MAIL} vacancies per mail`, () => {
    const html = Array.from(
      { length: MAX_ITEMS_PER_MAIL + 20 },
      (_, i) => `<a href="https://www.work.ua/jobs/${1_000_000 + i}/">Node.js Developer ${i}</a>`,
    ).join('');
    expect(alertItems(mail('alerts@work.ua', html))).toHaveLength(MAX_ITEMS_PER_MAIL);
  });
  it('keeps link text aligned after characters that grow when lower-cased', () => {
    const html = `<p>${'İ'.repeat(50)}</p><a href="https://www.work.ua/jobs/7123456/">Node.js Developer</a>`;
    expect(alertItems(mail('alerts@work.ua', html)).map((i) => i.title)).toEqual([
      'Node.js Developer',
    ]);
  });
});

describe('dkimPassDomains', () => {
  it('reads dkim=pass domains from the topmost Authentication-Results only', () => {
    const headers = [
      'Authentication-Results: mx.google.com;',
      '       dkim=pass header.i=@work.ua header.s=s1 header.b=abc;',
      '       dkim=fail header.d=other.example;',
      '       spf=pass smtp.mailfrom=work.ua',
      'Authentication-Results: forged.example; dkim=pass header.d=linkedin.com',
      '',
    ].join('\r\n');
    expect(dkimPassDomains(headers, 'mx.google.com')).toEqual(['work.ua']);
  });
  it('accepts header.d and returns nothing without the header', () => {
    expect(
      dkimPassDomains(
        'Authentication-Results: mx.google.com; dkim=pass (2048-bit) header.d=LinkedIn.com',
        'mx.google.com',
      ),
    ).toEqual(['linkedin.com']);
    expect(dkimPassDomains('Subject: hi\r\n', 'mx.google.com')).toEqual([]);
    expect(dkimPassDomains('', 'mx.google.com')).toEqual([]);
  });
  it('ignores clauses smuggled in through quoted strings or comments', () => {
    const smuggled = [
      'Authentication-Results: mx.google.com;',
      '       dkim=fail header.d=evil.example;',
      '       spf=neutral (google.com: x;dkim=pass header.d=work.ua) smtp.mailfrom="x;dkim=pass header.d=work.ua"@evil.example',
    ].join('\r\n');
    expect(dkimPassDomains(smuggled, 'mx.google.com')).toEqual([]);
  });
  it('trusts only the expected receiving server', () => {
    const other = 'Authentication-Results: attacker.example; dkim=pass header.d=work.ua';
    expect(dkimPassDomains(other, 'mx.google.com')).toEqual([]);
    expect(dkimPassDomains(other, 'attacker.example')).toEqual(['work.ua']);
  });
});

describe('htmlPart', () => {
  it('finds the html part of a multipart message, skipping attachments', () => {
    expect(
      htmlPart({
        type: 'multipart/mixed',
        childNodes: [
          {
            type: 'multipart/alternative',
            childNodes: [
              { part: '1.1', type: 'text/plain' },
              { part: '1.2', type: 'text/html' },
            ],
          },
          { part: '2', type: 'text/html', disposition: 'attachment' },
        ],
      }),
    ).toBe('1.2');
  });
  it('uses part 1 for a single-part html message and nothing for plain text', () => {
    expect(htmlPart({ type: 'text/html' })).toBe('1');
    expect(htmlPart({ type: 'text/plain' })).toBeUndefined();
    expect(htmlPart(undefined)).toBeUndefined();
  });
});

describe('readImapConfig', () => {
  it('requires credentials and never echoes them', () => {
    expect(() => readImapConfig({ IMAP_USER: 'box@example.com' })).toThrow(
      'email: IMAP_USER and IMAP_PASSWORD must be set',
    );
    expect(() => readImapConfig({ IMAP_PASSWORD: 'secret-pass' })).toThrow(
      'email: IMAP_USER and IMAP_PASSWORD must be set',
    );
  });
  it('defaults to Gmail over TLS port 993 and validates the port', () => {
    expect(readImapConfig({ IMAP_USER: 'box@example.com', IMAP_PASSWORD: 'p' })).toEqual({
      host: 'imap.gmail.com',
      port: 993,
      user: 'box@example.com',
      password: 'p',
      authservId: 'mx.google.com',
    });
    expect(() => readImapConfig({ IMAP_USER: 'u', IMAP_PASSWORD: 'p', IMAP_PORT: 'x' })).toThrow(
      /IMAP_PORT/,
    );
  });
});

describe('emailSource', () => {
  it(`reads mails from the last ${LOOKBACK_DAYS} days and parses each`, async () => {
    const calls: Date[] = [];
    const mailbox: Mailbox = {
      messagesSince: async (since) => {
        calls.push(since);
        return [mail('alerts@work.ua', WORKUA), mail('other@example.com', WORKUA)];
      },
    };
    const items = await emailSource(mailbox, now).fetch();
    expect(calls).toEqual([new Date('2026-11-17T06:00:00Z')]);
    expect(items.map((i) => i.sourceId)).toEqual(['7123456', '7000001']);
  });
  it('is created from env by name, without connecting', () => {
    expect(() => createSources(['email'], false, {}, now)).toThrow(/IMAP_USER/);
    const env = { IMAP_USER: 'box@example.com', IMAP_PASSWORD: 'p' };
    expect(createSources(['email', 'email'], false, env, now).map((s) => s.name)).toEqual([
      'email',
    ]);
  });
});
