import LegalLayout, { H2, H3, P, UL } from '../components/layout/LegalLayout';

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="20 May 2026">
      <P>
        This Privacy Policy describes how Dark Matter Media (Pty) Ltd
        (&quot;we&quot;, &quot;us&quot;) collects, uses, and shares information
        when you use Scheduly (the &quot;Service&quot;).
      </P>

      <H2>1. Information we collect</H2>
      <H3>1.1 Account information</H3>
      <P>
        When you sign up we collect your name, email address, and a hashed
        password. If you are invited to a workspace we also collect your role
        and the team you belong to.
      </P>
      <H3>1.2 Social account connections</H3>
      <P>
        When you connect a social platform (Facebook Page, Instagram Business,
        TikTok, Google Ads, etc.) we receive and store:
      </P>
      <UL>
        <li>An OAuth access token and, where the platform supports it, a refresh token, both encrypted at rest;</li>
        <li>Basic profile information returned by the platform (name, username, profile picture URL, account/customer/page ID);</li>
        <li>The scopes you granted.</li>
      </UL>
      <H3>1.3 Content you create</H3>
      <P>
        Captions, hashtags, images, videos, schedules, and approval notes that
        you create within the Service. Uploaded media is stored in our
        object-storage bucket (Cloudflare R2) and is only served from URLs we
        provide to the destination platforms when you publish.
      </P>
      <H3>1.4 Performance data</H3>
      <P>
        Engagement and ad-performance metrics (impressions, reach, likes,
        comments, shares, spend, conversions, ROAS) pulled from the connected
        platform APIs for posts and campaigns you own.
      </P>
      <H3>1.5 Technical data</H3>
      <P>
        Standard request logs (IP address, user-agent, paths, timestamps,
        response status), used for security monitoring and debugging.
      </P>

      <H2>2. How we use information</H2>
      <UL>
        <li>To operate the Service: drafting, scheduling, and publishing your content to the platforms you authorise;</li>
        <li>To retrieve and display performance metrics for content and campaigns you own;</li>
        <li>To authenticate you, secure your account, and prevent abuse;</li>
        <li>To communicate with you about service updates, security notices, and (where you opt in) product news;</li>
        <li>To comply with legal obligations and respond to lawful requests.</li>
      </UL>

      <H2>3. Sharing</H2>
      <P>We share information only as needed to operate the Service:</P>
      <UL>
        <li><strong>Connected platforms (Meta, TikTok, Google, etc.):</strong> we send the content and metadata you ask us to publish, plus the OAuth token you authorised, via their official APIs. Their use of that data is governed by their own policies.</li>
        <li><strong>Service providers:</strong> we use Railway (application hosting), Vercel (frontend hosting), Cloudflare R2 (media storage), and email delivery providers, each under written data-processing terms.</li>
        <li><strong>Legal:</strong> we may disclose information when required by law, court order, or to defend legal claims.</li>
      </UL>
      <P>We do not sell personal information.</P>

      <H2>4. Data retention</H2>
      <P>
        We retain account, content, and metrics data for as long as your
        Scheduly workspace is active. When you disconnect a social account we
        revoke and delete its tokens; historical posts and metrics tied to that
        account remain visible in your workspace unless you delete them. When
        you delete your Scheduly account we permanently delete your personal
        data within 30 days, except where retention is required by law.
      </P>

      <H2>5. Security</H2>
      <P>
        OAuth tokens are encrypted at rest using AES-256. Traffic is served over
        TLS. Access to production systems is limited to authorised personnel
        and protected by multi-factor authentication. No system is perfectly
        secure — please use a strong, unique password and let us know
        immediately if you suspect your account is compromised.
      </P>

      <H2>6. Your rights</H2>
      <P>
        Depending on your jurisdiction (POPIA in South Africa, GDPR in the EEA
        or UK, CCPA/CPRA in California, and others), you may have the right to
        access, correct, port, restrict, or delete personal information we hold
        about you, and to object to certain processing. To exercise any of
        these rights, email{' '}
        <a className="text-blue-600 hover:underline" href="mailto:hello@darkm.co.za">
          hello@darkm.co.za
        </a>
        . We respond within the timeframe required by applicable law.
      </P>

      <H2>7. International transfers</H2>
      <P>
        We are based in South Africa and our infrastructure runs in the United
        States and the European Union. By using the Service you consent to your
        information being transferred to and processed in those regions, where
        privacy laws may differ from those in your country.
      </P>

      <H2>8. Cookies</H2>
      <P>
        We use a strictly necessary cookie / local-storage entry to keep you
        signed in. We do not use third-party tracking cookies for advertising.
      </P>

      <H2>9. Children</H2>
      <P>
        Scheduly is not directed to children under 16 and we do not knowingly
        collect personal information from them.
      </P>

      <H2>10. Changes</H2>
      <P>
        We may update this Privacy Policy from time to time. Material changes
        will be announced via the Service or by email; the &quot;Last
        updated&quot; date at the top of this page reflects the most recent
        revision.
      </P>

      <H2>11. Contact</H2>
      <P>
        For privacy questions or to exercise your rights, contact us at{' '}
        <a className="text-blue-600 hover:underline" href="mailto:hello@darkm.co.za">
          hello@darkm.co.za
        </a>
        .
      </P>
    </LegalLayout>
  );
}
