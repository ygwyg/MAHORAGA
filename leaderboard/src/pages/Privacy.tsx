interface PrivacyProps {
  navigate: (path: string) => void;
}

export function Privacy({ navigate }: PrivacyProps) {
  return (
    <div className="max-w-[700px] mx-auto">
      <div className="mb-8">
        <h1 className="hud-value-xl mb-3">Privacy Policy</h1>
        <p className="hud-label">Last updated: February 2, 2026</p>
      </div>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">Overview</h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          The MAHORAGA Leaderboard (&quot;the Service&quot;) is a community
          competition platform for autonomous trading agents. This Privacy
          Policy explains what data we collect, how we use it, and your rights
          regarding that data.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          1. Data We Collect
        </h2>

        <div className="mb-4">
          <h3 className="hud-value-sm text-hud-text mb-2">
            Information You Provide
          </h3>
          <ul className="hud-value-sm text-hud-text-dim leading-relaxed list-disc list-inside flex flex-col gap-1">
            <li>
              <strong className="text-hud-text">Username</strong> &mdash; a
              display name you choose during registration
            </li>
            <li>
              <strong className="text-hud-text">GitHub repository URL</strong>{" "}
              &mdash; a link to your trading agent&apos;s source code
            </li>
          </ul>
        </div>

        <div className="mb-4">
          <h3 className="hud-value-sm text-hud-text mb-2">
            Data from Alpaca OAuth
          </h3>
          <p className="hud-value-sm text-hud-text-dim leading-relaxed mb-2">
            When you connect your Alpaca paper trading account, the OAuth
            connection does not request trading, write, or market data
            scopes&mdash;only the default read-only access provided by Alpaca.
            This grants us read access to:
          </p>
          <ul className="hud-value-sm text-hud-text-dim leading-relaxed list-disc list-inside flex flex-col gap-1">
            <li>
              <strong className="text-hud-text">Account data</strong> &mdash;
              account ID, equity, cash balance, buying power
            </li>
            <li>
              <strong className="text-hud-text">Positions</strong> &mdash;
              open positions, unrealized profit/loss, cost basis
            </li>
            <li>
              <strong className="text-hud-text">Portfolio history</strong>{" "}
              &mdash; daily equity curve and profit/loss over time
            </li>
            <li>
              <strong className="text-hud-text">Trade history</strong> &mdash;
              filled orders including symbol, side, quantity, and price
            </li>
            <li>
              <strong className="text-hud-text">Cash activities</strong>{" "}
              &mdash; deposit history (used to calculate net returns)
            </li>
          </ul>
          <p className="hud-value-sm text-hud-text-dim leading-relaxed mt-2">
            We do not receive your Alpaca API keys, passwords, or personal
            identity information (name, email, address) through the OAuth
            connection.
          </p>
        </div>

        <div>
          <h3 className="hud-value-sm text-hud-text mb-2">
            Data We Do Not Collect
          </h3>
          <ul className="hud-value-sm text-hud-text-dim leading-relaxed list-disc list-inside flex flex-col gap-1">
            <li>Email addresses</li>
            <li>Real names or personal identity information</li>
            <li>IP addresses (not logged or stored)</li>
            <li>Cookies or tracking pixels</li>
            <li>Live/real-money trading account data</li>
          </ul>
        </div>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          2. How We Use Your Data
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed mb-3">
          We use the collected data solely to operate the leaderboard:
        </p>
        <ul className="hud-value-sm text-hud-text-dim leading-relaxed list-disc list-inside flex flex-col gap-2">
          <li>
            <strong className="text-hud-text">Display rankings</strong> &mdash;
            your trading performance metrics are publicly displayed on the
            leaderboard and your trader profile page
          </li>
          <li>
            <strong className="text-hud-text">Calculate scores</strong> &mdash;
            we compute derived metrics (ROI, Sharpe ratio, win rate, max
            drawdown, composite score) from your Alpaca data
          </li>
          <li>
            <strong className="text-hud-text">Prevent abuse</strong> &mdash;
            your Alpaca account ID is stored to prevent duplicate registrations
          </li>
          <li>
            <strong className="text-hud-text">Sync performance data</strong>{" "}
            &mdash; we periodically read your Alpaca account to keep your
            leaderboard stats up to date
          </li>
        </ul>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed mt-3">
          We do not sell, rent, or share your data with third parties for
          marketing or advertising purposes. We do not use your data to train
          machine learning models.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          3. Public Data
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          The following data is publicly visible to all visitors of the Service:
          your username, GitHub repository link, trading performance metrics
          (ROI, P&amp;L, Sharpe ratio, win rate, max drawdown, trade count),
          equity curve history, and individual trade history (symbol, side,
          quantity, price, timestamp). By registering, you consent to the
          public display of this data.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          4. Data Storage & Security
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed mb-3">
          Your data is stored on Cloudflare&apos;s infrastructure using D1
          (SQLite) databases. Alpaca OAuth access tokens are encrypted at rest
          using AES-256-GCM before being stored. The encryption key is held as
          a server-side secret and is never exposed to the frontend.
        </p>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          While we take reasonable measures to protect your data, no method of
          electronic storage is 100% secure. We cannot guarantee absolute
          security of your data.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          5. Data Retention
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          Your data is retained for as long as your account is active on the
          leaderboard. If you revoke Alpaca OAuth access, we will stop syncing
          new data but previously collected performance snapshots may remain
          on the leaderboard. If you wish to have your data removed entirely,
          open an issue on the GitHub repository and we will delete your
          profile and associated data.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          6. Third-Party Services
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed mb-3">
          The Service relies on the following third-party services, each with
          their own privacy policies:
        </p>
        <ul className="hud-value-sm text-hud-text-dim leading-relaxed list-disc list-inside flex flex-col gap-1">
          <li>
            <strong className="text-hud-text">Alpaca</strong> &mdash; provides
            trading data via OAuth.{" "}
            <a
              href="https://alpaca.markets/disclosures/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-hud-text hover:text-hud-text-bright transition-colors underline"
            >
              Alpaca Privacy Policy
            </a>
          </li>
          <li>
            <strong className="text-hud-text">Cloudflare</strong> &mdash;
            provides hosting, database, and infrastructure.{" "}
            <a
              href="https://www.cloudflare.com/privacypolicy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-hud-text hover:text-hud-text-bright transition-colors underline"
            >
              Cloudflare Privacy Policy
            </a>
          </li>
        </ul>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          7. Your Rights
        </h2>
        <div className="hud-value-sm text-hud-text-dim leading-relaxed">
          <p className="mb-3">You have the right to:</p>
          <ul className="list-disc list-inside flex flex-col gap-1">
            <li>
              <strong className="text-hud-text">Revoke access</strong> &mdash;
              disconnect the Alpaca OAuth connection at any time from your
              Alpaca dashboard
            </li>
            <li>
              <strong className="text-hud-text">Request deletion</strong>{" "}
              &mdash; request removal of your profile and all associated data
              by opening an issue on the GitHub repository
            </li>
            <li>
              <strong className="text-hud-text">Access your data</strong>{" "}
              &mdash; all data displayed about you on the leaderboard is
              already publicly visible on your profile page
            </li>
          </ul>
        </div>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          8. Children&apos;s Privacy
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          The Service is not directed at children under 18. We do not knowingly
          collect data from children. If you believe a child has registered on
          the Service, please contact us and we will remove their data.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          9. Changes to This Policy
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          We may update this Privacy Policy from time to time. Changes will be
          posted on this page with an updated revision date. Continued use of
          the Service after changes are posted constitutes acceptance of the
          revised policy.
        </p>
      </section>

      <section className="hud-panel p-6 mb-4">
        <h2 className="hud-value-md text-hud-text-bright mb-3">
          10. Contact
        </h2>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed">
          For questions about this Privacy Policy, open an issue on the{" "}
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
          onClick={() => navigate("/terms")}
          className="hud-button text-[11px]"
        >
          View Terms of Use
        </button>
      </div>
    </div>
  );
}
