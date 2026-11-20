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
  var READ_DONE = 0.95;

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

  function clampRatio(r) {
    if (typeof r !== "number" || !isFinite(r)) return 0;
    if (r < 0) return 0;
    if (r > 1) return 1;
    return r;
  }

  function persistProgress(p) {
    safeSet(
      KEY.progress,
      JSON.stringify({
        n: p.n,
        ratio: clampRatio(p.ratio),
        title: p.title || "",
        label: p.label || "",
        t: p.t || Date.now(),
        read: p.read || {},
      })
    );
  }

  function loadProgress() {
    try {
      var raw = safeGet(KEY.progress);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || !parseInt(p.n, 10)) return null;
      p.n = parseInt(p.n, 10);
      p.ratio = clampRatio(p.ratio);
      var hasRead = p.read && typeof p.read === "object" && !Array.isArray(p.read);
      if (!hasRead) {
        p.read = {};
        for (var i = 1; i < p.n; i++) p.read[String(i)] = 1;
        p.read[String(p.n)] = p.ratio >= READ_DONE ? 1 : p.ratio;
        persistProgress(p);
      }
      return p;
    } catch (e) {
      return null;
    }
  }

  function readRatioOf(p, n) {
    if (!p || !p.read) return 0;
    return clampRatio(p.read[String(n)]);
  }

  function isFinished(p, n) {
    return readRatioOf(p, n) >= READ_DONE;
  }

  function chapterRatio() {
    var el = document.scrollingElement || document.documentElement;
    var max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return 1;
    return clampRatio(el.scrollTop / max);
  }

  function pct(ratio) {
    return Math.round(clampRatio(ratio) * 100);
  }

  function saveProgress(n, title, label) {
    var prev = loadProgress() || { read: {} };
    var ratio = chapterRatio();
    var read = prev.read || {};
    var prevMax = readRatioOf(prev, n);
    var stored = Math.max(prevMax, ratio >= READ_DONE ? 1 : ratio);
    read[String(n)] = stored;
    var data = {
      n: n,
      ratio: ratio,
      title: title || "",
      label: label || "",
      t: Date.now(),
      read: read,
    };
    persistProgress(data);
    return data;
  }

  function markChapterFinished(n, title, label) {
    var prev = loadProgress() || { read: {} };
    var read = prev.read || {};
    read[String(n)] = 1;
    persistProgress({
      n: n,
      ratio: prev.n === n ? Math.max(clampRatio(prev.ratio), READ_DONE) : 1,
      title: title || prev.title || "",
      label: label || prev.label || "",
      t: Date.now(),
      read: read,
    });
  }

  function updateChapterProgressUI(n, total, ratio) {
    var bar = $("read-progress-bar");
    var track = $("read-progress-track");
    var label = $("chapter-progress");
    var p = pct(ratio);
    if (bar) bar.style.width = p + "%";
    if (track) track.setAttribute("aria-valuenow", String(p));
    if (label && n) {
      var totalText = total > 0 ? String(total) : "—";
      label.textContent = "第" + n + "章／共" + totalText + "章・本章 " + p + "%";
    }
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
    var items = document.querySelectorAll(".batch li[data-n]");
    var total = items.length;
    var finished = 0;

    items.forEach(function (li) {
      var n = parseInt(li.getAttribute("data-n"), 10);
      var done = isFinished(p, n);
      if (done) finished += 1;
      li.classList.toggle("is-read", done);
      var mark = li.querySelector(".ch-mark");
      if (mark) mark.textContent = done ? "✓" : "";
      var current = p && p.n === n;
      li.classList.toggle("is-current", !!current);
      var link = li.querySelector("a");
      if (link) {
        if (current) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    });

    var card = $("continue-card");
    if (card && p && p.n) {
      var tocItem = $("toc-ch-" + p.n);
      var tocTitle = tocItem && tocItem.querySelector(".ch-title");
      var tocLabel = tocItem && tocItem.querySelector(".ch-label");
      var label = p.label || (tocLabel ? tocLabel.textContent.trim() : "") || "第" + p.n + "章";
      var title = p.title || (tocTitle ? tocTitle.textContent.trim() : "") || "";
      var name = label + (title ? "　" + title : "");
      var titleEl = $("continue-title");
      if (titleEl) titleEl.textContent = name + "（本章 " + pct(p.ratio) + "%）";

      var href = "./chapter.html?n=" + p.n;
      var btn = $("continue-btn");
      if (btn) btn.setAttribute("href", href);

      var overallRatio = total ? finished / total : 0;
      if (p.ratio < READ_DONE && tocItem) {
        overallRatio = total ? (finished + p.ratio) / total : 0;
      }
      var overallPct = Math.round(overallRatio * 100);
      var meta = $("overall-meta");
      if (meta) meta.textContent = "已讀 " + finished + "／共 " + total + " 章";
      var fill = $("overall-fill");
      if (fill) fill.style.width = overallPct + "%";
      var track = $("overall-track");
      if (track) track.setAttribute("aria-valuenow", String(overallPct));

      card.hidden = false;

      if (tocItem) {
        var details = tocItem.closest("details");
        if (details) details.open = true;
        requestAnimationFrame(function () {
          tocItem.scrollIntoView({ block: "center", behavior: "auto" });
        });
      }
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
        status.innerHTML = "找不到這一章。<br><a href=\"./toc.html\">回到目錄</a>";
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
        var total = (index.chapters && index.chapters.length) || 0;
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
          el.addEventListener("click", function () {
            markChapterFinished(n, ch.title, ch.label);
          });
        });

        var saved = loadProgress();
        if (saved && saved.n === n && typeof saved.ratio === "number" && saved.ratio > 0) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              var el = document.scrollingElement || document.documentElement;
              var max = el.scrollHeight - el.clientHeight;
              if (max > 0) el.scrollTop = max * saved.ratio;
              updateChapterProgressUI(n, total, chapterRatio());
            });
          });
        }

        var save = function () {
          saveProgress(n, ch.title, ch.label);
          updateChapterProgressUI(n, total, chapterRatio());
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
            markChapterFinished(n, ch.title, ch.label);
            location.href = "./chapter.html?n=" + (n + 1);
          }
        });
      })
      .catch(function () {
        if (status) {
          status.hidden = false;
          status.innerHTML =
            "這一章尚未公開，或讀取失敗。<br><a href=\"./toc.html\">回到目錄</a>";
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


  function initShelf() {
    var p = loadProgress();
    var book = document.querySelector('.book[data-book="shanhe"]');
    var bakedTotal = book ? parseInt(book.getAttribute("data-count"), 10) || 0 : 0;
    var card = $("shanhe-continue");

    function paint(total, resolved) {
      if (!card || !p || !p.n) return;
      var label = p.label || (resolved && resolved.label) || "第" + p.n + "章";
      var title = p.title || (resolved && resolved.title) || "";
      var name = label + (title ? "　" + title : "");
      var titleEl = $("continue-title");
      if (titleEl) titleEl.textContent = name + "（本章 " + pct(p.ratio) + "%）";

      var btn = $("continue-btn");
      if (btn) btn.setAttribute("href", "./chapter.html?n=" + p.n);

      var finished = 0;
      if (total > 0) {
        for (var i = 1; i <= total; i++) {
          if (isFinished(p, i)) finished += 1;
        }
      }
      var overallRatio = total ? finished / total : 0;
      if (p.ratio < READ_DONE && p.n >= 1 && p.n <= total) {
        overallRatio = total ? (finished + p.ratio) / total : 0;
      }
      var overallPct = Math.round(overallRatio * 100);
      var meta = $("overall-meta");
      if (meta) meta.textContent = "已讀 " + finished + "／共 " + total + " 章";
      var fill = $("overall-fill");
      if (fill) fill.style.width = overallPct + "%";
      var track = $("overall-track");
      if (track) track.setAttribute("aria-valuenow", String(overallPct));
      card.hidden = false;
    }

    paint(bakedTotal, null);

    fetch("./data/chapters.json")
      .then(function (r) {
        if (!r.ok) throw new Error("index");
        return r.json();
      })
      .then(function (index) {
        var total = (index.chapters && index.chapters.length) || bakedTotal;
        var resolved = null;
        if (p && p.n && index.chapters) {
          for (var i = 0; i < index.chapters.length; i++) {
            if (index.chapters[i].n === p.n) {
              resolved = index.chapters[i];
              break;
            }
          }
        }
        paint(total, resolved);
      })
      .catch(function () {});

    var hint = $("homescreen-hint");
    if (hint) {
      var standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;
      hint.hidden = standalone;
    }
  }

  applyTheme(getTheme());
  applyFont(getFontSize());

  if (document.body.classList.contains("page-index") || document.body.classList.contains("page-toc")) initIndex();
  if (document.body.classList.contains("page-shelf")) initShelf();
  if (document.body.classList.contains("page-chapter")) initChapter();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }
})();
