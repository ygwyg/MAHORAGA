import clsx from "clsx";

interface HeaderProps {
  navigate: (path: string) => void;
  currentPage: string;
}

const links = [
  { label: "Leaderboard", path: "/", page: "leaderboard" },
  { label: "Join", path: "/join", page: "join" },
  { label: "About", path: "/about", page: "about" },
];

export function Header({ navigate, currentPage }: HeaderProps) {
  return (
    <header className="border-b border-hud-line px-4">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between h-[48px]">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          className="flex items-center gap-3"
        >
          <span className="text-[14px] font-medium tracking-[0.1em] text-hud-text-bright">
            MAHORAGA
          </span>
          <span className="text-[11px] tracking-[0.2em] text-hud-text-dim">
            //
          </span>
          <span className="text-[11px] tracking-[0.15em] text-hud-text-dim uppercase">
            Leaderboard
          </span>
        </a>

        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <a
              key={link.path}
              href={link.path}
              onClick={(e) => {
                e.preventDefault();
                navigate(link.path);
              }}
              className={clsx(
                "font-mono text-[11px] uppercase tracking-[0.1em] px-3 py-2 transition-colors duration-200",
                currentPage === link.page
                  ? "text-hud-text-bright"
                  : "text-hud-text-dim hover:text-hud-text"
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
