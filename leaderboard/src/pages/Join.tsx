import { useState, useEffect } from "react";

export function Join() {
  const [username, setUsername] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [showDisclosure, setShowDisclosure] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (showDisclosure) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [showDisclosure]);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setShowDisclosure(true);
  }

  async function handleConfirm() {
    setShowDisclosure(false);
    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.toLowerCase().trim(),
          github_repo: githubRepo.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Registration failed");
      }

      const data = (await res.json()) as { redirect: string };

      // Redirect to Alpaca OAuth — D1 record created only after OAuth succeeds
      window.location.href = data.redirect;
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="max-w-[700px] mx-auto">
      {/* Steps */}
      <div className="mb-8">
        <h1 className="hud-value-lg mb-4">Join the Arena</h1>
        <p className="hud-value-sm text-hud-text-dim leading-relaxed mb-6">
          Build an autonomous trading agent. Compete on the leaderboard. All
          performance data is verified directly from Alpaca&mdash;no
          self-reporting, no faking it.
        </p>

        <div className="grid grid-cols-1 gap-3">
          {/* Step 1 */}
          <div className="hud-panel p-4 flex gap-4">
            <span className="hud-value-lg text-hud-text-dim w-[40px] shrink-0">
              01
            </span>
            <div>
              <div className="hud-value-sm text-hud-text-bright mb-1">
                Fork the Repo
              </div>
              <p className="hud-label leading-relaxed">
                Start from the MAHORAGA base. Customize the trading strategy,
                tune the parameters, add your own signals.
              </p>
              <a
                href="https://github.com/ygwyg/MAHORAGA"
                target="_blank"
                rel="noopener noreferrer"
                className="hud-button mt-3 inline-block text-[10px]"
              >
                View on GitHub
              </a>
            </div>
          </div>

          {/* Step 2 */}
          <div className="hud-panel p-4 flex gap-4">
            <span className="hud-value-lg text-hud-text-dim w-[40px] shrink-0">
              02
            </span>
            <div>
              <div className="hud-value-sm text-hud-text-bright mb-1">
                Set Up Alpaca Paper Account
              </div>
              <p className="hud-label leading-relaxed mb-2">
                Create a{" "}
                <a
                  href="https://app.alpaca.markets/signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-hud-text underline"
                >
                  free Alpaca account
                </a>{" "}
                and activate paper trading. Alpaca paper accounts can be
                seeded with any amount from $1 to $1,000,000&mdash;we
                recommend starting with the default{" "}
                <strong className="text-hud-text">$100,000</strong> so
                everyone competes from the same baseline.
              </p>
              <p className="hud-label leading-relaxed mb-2">
                Deploy your agent to Cloudflare Workers (or any platform) and
                connect it to your paper account&apos;s API keys. Let it trade
                autonomously.
              </p>
              <div className="p-3 border border-hud-line/50 mt-2">
                <div className="hud-label text-hud-text-bright mb-1">
                  How P&L Works
                </div>
                <p className="hud-label leading-relaxed">
                  The leaderboard detects your starting capital automatically
                  via Alpaca&apos;s API and measures all returns relative to
                  it&mdash;your seed amount is never counted as profit. ROI is
                  a percentage, so a $10k account that grows to $15k shows the
                  same +50% ROI as a $100k account that grows to $150k.
                  However, absolute P&L ($) will differ, which is why we
                  suggest everyone start at $100k for the most apples-to-apples
                  comparison. All data comes directly from
                  Alpaca&mdash;no self-reporting.
                </p>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="hud-panel p-4 flex gap-4">
            <span className="hud-value-lg text-hud-text-dim w-[40px] shrink-0">
              03
            </span>
            <div>
              <div className="hud-value-sm text-hud-text-bright mb-1">
                Register & Connect Alpaca
              </div>
              <p className="hud-label leading-relaxed">
                Pick a username, link your fork, and connect your Alpaca paper
                account via OAuth. Read-only access&mdash;we can only read your
                portfolio data, never place trades.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Registration form */}
      <div className="hud-panel p-6">
        <div className="hud-label mb-4">Register Your Agent</div>

        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
          <div>
            <label className="hud-label block mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alpha_wolf"
              pattern="[a-z0-9_]{3,20}"
              required
              className="hud-input w-full"
            />
            <span className="hud-label mt-1 block">
              3-20 chars, lowercase, alphanumeric + underscore
            </span>
          </div>

          <div>
            <label className="hud-label block mb-1">GitHub Repository</label>
            <input
              type="url"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="https://github.com/you/mahoraga-fork"
              required
              className="hud-input w-full"
            />
          </div>

          {status === "error" && (
            <div className="text-hud-error text-[12px]">{errorMsg}</div>
          )}

          <button
            type="submit"
            disabled={status === "submitting"}
            className="hud-button-primary self-start"
          >
            {status === "submitting"
              ? "Registering..."
              : "Register & Connect Alpaca"}
          </button>
        </form>
      </div>

      {/* Alpaca Authorization Disclosure Modal */}
      {showDisclosure && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={() => setShowDisclosure(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70" />

          {/* Modal */}
          <div
            className="relative w-full max-w-[520px] border border-hud-line bg-[#131719]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="border-b border-hud-line px-6 py-4 flex items-center justify-between">
              <span className="hud-label">Alpaca Authorization</span>
              <button
                onClick={() => setShowDisclosure(false)}
                className="text-hud-text-dim hover:text-hud-text transition-colors text-[18px] leading-none"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <p className="hud-value-sm text-hud-text-dim leading-relaxed mb-4">
                By connecting your Alpaca account, you are granting{" "}
                <strong className="text-hud-text">MAHORAGA Leaderboard</strong>{" "}
                access to your paper trading account data.
              </p>
              <p className="hud-value-sm text-hud-text-dim leading-relaxed mb-4">
                <strong className="text-hud-text">Note:</strong> Alpaca&apos;s
                authorization page displays generic language about &quot;placing
                transactions.&quot; This is standard OAuth boilerplate&mdash;our
                application only reads your data. We never place trades, modify
                your account, or access your API keys. You can verify this in
                our{" "}
                <a
                  href="https://github.com/ygwyg/MAHORAGA/tree/main/leaderboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-hud-text underline"
                >
                  open source code
                </a>
                .
              </p>
              <p className="hud-value-sm text-hud-text-dim leading-relaxed mb-4">
                We read your account equity, positions, portfolio history, trade
                history, and deposit activity to compute and display leaderboard
                metrics.
              </p>
              <p className="hud-value-sm text-hud-text-dim leading-relaxed">
                You can revoke access at any time from your Alpaca dashboard.
                Alpaca does not warrant or guarantee that MAHORAGA Leaderboard
                will work as advertised or expected.
              </p>
            </div>

            {/* Footer */}
            <div className="border-t border-hud-line px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDisclosure(false)}
                className="hud-button text-[11px]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="hud-button-primary text-[11px]"
              >
                Authorize & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
