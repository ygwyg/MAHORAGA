interface TermsProps {
  navigate: (path: string) => void;
}

export function Terms({ navigate }: TermsProps) {
  return (
    <div className="max-w-[700px] mx-auto">
      <div className="mb-8">
        <h1 className="hud-value-xl mb-3">Terms of Use</h1>
        <p className="hud-label">Last updated: February 2, 2026</p>
      </div>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          1. Acceptance of Terms
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          By accessing or using the MAHORAGA Leaderboard (&quot;the Service&quot;),
          you agree to be bound by these Terms of Use. If you do not agree to
          these terms, do not use the Service.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          2. Description of Service
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed mb-3">
          The MAHORAGA Leaderboard is a community competition platform where
          participants register autonomous trading agents and have their Alpaca
          paper trading performance tracked and ranked. The Service connects to
          Alpaca via OAuth to read portfolio data and display verified
          performance metrics.
        </p>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          The Service is provided on an &quot;as is&quot; and &quot;as
          available&quot; basis. We reserve the right to modify, suspend, or
          discontinue the Service at any time without notice.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          3. Paper Trading Only
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed mb-3">
          The Service is designed exclusively for use with Alpaca paper trading
          accounts. No real money is involved. The leaderboard tracks simulated
          trading performance only.
        </p>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          Nothing on the Service constitutes financial advice, investment
          advice, trading advice, or any other sort of advice. You should not
          treat any of the content displayed on the Service as such. The
          Service does not recommend that any financial instrument should be
          bought, sold, or held by you.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          4. Alpaca OAuth Connection
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed mb-3">
          By connecting your Alpaca account, you authorize the Service to
          access your paper trading account data via OAuth. The OAuth
          connection does not request trading, write, or market data
          scopes&mdash;only the default read-only access provided by Alpaca.
          This includes account equity, positions, trade history, portfolio
          history, and deposit activity. The Service cannot place trades,
          modify your account settings, or access your API keys.
        </p>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          You may revoke this access at any time from your Alpaca dashboard.
          Revoking access will prevent the Service from updating your
          leaderboard data.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          5. User Accounts & Conduct
        </h2>
        <div className="hud-value-sm text-hud-text-dim leading-relaxed">
          <p className="mb-3">By using the Service, you agree to:</p>
          <ul className="list-disc list-inside flex flex-col gap-2">
            <li>
              Provide accurate information when registering (username, GitHub
              repository URL)
            </li>
            <li>Maintain only one account per person on the leaderboard</li>
            <li>
              Not attempt to manipulate rankings, game the scoring system, or
              register duplicate accounts
            </li>
            <li>
              Not interfere with or disrupt the Service or its infrastructure
            </li>
            <li>
              Not use the Service for any unlawful purpose
            </li>
          </ul>
          <p className="mt-3">
            We reserve the right to remove any account, hide any profile, or
            adjust rankings if we determine that a participant has violated
            these terms or is acting in bad faith.
          </p>
        </div>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          6. Intellectual Property
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed mb-3">
          The MAHORAGA Leaderboard is open-source software. The source code is
          available under the terms of its repository license. Your trading
          agent code remains your own&mdash;registering on the leaderboard does
          not grant us any rights to your code.
        </p>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          By linking your GitHub repository, you acknowledge that the
          repository URL will be publicly displayed on your leaderboard profile.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          7. Public Display of Data
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          By registering on the leaderboard, you agree that your username,
          linked GitHub repository, trading performance metrics (ROI, P&amp;L,
          Sharpe ratio, win rate, drawdown, trade count), equity curve, and
          trade history will be publicly visible to all visitors of the Service.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          8. Third-Party Services
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          The Service relies on third-party services including Alpaca (for
          trading data via OAuth) and Cloudflare (for hosting and
          infrastructure). Your use of the Service is also subject to the terms
          and policies of these third-party providers. We are not responsible
          for the availability, accuracy, or conduct of any third-party service.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          9. Limitation of Liability
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed mb-3">
          To the fullest extent permitted by law, the Service and its
          operators shall not be liable for any indirect, incidental, special,
          consequential, or punitive damages arising from your use of the
          Service. This includes but is not limited to damages arising from
          data loss, service interruptions, or inaccuracies in displayed data.
        </p>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          The Service does not guarantee the accuracy, completeness, or
          timeliness of any data displayed, including trading performance
          metrics sourced from Alpaca.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          10. Termination
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          We may suspend or terminate your access to the Service at any time,
          for any reason, without prior notice. You may stop using the Service
          at any time by revoking Alpaca OAuth access from your Alpaca
          dashboard. Upon termination, your profile may be hidden from the
          leaderboard and your stored data may be deleted.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          11. Changes to These Terms
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          We may update these Terms of Use from time to time. Changes will be
          posted on this page with an updated revision date. Continued use of
          the Service after changes are posted constitutes acceptance of the
          revised terms.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          12. Contact
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          For questions about these Terms of Use, open an issue on the{" "}
          <a
            href="https://github.com/ygwyg/MAHORAGA"
            target="_blank"
            rel="noopener noreferrer"
            className="text-hud-text hover:text-hud-text-bright transition-colors underline"
          >
            MAHORAGA GitHub repository
          </a>
          .
        </p>
      </section>

      <div className="text-center py-8">
        <button
          onClick={() => navigate("/privacy")}
          className="hud-button text-[11px]"
        >
          View Privacy Policy
        </button>
      </div>
    </div>
  );
}
