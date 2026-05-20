import LegalLayout, { H2, H3, P, UL } from '../components/layout/LegalLayout';

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="20 May 2026">
      <P>
        These Terms of Service (the &quot;Terms&quot;) govern your use of Scheduly
        (the &quot;Service&quot;), a social media management platform operated by
        Dark Matter Media (Pty) Ltd (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).
        By accessing or using the Service, you agree to be bound by these Terms.
        If you do not agree, do not use the Service.
      </P>

      <H2>1. The Service</H2>
      <P>
        Scheduly lets you draft, schedule, and publish content to third-party
        social media platforms (including Meta&apos;s Facebook and Instagram,
        TikTok, and Google Ads), manage connected social accounts, and view
        analytics. The Service interacts with these platforms via their public
        APIs on your behalf, based on the permissions you grant during account
        connection.
      </P>

      <H2>2. Accounts</H2>
      <H3>2.1 Eligibility</H3>
      <P>
        You must be at least 18 years old, or the age of majority in your
        jurisdiction, to use the Service. You may only use the Service on behalf
        of an organisation if you have authority to bind that organisation to
        these Terms.
      </P>
      <H3>2.2 Your credentials</H3>
      <P>
        You are responsible for keeping your Scheduly login credentials, and any
        third-party tokens connected through the Service, secure. Notify us
        promptly of any suspected unauthorised access.
      </P>

      <H2>3. Acceptable use</H2>
      <P>You agree not to use the Service to:</P>
      <UL>
        <li>Post or distribute content that is illegal, defamatory, infringing, hateful, harassing, or violates a third party&apos;s rights;</li>
        <li>Spam, mass-publish identical content, or evade rate limits imposed by connected platforms;</li>
        <li>Impersonate any person or entity, or misrepresent your affiliation with one;</li>
        <li>Reverse engineer, scrape, or otherwise probe the Service or its underlying APIs in a manner inconsistent with normal use;</li>
        <li>Bypass authentication, authorisation, or any technical control of the Service.</li>
      </UL>

      <H2>4. Third-party integrations</H2>
      <P>
        Connecting a Facebook, Instagram, TikTok, Google, or other platform
        account to Scheduly authorises us to access that platform on your behalf
        through its official API, only within the scopes you approve. Your use
        of those platforms remains subject to their own terms and policies. We
        are not responsible for changes to, downtime of, or actions taken by
        third-party platforms.
      </P>

      <H2>5. Content ownership</H2>
      <P>
        You retain all rights to content you upload or publish through the
        Service. By using the Service, you grant us a limited, worldwide,
        royalty-free licence to store, transmit, transform (e.g. resize images
        to platform requirements), and distribute that content solely as
        necessary to operate the Service on your behalf.
      </P>

      <H2>6. Service availability</H2>
      <P>
        The Service is provided on an &quot;as is&quot; and &quot;as available&quot;
        basis. We do not warrant uninterrupted, error-free, or secure operation,
        and we do not warrant that publishing requests will always succeed —
        external platforms can rate-limit, change their APIs, or reject content
        for reasons outside our control.
      </P>

      <H2>7. Limitation of liability</H2>
      <P>
        To the maximum extent permitted by applicable law, neither party will be
        liable to the other for any indirect, incidental, consequential,
        special, or punitive damages, or for loss of profits, revenue, data, or
        goodwill, arising out of or in connection with the Service. Our total
        aggregate liability under these Terms in any twelve-month period will
        not exceed the amount you paid us for the Service in that period (or
        ZAR 1 000 if the Service is provided to you at no charge).
      </P>

      <H2>8. Termination</H2>
      <P>
        You may stop using the Service at any time by disconnecting your social
        accounts and contacting us to delete your Scheduly account. We may
        suspend or terminate your access if you breach these Terms or use the
        Service in a manner that risks harm to us, our users, or third parties.
      </P>

      <H2>9. Changes to these Terms</H2>
      <P>
        We may update these Terms from time to time. Material changes will be
        announced via the Service or by email. Continued use after the effective
        date of an update constitutes acceptance of the revised Terms.
      </P>

      <H2>10. Governing law</H2>
      <P>
        These Terms are governed by the laws of the Republic of South Africa.
        Any dispute arising from these Terms is subject to the exclusive
        jurisdiction of the South African courts.
      </P>

      <H2>11. Contact</H2>
      <P>
        Questions about these Terms? Email{' '}
        <a className="text-blue-600 hover:underline" href="mailto:hello@darkm.co.za">
          hello@darkm.co.za
        </a>
        .
      </P>
    </LegalLayout>
  );
}
