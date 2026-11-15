/* 《山河武俠》閱讀器 */
(function () {
  "use strict";

  var KEY = {
    theme: "shanhe.theme",
    font: "shanhe.fontSize",
    progress: "shanhe.progress",
  };
  var THEMES = { sepia: "紙色", light: "淺色", dark: "深色" };
  var FONT_MIN = 16;
  var FONT_MAX = 28;
  var FONT_DEFAULT = 20;
  var FONT_STEP = 2;

  function safeGet(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }

  function safeSet(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  }

  function getTheme() {
    var t = safeGet(KEY.theme);
    return THEMES[t] ? t : "sepia";
  }

  function getFontSize() {
    var n = parseInt(safeGet(KEY.font), 10);
    if (!n || n < FONT_MIN || n > FONT_MAX) return FONT_DEFAULT;
    return n;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    safeSet(KEY.theme, theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var cs = getComputedStyle(document.documentElement);
      meta.setAttribute("content", cs.getPropertyValue("--theme-color").trim() || "#f3e6c8");
    }
    document.querySelectorAll("[data-theme-choice]").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-theme-choice") === theme);
    });
  }

  function applyFont(size) {
    document.documentElement.style.setProperty("--fs", size + "px");
    safeSet(KEY.font, String(size));
    var label = document.getElementById("font-val");
    if (label) label.textContent = size + " px";
  }

  function loadProgress() {
    try {
      var raw = safeGet(KEY.progress);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || !parseInt(p.n, 10)) return null;
      p.n = parseInt(p.n, 10);
      return p;
    } catch (e) {
      return null;
    }
  }

  function saveProgress(n, title, label) {
    var el = document.scrollingElement || document.documentElement;
    var max = el.scrollHeight - el.clientHeight;
    var ratio = max > 0 ? el.scrollTop / max : 0;
    safeSet(
      KEY.progress,
      JSON.stringify({
        n: n,
        ratio: ratio,
        title: title || "",
        label: label || "",
        t: Date.now(),
      })
    );
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function formatInline(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  function renderBlocks(blocks) {
    return (blocks || [])
      .map(function (b) {
        if (b.type === "hr") return '<hr class="scene-break">';
        if (b.type === "end") return '<p class="chapter-end">' + escapeHtml(b.text) + "</p>";
        if (b.type === "quote") {
          var inner = (b.paras || [])
            .map(function (p) {
              return "<p>" + formatInline(p) + "</p>";
            })
            .join("");
          return '<blockquote class="letter">' + inner + "</blockquote>";
        }
        return "<p>" + formatInline(b.text || "") + "</p>";
      })
      .join("");
  }

  function $(id) {
    return document.getElementById(id);
  }

  function initIndex() {
    var p = loadProgress();
    var card = $("continue-card");
    if (card && p && p.n) {
      var name = (p.label || "第" + p.n + "章") + (p.title ? "　" + p.title : "");
      var titleEl = card.querySelector(".card-title");
      if (titleEl) titleEl.textContent = name;
      card.setAttribute("href", "./chapter.html?n=" + p.n);
      card.hidden = false;
    }
    var hint = $("homescreen-hint");
    if (hint) {
      var standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;
      hint.hidden = standalone;
    }
  }

  function chapterQuery() {
    var n = parseInt(new URLSearchParams(location.search).get("n"), 10);
    return n > 0 ? n : 0;
  }

  function setDisabled(el, on) {
    if (!el) return;
    if (el.tagName === "A") {
      el.classList.toggle("is-disabled", on);
      if (on) el.setAttribute("aria-disabled", "true");
      else el.removeAttribute("aria-disabled");
    } else {
      el.disabled = on;
    }
  }

  function initChapter() {
    var n = chapterQuery();
    var article = $("article");
    var status = $("status");
    var nameEl = $("chapter-name");

    if (!n) {
      if (status) {
        status.hidden = false;
        status.innerHTML = "找不到這一章。<br><a href=\"./index.html\">回到目錄</a>";
      }
      return;
    }

    Promise.all([
      fetch("./data/chapters.json").then(function (r) {
        if (!r.ok) throw new Error("index");
        return r.json();
      }),
      fetch("./data/ch" + n + ".json").then(function (r) {
        if (!r.ok) throw new Error("missing");
        return r.json();
      }),
    ])
      .then(function (pair) {
        var index = pair[0];
        var ch = pair[1];
        var heading = ch.heading || (ch.label || "") + (ch.title ? "　" + ch.title : "");
        document.title = heading + " · 山河武俠";
        if (nameEl) nameEl.textContent = heading;
        if (article) {
          article.innerHTML = "<h1>" + escapeHtml(heading) + "</h1>" + renderBlocks(ch.blocks);
        }
        if (status) status.hidden = true;

        var prev = $("btn-prev");
        var next = $("btn-next");
        var prevBottom = $("btn-prev-bottom");
        var nextBottom = $("btn-next-bottom");
        var hasPrev = n > 1 && index.chapters.some(function (c) { return c.n === n - 1; });
        var hasNext = index.chapters.some(function (c) { return c.n === n + 1; });
        [prev, prevBottom].forEach(function (el) {
          if (!el) return;
          el.setAttribute("href", "./chapter.html?n=" + (n - 1));
          setDisabled(el, !hasPrev);
        });
        [next, nextBottom].forEach(function (el) {
          if (!el) return;
          el.setAttribute("href", "./chapter.html?n=" + (n + 1));
          setDisabled(el, !hasNext);
        });

        var p = loadProgress();
        if (p && p.n === n && typeof p.ratio === "number" && p.ratio > 0) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              var el = document.scrollingElement || document.documentElement;
              var max = el.scrollHeight - el.clientHeight;
              if (max > 0) el.scrollTop = max * p.ratio;
            });
          });
        }

        var save = function () {
          saveProgress(n, ch.title, ch.label);
        };
        save();
        var ticking = false;
        window.addEventListener(
          "scroll",
          function () {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function () {
              save();
              ticking = false;
            });
          },
          { passive: true }
        );
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "hidden") save();
        });
        window.addEventListener("pagehide", save);

        document.addEventListener("keydown", function (ev) {
          if (ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return;
          var tag = (ev.target && ev.target.tagName) || "";
          if (tag === "INPUT" || tag === "TEXTAREA") return;
          if (ev.key === "ArrowLeft" && hasPrev) {
            location.href = "./chapter.html?n=" + (n - 1);
          } else if (ev.key === "ArrowRight" && hasNext) {
            location.href = "./chapter.html?n=" + (n + 1);
          }
        });
      })
      .catch(function () {
        if (status) {
          status.hidden = false;
          status.innerHTML =
            "這一章尚未公開，或讀取失敗。<br><a href=\"./index.html\">回到目錄</a>";
        }
      });

    var backdrop = $("panel-backdrop");
    var panel = $("settings");
    var openBtn = $("btn-settings");

    function openPanel() {
      if (panel) panel.hidden = false;
      if (backdrop) backdrop.hidden = false;
    }
    function closePanel() {
      if (panel) panel.hidden = true;
      if (backdrop) backdrop.hidden = true;
    }

    if (openBtn) openBtn.addEventListener("click", openPanel);
    if (backdrop) backdrop.addEventListener("click", closePanel);
    document.querySelectorAll("[data-theme-choice]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyTheme(btn.getAttribute("data-theme-choice"));
      });
    });
    var minus = $("font-minus");
    var plus = $("font-plus");
    if (minus)
      minus.addEventListener("click", function () {
        applyFont(Math.max(FONT_MIN, getFontSize() - FONT_STEP));
      });
    if (plus)
      plus.addEventListener("click", function () {
        applyFont(Math.min(FONT_MAX, getFontSize() + FONT_STEP));
      });
  }

  applyTheme(getTheme());
  applyFont(getFontSize());

  if (document.body.classList.contains("page-index")) initIndex();
  if (document.body.classList.contains("page-chapter")) initChapter();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }
})();
