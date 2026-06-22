export const LANGUAGES = [
  { code: "fr", flag: "fr", name: "Français" },
  { code: "en", flag: "gb", name: "English" },
  { code: "es", flag: "es", name: "Español" },
  { code: "it", flag: "it", name: "Italiano" },
  { code: "de", flag: "de", name: "Deutsch" },
  { code: "ar", flag: "ar", name: "العربية" },
];

export function getLang() {
  return localStorage.getItem("lang") || "fr";
}

export function setLang(code) {
  localStorage.setItem("lang", code);
}

let _tr = null;

export async function loadTranslations(lang = getLang()) {
  try {
    const res = await fetch(`/translations/${lang}.json`);
    if (!res.ok) throw new Error();
    _tr = await res.json();
    return _tr;
  } catch {
    if (lang !== "fr") return loadTranslations("fr");
    _tr = null;
    return null;
  }
}

// Resolve a dot-separated key with optional {var} substitutions
export function t(key, vars = {}) {
  const value = _tr ? key.split(".").reduce((o, k) => o?.[k], _tr) : null;
  if (value == null) return `[${key}]`;
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), value);
}

export function applyTranslations(tr) {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const value = tr ? key.split(".").reduce((o, k) => o?.[k], tr) : null;
    el.textContent = value != null ? value : `[${key}]`;
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const key = el.dataset.i18nPh;
    const value = tr ? key.split(".").reduce((o, k) => o?.[k], tr) : null;
    el.placeholder = value != null ? value : `[${key}]`;
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.dataset.i18nHtml;
    const value = tr ? key.split(".").reduce((o, k) => o?.[k], tr) : null;
    el.innerHTML = value != null ? value : `[${key}]`;
  });
}

export function initTheme() {
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);

  const btn = document.getElementById("theme-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });
}

export function initLangSelector() {
  const currentCode = getLang();
  const current = LANGUAGES.find((l) => l.code === currentCode) || LANGUAGES[0];

  const flagImg = document.getElementById("lang-flag-current");
  if (flagImg) {
    flagImg.src = `/public/${current.flag}.png`;
    flagImg.alt = current.name;
  }

  const dropdown = document.getElementById("lang-dropdown");
  if (!dropdown) return;

  dropdown.innerHTML = LANGUAGES.map(
    (l) => `
    <button class="lang-option${l.code === currentCode ? " active" : ""}" data-lang="${l.code}">
      <img src="/public/${l.flag}.png" alt="${l.name}" class="lang-flag">
      <span>${l.name}</span>
    </button>
  `,
  ).join("");

  dropdown.querySelectorAll(".lang-option").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setLang(btn.dataset.lang);
      window.location.reload();
    });
  });

  document.getElementById("lang-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
  });

  document.addEventListener("click", () => dropdown.classList.add("hidden"));
}
