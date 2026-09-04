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
    // Add transition class for smooth theme switch
    root.classList.add('theme-transitioning');
    root.setAttribute('data-theme', theme);
    try{ localStorage.setItem(THEME_KEY, theme); }catch(e){}
    var btn = document.querySelector('.theme-toggle');
    if(btn){ btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false'); }
    // Remove transition class after animation completes
    setTimeout(function(){ root.classList.remove('theme-transitioning'); }, 500);
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
      var w = 0, h = 0, nodes = [], linkDist = 130, raf;
      var mx = -9999, my = -9999;
      function palette(){
        var isDark = currentTheme() === 'dark';
        return {
          line: host.getAttribute('data-mesh-color') ||
            (isDark ? 'rgba(212,218,240,0.16)' : 'rgba(26,39,68,0.16)'),
          dot: host.getAttribute('data-mesh-dot') ||
            (isDark ? 'rgba(212,218,240,0.5)' : 'rgba(46,64,128,0.5)')
        };
      }
      var colors = palette();
      host.addEventListener('pointermove', function(e){
        var r = host.getBoundingClientRect();
        mx = e.clientX - r.left; my = e.clientY - r.top;
      }, {passive:true});
      host.addEventListener('pointerleave', function(){ mx = -9999; my = -9999; });
      document.addEventListener('ap-theme-change', function(){ colors = palette(); });

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
          var ax = n.x - mx, ay = n.y - my;
          var ad = Math.sqrt(ax * ax + ay * ay) || 1;
          if(ad < 180){
            n.vx -= (ax / ad) * 0.018;
            n.vy -= (ay / ad) * 0.018;
          }
          n.vx *= 0.992; n.vy *= 0.992;
          if(Math.abs(n.vx) < 0.04) n.vx += (Math.random() - 0.5) * 0.02;
          if(Math.abs(n.vy) < 0.04) n.vy += (Math.random() - 0.5) * 0.02;
          n.x += n.vx; n.y += n.vy;
          if(n.x < 0 || n.x > w){ n.vx *= -1; n.x = Math.max(0, Math.min(w, n.x)); }
          if(n.y < 0 || n.y > h){ n.vy *= -1; n.y = Math.max(0, Math.min(h, n.y)); }
        });
        for(var i = 0; i < nodes.length; i++){
          for(var j = i + 1; j < nodes.length; j++){
            var dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
            var d = Math.sqrt(dx * dx + dy * dy);
            if(d < linkDist){
              ctx.strokeStyle = colors.line;
              ctx.globalAlpha = (1 - d / linkDist) * 0.65;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(nodes[i].x, nodes[i].y);
              ctx.lineTo(nodes[j].x, nodes[j].y);
              ctx.stroke();
            }
          }
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = colors.dot;
        nodes.forEach(function(n){
          ctx.beginPath();
          ctx.arc(n.x, n.y, 1.7, 0, Math.PI * 2);
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

  /* ════════════════════════════════════════════════════════
     BACK TO TOP BUTTON — injects and manages visibility.
  ════════════════════════════════════════════════════════ */
  if(!document.querySelector('.back-to-top')){
    var btt = document.createElement('button');
    btt.className = 'back-to-top';
    btt.setAttribute('aria-label', 'Back to top');
    btt.innerHTML = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
    btt.addEventListener('click', function(){
      window.scrollTo({top:0, behavior:'smooth'});
    });
    body.appendChild(btt);

    window.addEventListener('scroll', function(){
      if(window.scrollY > 600){
        btt.classList.add('visible');
      } else {
        btt.classList.remove('visible');
      }
    }, {passive:true});
  }

  /* ════════════════════════════════════════════════════════
     ANIMATED HEADING UNDERLINE — triggers on scroll into view.
  ════════════════════════════════════════════════════════ */
  var animHeadings = document.querySelectorAll('.animated-heading');
  if(animHeadings.length && 'IntersectionObserver' in window){
    var headIO = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('in-view');
          headIO.unobserve(entry.target);
        }
      });
    }, {threshold:0.5});
    animHeadings.forEach(function(el){ headIO.observe(el); });
  }

  /* ════════════════════════════════════════════════════════
     ANIMATED COUNTERS — numbers that count up when revealed.
     Any element with [data-count-to] will animate from 0 to
     the target value once it enters the viewport.
  ════════════════════════════════════════════════════════ */
  var countEls = document.querySelectorAll('[data-count-to]');
  if(countEls.length && 'IntersectionObserver' in window){
    var countIO = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseInt(el.getAttribute('data-count-to'), 10);
        var suffix = el.getAttribute('data-count-suffix') || '';
        var prefix = el.getAttribute('data-count-prefix') || '';
        var duration = 1600;
        var start = performance.now();
        function step(now){
          var elapsed = now - start;
          var progress = Math.min(elapsed / duration, 1);
          // ease out cubic
          var eased = 1 - Math.pow(1 - progress, 3);
          var current = Math.round(eased * target);
          el.textContent = prefix + current + suffix;
          if(progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        countIO.unobserve(el);
      });
    }, {threshold:0.3});
    countEls.forEach(function(el){ countIO.observe(el); });
  }

  /* ════════════════════════════════════════════════════════
     FADE-IN-UP on scroll — generic utility class.
     Add .fade-in-up to any element; it becomes .visible
     once it enters the viewport.
  ════════════════════════════════════════════════════════ */
  var fadeEls = document.querySelectorAll('.fade-in-up');
  if(fadeEls.length && 'IntersectionObserver' in window){
    var fadeIO = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('visible');
          fadeIO.unobserve(entry.target);
        }
      });
    }, {threshold:0.12, rootMargin:'0px 0px -6% 0px'});
    fadeEls.forEach(function(el){ fadeIO.observe(el); });
  }

  /* ════════════════════════════════════════════════════════
     SCROLL INDICATOR auto-hide — fades out once user scrolls.
  ════════════════════════════════════════════════════════ */
  var scrollInd = document.querySelector('.scroll-indicator');
  if(scrollInd){
    var scrollHidden = false;
    window.addEventListener('scroll', function(){
      if(!scrollHidden && window.scrollY > 80){
        scrollInd.style.opacity = '0';
        scrollInd.style.pointerEvents = 'none';
        scrollHidden = true;
      }
    }, {passive:true});
  }

  /* ════════════════════════════════════════════════════════
     STAGGERED REVEAL — elements with [data-stagger] get
     delayed reveal based on their index within parent.
  ════════════════════════════════════════════════════════ */
  var staggerParents = document.querySelectorAll('[data-stagger]');
  if(staggerParents.length && 'IntersectionObserver' in window){
    var staggerIO = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(!entry.isIntersecting) return;
        var children = entry.target.children;
        for(var i = 0; i < children.length; i++){
          (function(child, delay){
            setTimeout(function(){
              child.style.opacity = '1';
              child.style.transform = 'translateY(0)';
            }, delay);
          })(children[i], i * 120);
        }
        staggerIO.unobserve(entry.target);
      });
    }, {threshold:0.15});
    staggerParents.forEach(function(parent){
      for(var i = 0; i < parent.children.length; i++){
        parent.children[i].style.opacity = '0';
        parent.children[i].style.transform = 'translateY(20px)';
        parent.children[i].style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      }
      staggerIO.observe(parent);
    });
  }

  /* ════════════════════════════════════════════════════════
     TYPEWRITER EFFECT — elements with [data-typewriter]
     get their text typed out character by character.
  ════════════════════════════════════════════════════════ */
  var twEls = document.querySelectorAll('[data-typewriter]');
  if(twEls.length && !reduceMotion && 'IntersectionObserver' in window){
    var twIO = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(!entry.isIntersecting) return;
        var el = entry.target;
        var fullText = el.getAttribute('data-typewriter');
        el.textContent = '';
        el.style.borderRight = '2px solid var(--sp-accent, #b8a080)';
        var i = 0;
        var speed = 40;
        function typeChar(){
          if(i < fullText.length){
            el.textContent += fullText.charAt(i);
            i++;
            setTimeout(typeChar, speed + Math.random() * 30);
          } else {
            // Blink cursor then remove
            setTimeout(function(){
              el.style.borderRight = 'none';
            }, 2000);
          }
        }
        typeChar();
        twIO.unobserve(el);
      });
    }, {threshold:0.5});
    twEls.forEach(function(el){ twIO.observe(el); });
  }

  /* ════════════════════════════════════════════════════════
     SMOOTH PARALLAX on scroll — elements with [data-parallax]
     shift vertically at a fraction of the scroll speed.
  ════════════════════════════════════════════════════════ */
  var parallaxEls = document.querySelectorAll('[data-parallax]');
  if(parallaxEls.length && !reduceMotion){
    window.addEventListener('scroll', function(){
      var scrollY = window.scrollY;
      parallaxEls.forEach(function(el){
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.15;
        var rect = el.getBoundingClientRect();
        var offset = (scrollY - el.offsetTop) * speed;
        el.style.transform = 'translateY(' + offset + 'px)';
      });
    }, {passive:true});
  }

  /* ════════════════════════════════════════════════════════
     TILT EFFECT on cards — subtle 3D tilt on mousemove.
     Only for fine-pointer devices (desktop).
  ════════════════════════════════════════════════════════ */
  if(fineHover && !isCoarsePointer && !reduceMotion){
    var tiltCards = document.querySelectorAll('.cap-card, .industry-card, .framework-card');
    tiltCards.forEach(function(card){
      card.addEventListener('mousemove', function(e){
        var rect = card.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width - 0.5;
        var y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = 'perspective(600px) rotateY(' + (x * 4) + 'deg) rotateX(' + (-y * 4) + 'deg) translateY(-2px)';
      }, {passive:true});
      card.addEventListener('mouseleave', function(){
        card.style.transform = '';
      });
    });
  }

  /* ════════════════════════════════════════════════════════
     MODERN INTERACTIVE REFRESH
     Ambient aurora + cyber-grid + scanline + HUD chips are
     injected behind every hero, so each page inherits the
     same depth. Adds interactive diagram focus and shine.
  ════════════════════════════════════════════════════════ */

  /* ---------- theme broadcast ----------
     Let other modules know when the theme flips so they
     can refresh accents without a full page reload. */
  document.addEventListener('click', function(e){
    if(e.target.closest('.theme-toggle')){
      window.setTimeout(function(){
        document.dispatchEvent(new CustomEvent('ap-theme-change', {
          detail:{theme: currentTheme()}
        }));
      }, 60);
    }
  });

  /* ---------- ambient layered background writers ---------- */
  var ambientHosts = document.querySelectorAll('.hero, .services-hero, .prac-hero, .contact-hero');
  ambientHosts.forEach(function(host){
    if(host.querySelector('.site-aurora')) return;

    var aurora = document.createElement('div');
    aurora.className = 'site-aurora';
    aurora.setAttribute('aria-hidden','true');

    var grid = document.createElement('div');
    grid.className = 'site-grid';
    grid.setAttribute('aria-hidden','true');

    var noise = document.createElement('div');
    noise.className = 'site-noise';
    noise.setAttribute('aria-hidden','true');

    var scan = document.createElement('div');
    scan.className = 'site-scanline';
    scan.setAttribute('aria-hidden','true');

    host.insertBefore(scan, host.firstChild);
    host.insertBefore(noise, host.firstChild);
    host.insertBefore(grid, host.firstChild);
    host.insertBefore(aurora, host.firstChild);
  });

  /* ---------- floating HUD chips ---------- */
  var hudDefaults = {
    'services-hero': ['Security-first','AI-ready data mesh','Cloud native','Zero Trust'],
    'prac-hero': ['NIST CSF','Zero Trust','CIS Controls','MITRE ATT&CK'],
    'contact-hero': ['Response < 1 day','Senior humans only','No sales layer','In confidence']
  };
  var hudHosts = document.querySelectorAll('.hero, .services-hero, .prac-hero, .contact-hero');
  hudHosts.forEach(function(host){
    if(host.querySelector('.site-mesh-hud') || reduceMotion) return;
    var custom = (host.getAttribute('data-hud') || '').split('|').filter(Boolean);
    var list = custom.length ? custom : (hudDefaults[host.className.replace(/\s.*/,'')] || ['Human first','AI · Data · Cloud','Secure by design','Open systems']);
    var layer = document.createElement('div');
    layer.className = 'site-mesh-hud';
    layer.setAttribute('aria-hidden','true');
    list.slice(0,6).forEach(function(label){
      var chip = document.createElement('span');
      chip.className = 'mesh-chip';
      chip.innerHTML = '<span class="hud-dot"></span>' + label;
      layer.appendChild(chip);
    });
    host.appendChild(layer);
  });

  /* ---------- interactive diagram: hover focus / slow glow ---------- */
  var diagrams = document.querySelectorAll('.hero-diagram, .hero-orbit');
  diagrams.forEach(function(dg){
    var host = dg.closest('.hero, .services-hero, .prac-hero, .contact-hero') || dg.parentElement;
    if(!host) return;
    host.addEventListener('mousemove', function(e){
      var r = host.getBoundingClientRect();
      var px = ((e.clientX - r.left) / r.width);
      var py = ((e.clientY - r.top) / r.height);
      var dx = (px - 0.5) * 12;
      var dy = (py - 0.5) * 10;
      dg.style.transform = 'translateY(-50%) translate(' + dx + 'px,' + dy + 'px)';
      dg.style.filter = 'drop-shadow(0 0 22px rgba(114,136,214,.32)) drop-shadow(0 26px 60px rgba(26,39,68,.28))';
    }, {passive:true});
    host.addEventListener('mouseleave', function(){
      dg.style.transform = '';
      dg.style.filter = '';
    });
  });

  /* ---------- pointer shine on cards (adds to existing spotlight) ---------- */
  var shineCards = document.querySelectorAll('.cap-card, .service-card, .framework-card, .industry-card, .checklist-card, .pillar');
  shineCards.forEach(function(card){
    card.addEventListener('mousemove', function(e){
      var r = card.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      card.style.setProperty('--shine-x', x + 'px');
      card.style.setProperty('--shine-y', y + 'px');
    }, {passive:true});
  });

  /* ---------- click ripple (subtle) ---------- */
  if(fineHover && !reduceMotion){
    var rippleTargets = document.querySelectorAll('.btn-solid, .btn-navy, .btn-primary, .site-cta, .cta-btn, .cap-card, .service-card, .framework-card, .industry-card, .checklist-card');
    rippleTargets.forEach(function(el){
      el.addEventListener('pointerdown', function(e){
        var r = el.getBoundingClientRect();
        var x = e.clientX - r.left, y = e.clientY - r.top;
        var ripple = document.createElement('span');
        ripple.className = 'ap-ripple';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        el.appendChild(ripple);
        window.setTimeout(function(){ ripple.remove(); }, 800);
      });
    });
  }

})();

/* ════════════════════════════════════════════════════════
   LIVE, INTERACTIVE DIAGRAMS — AI · Cybersecurity · Data
   Builds each placeholder into a live SVG with telemetry,
   switchable domains, animated data packets, and clickable
   nodes. Completely replaces the old static hero SVGs.
════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- tiny icon library (paths drawn inside a -8..8 box) ---------- */
  function icon(type){
    switch(type){
      case 'database': return '<ellipse cx="0" cy="-4.5" rx="6" ry="2.4"/><path d="M-6 -4.5 V4.5 a6 2.4 0 0 0 12 0 V-4.5"/><path d="M-6 0 a6 2.4 0 0 0 12 0"/>';
      case 'brain': return '<circle cx="-3.5" cy="-3.5" r="2"/><circle cx="3" cy="-4.2" r="1.7"/><circle cx="5" cy="1" r="1.7"/><circle cx="-1" cy="4.5" r="1.7"/><path d="M-3.5 -3.5 L-1 4.5 M-3.5 -3.5 L3 -4.2 M-1 4.5 L5 1"/>';
      case 'chip': return '<rect x="-6" y="-6" width="12" height="12" rx="2"/><rect x="-3" y="-3" width="6" height="6" rx="1"/><path d="M-6 -9 v3 M0 -9 v3 M6 -9 v3 M-6 6 v3 M0 6 v3 M6 6 v3 M-9 -6 h3 M-9 0 h3 M-9 6 h3 M6 -6 h3 M6 0 h3 M6 6 h3"/>';
      case 'shield': return '<path d="M0 -7 L7 -4.5 V1 c0 4.4-3 8-7 9.2 C-3 9-7 5.4-7 1 V-4.5 Z"/><path d="M-3.5 1.5 l2.5 2.5 5-5"/>';
      case 'cloud': return '<path d="M-6 3.5 c-2.4 0-4-1.8-4-4s1.8-4.2 4.4-4.2c.6-2.6 2.9-4.4 5.6-4.4 2.8 0 5.1 2 5.6 4.7 1.9.2 3.4 1.8 3.4 3.8 0 2.1-1.7 3.9-3.9 3.9z"/>';
      case 'detect': return '<circle cx="-2" cy="-2" r="4"/><path d="M1 1 L5 5"/>';
      case 'response': return '<path d="M1 -7 h-6 l-3 6 h5 l-2 8 8-9 h-5"/>';
      case 'recovery': return '<path d="M0 -6 a6 6 0 0 1 5.9 4.8 M4 -4.7 L5.9 -1.2 M5.9 -1.2 L2.2 .1"/><path d="M0 6 a6 6 0 0 1 -5.9 -4.8 M-4 4.7 L-5.9 1.2 M-5.9 1.2 L-2.2 -.1"/>';
      case 'zero': return '<circle cx="0" cy="0" r="5"/><rect x="-6" y="-1" width="12" height="2" rx="1"/>';
      case 'oversight': return '<circle cx="0" cy="-3" r="2.4"/><path d="M-6 6 c1.2-3.4 3.4-5 6-5 s4.8 1.6 6 5"/>';
      case 'govern': return '<rect x="-6" y="-6" width="12" height="12" rx="2"/><path d="M-3.5 0 l2.2 2.4 5-5.4"/>';
      case 'learn': return '<path d="M-5 -3 C 0 -7 0 -7 5 -3 M-5 3 C 0 7 0 7 5 3 M-5 3 V-3 M5 3 V-3"/>';
      case 'source': return '<path d="M-6 6 V2 M-2 6 V-1 M2 6 V-4 M6 6 V-6"/>';
      case 'intel': return '<circle cx="0" cy="0" r="5"/><circle cx="0" cy="0" r="2"/><path d="M0 -7 V-9 M0 7 V9 M-7 0 H-9 M7 0 H9"/>';
      case 'pipeline': return '<path d="M-6 4 h4 v-3 h4 M-6 -4 h4 v3 h4"/>';
      case 'lake': return '<ellipse cx="0" cy="-4.5" rx="6" ry="2.4"/><path d="M-6 -4.5 V4.5 a6 2.4 0 0 0 12 0 V-4.5"/>';
      case 'insight': return '<path d="M-6 6 V2 M-2 6 V-1 M2 6 V-4 M6 6 V-6"/><path d="M-6 -5 H6"/>';
      case 'mesh': return '<circle cx="0" cy="0" r="1.7"/><path d="M-5 -4 h4 v4 h-4 z M1 -4 h4 v4 h-4 z M-5 1 h4 v4 h-4 z M1 1 h4 v4 h-4 z"/>';
      default: return '<circle cx="0" cy="0" r="3.5"/><circle cx="0" cy="0" r="1"/>';
    }
  }

  /* ---------- three live diagram configurations ---------- */
  var VIZ = {
    ai: {
      key:'ai', label:'AI Systems', abbr:'AI', sub:'Governed intelligence across the enterprise',
      coreLabel:'AI Core', coreSub:'Gov. Intelligence',
      nodes:[
        {id:'sources',  label:'Data Sources',  sub:'Ingest',    x:96,  y:104, ly:34,  icon:'source',  color:'#8ea0e0', detail:'Streams, APIs, documents and enterprise systems that feed every AI workload — unified, cleaned and versioned before use.'},
        {id:'models',   label:'Models & Agents', sub:'Train',    x:324, y:104, ly:34,  icon:'brain',   color:'#c9b190', detail:'Foundation and fine-tuned models plus orchestrated agents tested for accuracy, safety and cost before they touch production.'},
        {id:'oversight',label:'Human Oversight', sub:'Guard',    x:210, y:54,  ly:34,  icon:'oversight', color:'#9bb6e8', detail:'Humans stay in the loop for high-stakes decisions — approval gates, escalation paths and audit trials on every automated action.'},
        {id:'governance',label:'Governance & Controls', sub:'Comply', x:96, y:316, ly:-34, icon:'govern',  color:'#7d93e0', detail:'Model cards, data lineage, policy guardrails and regulator-ready controls that keep AI explainable, accountable and repeatable.'},
        {id:'inference',label:'Inference & Apps', sub:'Serve',    x:324, y:316, ly:-34, icon:'chip',     color:'#b8a080', detail:'Cloud-native inference serving with routing, caching and observability so AI products stay fast, resilient and observable.'},
        {id:'learning', label:'Continuous Learning', sub:'Evolve', x:210, y:366, ly:-34, icon:'learn',   color:'#aebcf0', detail:'Feedback loops, drift detection and retraining pipelines that keep models current without sacrificing stability or control.'}
      ],
      metrics:[
        {label:'Inference', unit:'req/s', val:1284, dec:0, j:36, flash:0},
        {label:'Accuracy', unit:'%', val:97.4, dec:1, j:.2, min:96, max:99.4, flash:0},
        {label:'Active Models', unit:'', val:24, dec:0, j:1, min:18, max:30, flash:0},
        {label:'GPU Util', unit:'%', val:68, dec:0, j:4, min:45, max:92, flash:0},
        {label:'Drift Alerts', unit:'', val:3, dec:0, j:1, min:0, max:12, flash:1},
        {label:'Avg Latency', unit:'ms', val:42, dec:0, j:6, min:18, max:95, flash:0}
      ],
      legend:[['#8ea0e0','Data'],['#c9b190','Models'],['#9bb6e8','Human'],['#7d93e0','Governance'],['#b8a080','Apps']]
    },
    cyber: {
      key:'cyber', label:'Cybersecurity', abbr:'CYB', sub:'Defence-in-depth across every layer',
      coreLabel:'SOC', coreSub:'Security Ops',
      nodes:[
        {id:'telemetry',label:'Telemetry', sub:'Sensors',  x:96,  y:104, ly:34,  icon:'source',  color:'#8ea0e0', detail:'Endpoint, network, cloud and identity telemetry ingested in real time so the SOC sees the whole attack surface, not fragments.'},
        {id:'detection',label:'Detection', sub:'Find',     x:324, y:104, ly:34,  icon:'detect',  color:'#c9b190', detail:'Correlation, UEBA and AI-assisted detection tuned to reduce noisy alerts and surface the signals that actually matter.'},
        {id:'intel',   label:'Threat Intel', sub:'Know',   x:210, y:54,  ly:34,  icon:'intel',   color:'#9bb6e8', detail:'Global threat intelligence and MITRE ATT&CK mapping that keeps detection and hunting aligned to real, current adversaries.'},
        {id:'zerotrust',label:'Zero Trust', sub:'Verify',  x:96,  y:316, ly:-34, icon:'zero',    color:'#7d93e0', detail:'Never trust, always verify — continuous identity verification, least privilege and micro-segmentation baked into every path.'},
        {id:'response',label:'Response', sub:'Act',        x:324, y:316, ly:-34, icon:'response', color:'#b8a080', detail:'Orchestrated containment, automated playbooks and human decision points that cut incident response time dramatically.'},
        {id:'recovery',label:'Recovery', sub:'Restore',    x:210, y:366, ly:-34, icon:'recovery', color:'#aebcf0', detail:'Backup, restore and business-continuity workflows tested and rehearsed so an attack compromises uptime, not trust.'}
      ],
      metrics:[
        {label:'Events', unit:'/s', val:15380, dec:0, j:1200, min:8000, max:24000, flash:0},
        {label:'Alerts', unit:'today', val:38, dec:0, j:2, min:8, max:75, flash:0},
        {label:'Blocked', unit:'', val:127, dec:0, j:4, min:70, max:220, flash:0},
        {label:'MTTD', unit:'min', val:6, dec:0, j:1, min:1, max:18, flash:0},
        {label:'Coverage', unit:'%', val:94, dec:0, j:1, min:82, max:99, flash:0},
        {label:'Open Cases', unit:'', val:11, dec:0, j:1, min:2, max:24, flash:1}
      ],
      legend:[['#8ea0e0','Sense'],['#c9b190','Detect'],['#9bb6e8','Intel'],['#7d93e0','Verify'],['#b8a080','Act']]
    },
    data: {
      key:'data', label:'Data & Analytics', abbr:'DAT', sub:'A trusted, real-time data fabric',
      coreLabel:'Data Core', coreSub:'Trusted Fabric',
      nodes:[
        {id:'sources', label:'Source Systems', sub:'Collect',  x:96,  y:104, ly:34,  icon:'database', color:'#8ea0e0', detail:'ERP, CRM, logs, IoT, documents and third-party feeds — connected without brittle point-to-point integrations.'},
        {id:'ingest',  label:'Ingestion',      sub:'Capture',  x:324, y:104, ly:34,  icon:'pipeline', color:'#c9b190', detail:'Real-time streaming and batch pipelines that land data quickly, idempotently and with full replay capability.'},
        {id:'govern',  label:'Governance',     sub:'Control',  x:210, y:54,  ly:34,  icon:'govern',   color:'#9bb6e8', detail:'Lineage, cataloguing, access policy and data-quality contracts that make enterprise data trustworthy and auditable.'},
        {id:'lake',    label:'Lakehouse',      sub:'Store',    x:96,  y:316, ly:-34, icon:'lake',    color:'#7d93e0', detail:'Open table formats, Delta/Iceberg-style lakehouses and structured stores that unify analytics and AI workloads.'},
        {id:'insight', label:'Insights & BI',  sub:'Visualise', x:324, y:316, ly:-34, icon:'insight', color:'#b8a080', detail:'Self-service dashboards, KPIs and embedded analytics that translate the fabric into decisions people can act on.'},
        {id:'mesh',    label:'Data Mesh',      sub:'Share',    x:210, y:366, ly:-34, icon:'mesh',     color:'#aebcf0', detail:'Domains own their data and expose governed products through a shared mesh — decentralised ownership, centralised trust.'}
      ],
      metrics:[
        {label:'Records', unit:'/s', val:86420, dec:0, j:5200, min:30000, max:130000, flash:0},
        {label:'Pipelines', unit:'', val:212, dec:0, j:2, min:150, max:280, flash:0},
        {label:'DQ Valid', unit:'%', val:99.2, dec:1, j:.1, min:97, max:99.9, flash:0},
        {label:'Queries', unit:'/s', val:540, dec:0, j:18, min:280, max:900, flash:0},
        {label:'Tables', unit:'', val:1873, dec:0, j:12, min:900, max:2200, flash:0},
        {label:'Freshness', unit:'min', val:3, dec:0, j:1, min:0, max:15, flash:1}
      ],
      legend:[['#8ea0e0','Collect'],['#c9b190','Capture'],['#9bb6e8','Govern'],['#7d93e0','Store'],['#b8a080','Decide']]
    }
  };

  /* ---------- format a rolling telemetry value ---------- */
  function fmt(metric, v){
    var s;
    if(typeof metric.dec !== 'undefined' && metric.dec > 0){ s = v.toFixed(metric.dec); }
    else{ s = Math.round(v).toLocaleString('en-US'); }
    return s;
  }
  function step(metric){
    var v = metric.val + Math.round((Math.random() - .5) * 2 * metric.j);
    if(typeof metric.min === 'number'){ v = Math.max(metric.min, v); }
    if(typeof metric.max === 'number'){ v = Math.min(metric.max, v); }
    return v;
  }

  /* ---------- build the SVG for a mode ---------- */
  function buildStage(cfg){
    var parts = [];
    parts.push('<svg class="lv-svg" viewBox="0 0 420 420" role="img" aria-label="' + cfg.label + ' live diagram" xmlns="http://www.w3.org/2000/svg">');
    parts.push('<defs>' +
      '<linearGradient id="lvCoreGrad" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#aebcf0"/><stop offset=".55" stop-color="#7288d6"/><stop offset="1" stop-color="#c9b190"/>' +
      '</linearGradient>' +
      '<linearGradient id="lvWaveGrad" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#8ea0e0" stop-opacity="0"/><stop offset=".5" stop-color="#c9b190" stop-opacity=".9"/><stop offset="1" stop-color="#8ea0e0" stop-opacity="0"/>' +
      '</linearGradient>' +
    '</defs>');
    for(var g=1; g<5; g++){
      var gx = 84 * g;
      if(gx < 420){ parts.push('<line class="lv-gridline" x1="'+gx+'" y1="0" x2="'+gx+'" y2="420"/>'); }
      if(gx < 420){ parts.push('<line class="lv-gridline" x1="0" y1="'+gx+'" x2="420" y2="'+gx+'"/>'); }
    }
    parts.push('<circle class="lv-orbit" cx="210" cy="210" r="174"/>');
    parts.push('<circle class="lv-orbit dash" cx="210" cy="210" r="146"/>');
    parts.push('<circle class="lv-orbit dash rev" cx="210" cy="210" r="104"/>');
    parts.push('<ellipse class="lv-orbit" cx="210" cy="210" rx="188" ry="66" transform="rotate(-22 210 210)"/>');

    // links from hub to each node
    cfg.nodes.forEach(function(n){
      var strong = (n.id === 'governance' || n.id === 'zerotrust' || n.id === 'govern');
      parts.push('<line class="lv-link' + (strong ? ' strong' : '') + '" x1="210" y1="210" x2="'+n.x+'" y2="'+n.y+'"/>');
    });

    // hub
    parts.push('<g class="lv-hub">' +
      '<circle class="lv-hub-circle" cx="210" cy="210" r="30"/>' +
      '<text class="lv-hub-label" x="210" y="214">' + cfg.coreLabel + '</text>' +
      '<text class="lv-hub-label" x="210" y="230" style="font-size:6.5px">' + cfg.coreSub + '</text>' +
    '</g>');
    parts.push('<circle class="lv-wave" cx="210" cy="210" r="58"/>');

    // nodes
    cfg.nodes.forEach(function(n){
      var iy = n.ly, sy = n.ly + (n.ly > 0 ? 11 : -11);
      parts.push('<g class="lv-node" data-node="'+n.id+'" tabindex="0" role="button" aria-label="'+n.label+'" transform="translate('+n.x+', '+n.y+')">' +
        '<circle class="lv-node-halo" r="27"/>' +
        '<circle class="lv-node-disc" r="17" style="stroke:'+n.color+';"/>' +
        '<g class="lv-node-icon" transform="translate(0,0)">' + icon(n.icon) + '</g>' +
        '<text class="lv-node-label" y="'+iy+'">' + n.label + '</text>' +
        '<text class="lv-node-sub" y="'+sy+'">' + n.sub + '</text>' +
      '</g>');
    });

    // moving data packets from hub to nodes
    cfg.nodes.forEach(function(n, i){
      var dx = n.x - 210, dy = n.y - 210;
      parts.push('<circle class="lv-pack" cx="210" cy="210" r="3" style="--dx:'+dx+'px;--dy:'+dy+'px;animation-delay:'+(i*0.42)+'s"/>');
    });

    parts.push('</svg>');
    return parts.join('');
  }

  /* ---------- build a full live-diagram card ---------- */
  function buildViz(host, cfg){
    host.classList.add('live-viz');
    host.setAttribute('role','region');
    host.setAttribute('aria-label', cfg.label + ' — live interactive diagram');

    var card = document.createElement('div');
    card.className = 'lv-card';

    var head = document.createElement('div');
    head.className = 'lv-head';
    head.innerHTML =
      '<span class="lv-icon">'+cfg.abbr+'</span>' +
      '<span><span class="lv-title">'+cfg.label+'</span><br><span class="lv-sub">'+cfg.sub+'</span></span>' +
      '<span class="lv-status"><span class="lv-dot"></span>Live</span>';
    card.appendChild(head);

    var tabs = document.createElement('div');
    tabs.className = 'lv-tabs';
    ['ai','cyber','data'].forEach(function(k){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lv-tab' + (k === cfg.key ? ' active' : '');
      b.setAttribute('data-mode', k);
      b.innerHTML = '<span>'+VIZ[k].label.replace(' & Analytics','').replace('Systems','')+'</span>';
      b.setAttribute('aria-pressed', k === cfg.key ? 'true' : 'false');
      tabs.appendChild(b);
    });
    card.appendChild(tabs);

    var stage = document.createElement('div');
    stage.className = 'lv-stage';
    var svgWrap = document.createElement('div');
    svgWrap.innerHTML = buildStage(cfg);
    stage.appendChild(svgWrap.firstChild);

    var detail = document.createElement('div');
    detail.className = 'lv-detail';
    detail.setAttribute('role','status');
    detail.innerHTML = '<button type="button" class="lv-detail-close" aria-label="Close detail">&#10005;</button><div class="lv-detail-title"></div><div class="lv-detail-body"></div>';
    stage.appendChild(detail);
    card.appendChild(stage);

    var readout = document.createElement('div');
    readout.className = 'lv-readout';
    readout.setAttribute('aria-live','polite');
    var metricEls = [];
    cfg.metrics.forEach(function(m){
      var cell = document.createElement('div');
      cell.className = 'lv-metric';
      cell.innerHTML = '<div class="lv-metric-label">'+m.label+'</div><div class="lv-metric-val">'+fmt(m,m.val)+(m.unit?'<small>'+m.unit+'</small>':'')+'</div>';
      readout.appendChild(cell);
      metricEls.push({el:cell, val:cell.querySelector('.lv-metric-val'), m:m});
    });
    card.appendChild(readout);

    var legend = document.createElement('div');
    legend.className = 'lv-legend';
    cfg.legend.forEach(function(l){
      var s = document.createElement('span');
      s.innerHTML = '<i style="background:'+l[0]+';box-shadow:0 0 6px '+l[0]+'"></i>'+l[1];
      legend.appendChild(s);
    });
    card.appendChild(legend);

    var hint = document.createElement('div');
    hint.className = 'lv-hint';
    hint.innerHTML = '<b>Click</b> any node for a focused explanation · <b>Switch</b> AI / Cyber / Data';
    card.appendChild(hint);

    host.appendChild(card);

    /* ---------- interactivity ---------- */
    var svg = stage.querySelector('.lv-svg');
    var detailEl = detail;
    var titleEl = detail.querySelector('.lv-detail-title');
    var bodyEl = detail.querySelector('.lv-detail-body');
    var currentActive = null;

    function showDetail(node){
      if(currentActive){ currentActive.classList.remove('is-active'); }
      currentActive = node;
      node.classList.add('is-active');
      titleEl.textContent = node.getAttribute('aria-label');
      bodyEl.textContent = node.__detail || '';
      detailEl.classList.add('show');
    }
    function hideDetail(){
      detailEl.classList.remove('show');
      if(currentActive){ currentActive.classList.remove('is-active'); currentActive = null; }
    }

    svg.querySelectorAll('.lv-node').forEach(function(node){
      var cfgNode = cfg.nodes.filter(function(n){ return n.id === node.getAttribute('data-node'); })[0];
      if(cfgNode){ node.__detail = cfgNode.detail; }
      node.addEventListener('click', function(){ showDetail(node); });
      node.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); showDetail(node); }
      });
    });
    detail.querySelector('.lv-detail-close').addEventListener('click', hideDetail);
    stage.addEventListener('click', function(e){ if(e.target === stage){ hideDetail(); } });

    // pointer parallax on the whole stage
    if(fineHover && !reduceMotion){
      stage.addEventListener('mousemove', function(e){
        var r = stage.getBoundingClientRect();
        var x = ((e.clientX - r.left) / r.width - .5) * 7;
        var y = ((e.clientY - r.top) / r.height - .5) * 7;
        svg.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      });
      stage.addEventListener('mouseleave', function(){ svg.style.transform = ''; });
    }

    /* ---------- live telemetry ---------- */
    function tick(flash){
      metricEls.forEach(function(row){
        var v = step(row.m);
        row.m.val = v;
        row.val.innerHTML = fmt(row.m, v) + (row.m.unit ? '<small>'+row.m.unit+'</small>' : '');
        if(flash && row.m.flash){
          row.el.classList.remove('flash');
          void row.el.offsetWidth;
          row.el.classList.add('flash');
        }
      });
    }
    tick(true);
    if(!reduceMotion){
      window.setInterval(function(){ tick(true); }, 1900);
    } else {
      window.setInterval(function(){ tick(false); }, 6000);
    }

    /* ---------- domain switching ---------- */
    tabs.querySelectorAll('.lv-tab').forEach(function(btn){
      btn.addEventListener('click', function(){
        var mode = btn.getAttribute('data-mode');
        var next = VIZ[mode];
        if(!next || mode === cfg.key) return;
        cfg = next;
        host.setAttribute('aria-label', cfg.label + ' — live interactive diagram');
        head.querySelector('.lv-title').textContent = cfg.label;
        head.querySelector('.lv-sub').textContent = cfg.sub;
        head.querySelector('.lv-icon').textContent = cfg.abbr;
        tabs.querySelectorAll('.lv-tab').forEach(function(b){
          b.classList.toggle('active', b.getAttribute('data-mode') === mode);
          b.setAttribute('aria-pressed', b.getAttribute('data-mode') === mode ? 'true' : 'false');
        });
        svgWrap.innerHTML = buildStage(cfg);
        var nextSvg = svgWrap.firstChild;
        stage.replaceChild(nextSvg, svg);
        svg = nextSvg;
        detailEl.classList.remove('show');
        currentActive = null;

        metricEls = [];
        readout.innerHTML = '';
        cfg.metrics.forEach(function(m){
          var cell = document.createElement('div');
          cell.className = 'lv-metric';
          cell.innerHTML = '<div class="lv-metric-label">'+m.label+'</div><div class="lv-metric-val">'+fmt(m,m.val)+(m.unit?'<small>'+m.unit+'</small>':'')+'</div>';
          readout.appendChild(cell);
          metricEls.push({el:cell, val:cell.querySelector('.lv-metric-val'), m:m});
        });
        tick(true);

        legend.innerHTML = '';
        cfg.legend.forEach(function(l){
          var s = document.createElement('span');
          s.innerHTML = '<i style="background:'+l[0]+';box-shadow:0 0 6px '+l[0]+'"></i>'+l[1];
          legend.appendChild(s);
        });

        // re-wire node interactivity
        svg.querySelectorAll('.lv-node').forEach(function(node){
          var cNode = cfg.nodes.filter(function(n){ return n.id === node.getAttribute('data-node'); })[0];
          if(cNode){ node.__detail = cNode.detail; }
          node.addEventListener('click', function(){ showDetail(node); });
          node.addEventListener('keydown', function(e){
            if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); showDetail(node); }
          });
        });
      });
    });
  }

  document.querySelectorAll('[data-live-viz]').forEach(function(el){
    var mode = el.getAttribute('data-live-viz') || 'ai';
    var cfg = VIZ[mode] || VIZ.ai;
    buildViz(el, cfg);
  });

})();
