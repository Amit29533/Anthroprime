/* ════════════════════════════════════════════════════════
   ANTHROPRIME — SHARED SITE SYSTEM (behaviour)
════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  var body = document.body;
  var TRANSITION_MS = 480;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  var fineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- dark mode toggle ----------
     The theme itself is already applied to <html data-theme> by the
     small inline snippet in each page's <head> (runs before first
     paint, so there's no flash of the wrong theme). This block only
     needs to: build the visible toggle button and wire up switching. */
  var THEME_KEY = 'ap-theme';
  var root = document.documentElement;

  function currentTheme(){
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function setTheme(theme){
    root.setAttribute('data-theme', theme);
    try{ localStorage.setItem(THEME_KEY, theme); }catch(e){}
    var btn = document.querySelector('.theme-toggle');
    if(btn){ btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false'); }
  }

  var siteRight = document.querySelector('.site-right');
  if(siteRight && !siteRight.querySelector('.theme-toggle')){
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'theme-toggle';
    toggle.setAttribute('aria-label', 'Toggle dark mode');
    toggle.setAttribute('aria-pressed', currentTheme() === 'dark' ? 'true' : 'false');
    toggle.innerHTML =
      '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M4.5 12H2M22 12h-2.5M6 6l1.8 1.8M16.2 16.2 18 18M18 6l-1.8 1.8M7.8 16.2 6 18"/></svg>' +
      '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.7 6.7 0 0 0 10.7 10.7Z"/></svg>';
    var burgerBtn = siteRight.querySelector('.site-burger');
    var ctaLink = siteRight.querySelector('.site-cta');
    siteRight.insertBefore(toggle, ctaLink ? ctaLink.nextSibling : (burgerBtn || null));
    toggle.addEventListener('click', function(){
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });
  }

  // Keep every open tab/page in sync if the user flips the toggle elsewhere.
  window.addEventListener('storage', function(e){
    if(e.key === THEME_KEY && e.newValue){ root.setAttribute('data-theme', e.newValue); }
  });

  /* ---------- entrance reveal on load ---------- */
  function playEntrance(){
    body.classList.remove('is-leaving');
    body.classList.add('is-entering');
    window.setTimeout(function(){ body.classList.remove('is-entering'); }, 700);
  }
  playEntrance();
  window.addEventListener('pageshow', function(e){
    if(e.persisted){ playEntrance(); }
  });

  /* ---------- header: scrolled shadow + progress bar ---------- */
  var header = document.querySelector('.site-header');
  var progress = document.getElementById('site-progress');

  function onScroll(){
    if(header){
      if(window.scrollY > 8){ header.classList.add('is-scrolled'); }
      else{ header.classList.remove('is-scrolled'); }
    }
    if(progress){
      var doc = document.documentElement;
      var max = (doc.scrollHeight - doc.clientHeight) || 1;
      var pct = Math.min(100, (window.scrollY / max) * 100);
      progress.style.width = pct + '%';
    }
  }
  document.addEventListener('scroll', onScroll, {passive:true});
  onScroll();

  /* ---------- initial load sweep on the progress bar ----------
     A quick, honest "page is ready" sweep on first paint, then the
     bar hands off to the scroll-position behaviour above. Skipped
     entirely for reduced-motion users. */
  if(progress && !reduceMotion){
    progress.classList.add('is-loading');
    progress.style.width = '18%';
    window.setTimeout(function(){ progress.style.width = '62%'; }, 120);
    window.addEventListener('load', function(){
      progress.style.width = '100%';
      window.setTimeout(function(){
        progress.classList.remove('is-loading');
        onScroll();
      }, 260);
    }, {once:true});
  }

  /* ---------- mobile menu ---------- */
  var burger = document.querySelector('.site-burger');
  var links  = document.querySelector('.site-links');

  function closeMenu(){
    if(burger) burger.classList.remove('is-open');
    if(links) links.classList.remove('is-open');
    body.style.overflow = '';
  }
  if(burger && links){
    burger.addEventListener('click', function(){
      var open = links.classList.toggle('is-open');
      burger.classList.toggle('is-open', open);
      body.style.overflow = open ? 'hidden' : '';
    });
    links.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){ closeMenu(); });
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape') closeMenu();
    });
    window.addEventListener('resize', function(){
      if(window.innerWidth > 900) closeMenu();
    });
  }

  /* ---------- helpers: robust "same page" detection ----------
     Raw filename comparison (e.g. "index.html" === "index.html") breaks
     the moment a host normalizes URLs differently than your local dev
     server does — e.g. Netlify serving the homepage at "/" instead of
     "/index.html", trailing slashes, or pretty-URL rewrites. When that
     mismatch happens, a same-page anchor link like "index.html#approach"
     gets treated as a cross-page link: the navy wipe overlay plays, then
     window.location.href is set to a URL that only differs by hash — which
     the browser resolves as a same-document navigation (no reload), so the
     script that clears the overlay never runs again and the page is stuck
     navy until a manual refresh. Comparing normalized pathnames instead
     of raw filenames avoids that entirely. */
  function normalizedPageKey(pathname){
    var p = pathname.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
    if(p === '') p = '/';
    if(p.length > 1 && p.charAt(p.length - 1) === '/'){ p = p.slice(0, -1); }
    return p.toLowerCase();
  }
  var currentPageKey = normalizedPageKey(location.pathname);

  /* ---------- active nav link ---------- */
  document.querySelectorAll('.site-links a[href]').forEach(function(a){
    var hrefFile = a.getAttribute('href').split('#')[0];
    if(!hrefFile) return;
    var linked;
    try{ linked = new URL(hrefFile, location.href); } catch(e){ return; }
    if(linked.origin === location.origin && normalizedPageKey(linked.pathname) === currentPageKey){
      a.classList.add('is-active');
    }
  });

  /* ---------- page transitions between pages ---------- */
  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href]');
    if(!a) return;
    if(a.target === '_blank' || a.hasAttribute('download')) return;
    var href = a.getAttribute('href');
    if(!href || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return;
    if(/^https?:\/\//i.test(href)) return; // external

    var linkUrl;
    try{ linkUrl = new URL(href, location.href); } catch(err){ return; }
    if(linkUrl.origin !== location.origin) return; // external / different origin, let it navigate normally

    var hash = linkUrl.hash;
    var samePage = normalizedPageKey(linkUrl.pathname) === currentPageKey;

    if(samePage){
      // in-page anchor: let it scroll smoothly, no full transition
      if(hash){
        var target = document.getElementById(hash.slice(1));
        if(target){
          e.preventDefault();
          closeMenu();
          target.scrollIntoView({behavior:'smooth', block:'start'});
          history.pushState(null, '', hash);
        }
      }
      return;
    }

    // cross-page navigation: play wipe transition first
    e.preventDefault();
    closeMenu();
    body.classList.add('is-leaving');
    // Safety net: if for any reason the browser doesn't actually leave this
    // document (blocked navigation, same-document resolution, etc.), don't
    // let the wipe overlay stay stuck forever — clear it automatically.
    window.setTimeout(function(){
      body.classList.remove('is-leaving');
    }, TRANSITION_MS + 1200);
    window.setTimeout(function(){
      window.location.href = href;
    }, TRANSITION_MS);
  });

  /* ---------- scroll reveal ---------- */
  var revealEls = document.querySelectorAll('[data-reveal], [data-reveal-group]');
  if('IntersectionObserver' in window && revealEls.length){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, {threshold:0.14, rootMargin:'0px 0px -8% 0px'});
    revealEls.forEach(function(el){ io.observe(el); });
  } else {
    revealEls.forEach(function(el){ el.classList.add('in-view'); });
  }

  /* ---------- ambient network mesh background ----------
     Drifting nodes + connecting lines, drawn on a canvas layered
     behind any element carrying [data-mesh-bg]. Reads optional
     data-mesh-color / data-mesh-dot overrides for sections on a
     dark surface; defaults suit the cream/light hero surfaces. */
  var meshHosts = document.querySelectorAll('[data-mesh-bg]');
  if(meshHosts.length && !reduceMotion){
    meshHosts.forEach(function(host){
      var canvas = document.createElement('canvas');
      canvas.className = 'gh-mesh-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      host.insertBefore(canvas, host.firstChild);
      var ctx = canvas.getContext('2d');
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var isDark = currentTheme() === 'dark';
      var lineColor = host.getAttribute('data-mesh-color') ||
        (isDark ? 'rgba(212,218,240,0.14)' : 'rgba(26,39,68,0.16)');
      var dotColor  = host.getAttribute('data-mesh-dot') ||
        (isDark ? 'rgba(212,218,240,0.45)' : 'rgba(46,64,128,0.5)');
      var w = 0, h = 0, nodes = [], linkDist = 130, raf;

      function size(){
        w = host.clientWidth; h = host.clientHeight;
        canvas.width = Math.max(1, w * dpr);
        canvas.height = Math.max(1, h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      function makeNodes(){
        var count = Math.max(12, Math.min(40, Math.round((w * h) / 26000)));
        nodes = [];
        for(var i = 0; i < count; i++){
          nodes.push({
            x: Math.random() * w, y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.16, vy: (Math.random() - 0.5) * 0.16
          });
        }
      }
      size(); makeNodes();

      if('ResizeObserver' in window){
        new ResizeObserver(function(){ size(); makeNodes(); }).observe(host);
      } else {
        window.addEventListener('resize', function(){ size(); makeNodes(); });
      }

      function frame(){
        ctx.clearRect(0, 0, w, h);
        nodes.forEach(function(n){
          n.x += n.vx; n.y += n.vy;
          if(n.x < 0 || n.x > w) n.vx *= -1;
          if(n.y < 0 || n.y > h) n.vy *= -1;
        });
        for(var i = 0; i < nodes.length; i++){
          for(var j = i + 1; j < nodes.length; j++){
            var dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
            var d = Math.sqrt(dx * dx + dy * dy);
            if(d < linkDist){
              ctx.strokeStyle = lineColor;
              ctx.globalAlpha = (1 - d / linkDist) * 0.6;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(nodes[i].x, nodes[i].y);
              ctx.lineTo(nodes[j].x, nodes[j].y);
              ctx.stroke();
            }
          }
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = dotColor;
        nodes.forEach(function(n){
          ctx.beginPath();
          ctx.arc(n.x, n.y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        });
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);

      document.addEventListener('visibilitychange', function(){
        if(document.hidden){ cancelAnimationFrame(raf); }
        else { raf = requestAnimationFrame(frame); }
      });
    });
  }

  /* ════════════════════════════════════════════════════════
     INTERACTIVE LAYER — cursor, card spotlights, magnetism,
     hero parallax. All skipped for touch input and for people
     who've asked for reduced motion.
  ════════════════════════════════════════════════════════ */
  if(fineHover && !isCoarsePointer && !reduceMotion){

    /* ---------- custom cursor: dot + trailing ring ---------- */
    var cDot = document.createElement('div');
    var cRing = document.createElement('div');
    cDot.className = 'gh-cursor-dot';
    cRing.className = 'gh-cursor-ring';
    body.appendChild(cDot);
    body.appendChild(cRing);
    body.classList.add('gh-has-cursor');

    var mx = -100, my = -100;      // true pointer position
    var rx = -100, ry = -100;      // ring's eased position
    var cursorActive = false;

    window.addEventListener('mousemove', function(e){
      mx = e.clientX; my = e.clientY;
      cDot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0) translate(-50%,-50%)';
      if(!cursorActive){
        cursorActive = true;
        cDot.style.opacity = '1';
        cRing.style.opacity = '1';
      }
    }, {passive:true});

    window.addEventListener('mouseleave', function(){
      cDot.style.opacity = '0';
      cRing.style.opacity = '0';
    });

    function easeCursor(){
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      cRing.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0) translate(-50%,-50%)';
      requestAnimationFrame(easeCursor);
    }
    requestAnimationFrame(easeCursor);

    var hoverTargets = 'a, button, .site-cta, .btn-solid, .btn-text, .cta-btn, [class*="-card"], .site-burger, input, textarea, select, [role="button"]';
    document.addEventListener('mouseover', function(e){
      if(e.target.closest(hoverTargets)) body.classList.add('gh-cursor-hover');
    });
    document.addEventListener('mouseout', function(e){
      if(e.target.closest(hoverTargets)) body.classList.remove('gh-cursor-hover');
    });
    document.addEventListener('mousedown', function(){ body.classList.add('gh-cursor-down'); });
    document.addEventListener('mouseup', function(){ body.classList.remove('gh-cursor-down'); });

    /* ---------- card spotlight: soft light that tracks the pointer ---------- */
    var cardEls = document.querySelectorAll('[class*="-card"]');
    cardEls.forEach(function(card){
      // Skip small inline bits that merely contain "-card" as a class
      // substring (e.g. .service-card-arrow is a "Learn more →" label,
      // not a card surface) rather than an actual card container.
      if(card.tagName === 'SPAN' || /arrow|num|label|icon|tag/i.test(card.className)) return;
      var cs = getComputedStyle(card);
      if(cs.display === 'inline' || card.offsetWidth < 80 || card.offsetHeight < 40) return;
      if(cs.position === 'static'){ card.style.position = 'relative'; }
      var glow = document.createElement('span');
      glow.className = 'gh-spot-glow';
      glow.setAttribute('aria-hidden', 'true');
      card.appendChild(glow);

      card.addEventListener('mousemove', function(e){
        var r = card.getBoundingClientRect();
        var px = ((e.clientX - r.left) / r.width) * 100;
        var py = ((e.clientY - r.top) / r.height) * 100;
        card.style.setProperty('--spot-x', px + '%');
        card.style.setProperty('--spot-y', py + '%');
      }, {passive:true});
      card.addEventListener('mouseenter', function(){ card.classList.add('gh-spotlighting'); });
      card.addEventListener('mouseleave', function(){ card.classList.remove('gh-spotlighting'); });
    });

    /* ---------- magnetic buttons: nudge toward the pointer, spring back ---------- */
    var magnetEls = document.querySelectorAll('.site-cta, .btn-solid, .cta-btn, .service-hero-cta');
    magnetEls.forEach(function(btn){
      btn.classList.add('gh-magnetic');
      btn.addEventListener('mousemove', function(e){
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) * 0.28;
        var dy = (e.clientY - (r.top + r.height / 2)) * 0.32;
        btn.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      }, {passive:true});
      btn.addEventListener('mouseleave', function(){ btn.style.transform = ''; });
    });

    /* ---------- hero parallax: the orbit diagram drifts with the pointer ---------- */
    var hero = document.querySelector('.hero');
    var orbit = document.querySelector('.hero-orbit');
    var ring = document.querySelector('.hero-ring');
    if(hero && (orbit || ring)){
      hero.addEventListener('mousemove', function(e){
        var r = hero.getBoundingClientRect();
        var px = ((e.clientX - r.left) / r.width - 0.5) * 2;   // -1..1
        var py = ((e.clientY - r.top) / r.height - 0.5) * 2;
        if(orbit){ orbit.style.transform = 'translateY(-50%) translate(' + (px * -10) + 'px,' + (py * -8) + 'px)'; }
        if(ring){ ring.style.transform = 'translateY(-50%) translate(' + (px * -14) + 'px,' + (py * -11) + 'px)'; }
      }, {passive:true});
      hero.addEventListener('mouseleave', function(){
        if(orbit){ orbit.style.transform = ''; }
        if(ring){ ring.style.transform = ''; }
      });
    }
  }

})();
