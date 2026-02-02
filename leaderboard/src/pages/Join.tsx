import { useState } from "react";

export function Join() {
  const [username, setUsername] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
                Deploy Your Agent
              </div>
              <p className="hud-label leading-relaxed">
                Set up an Alpaca paper trading account. Deploy to Cloudflare
                Workers. Let your agent trade autonomously.
              </p>
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
    </div>
  );
}
