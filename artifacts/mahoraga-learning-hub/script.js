const SOURCE_FILES = [
  "index.html",
  "trading-101.html",
  "alpaca-101.html",
  "mahoraga-system.html",
  "launch-plan.html",
  "styles.css",
  "script.js",
  "favicon.svg"
];

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}

async function copySourceForAI() {
  const chunks = [];

  for (const file of SOURCE_FILES) {
    try {
      const response = await fetch(file, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      chunks.push(`===== ${file} =====\n${text}`);
    } catch (error) {
      chunks.push(`===== ${file} =====\nUnable to fetch ${file}: ${error.message}`);
    }
  }

  const payload = [
    "MAHORAGA Learning Hub source bundle",
    "Public-safe educational artifact. No secrets are included.",
    "",
    chunks.join("\n\n")
  ].join("\n");

  try {
    await navigator.clipboard.writeText(payload);
    showToast("Copied the full artifact source bundle for AI.");
  } catch {
    const area = document.createElement("textarea");
    area.value = payload;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    showToast("Copied source bundle using fallback clipboard mode.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-copy-source]").forEach((button) => {
    button.addEventListener("click", copySourceForAI);
  });
});
