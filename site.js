const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('motion-ready');
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { threshold: .06 });
  document.querySelectorAll('[data-reveal], .library .card').forEach(element => {
    element.setAttribute('data-reveal', '');
    observer.observe(element);
  });
}

// Each packed video carries its original pixels on the left and its matte on the right.
const alphaPlayers = [];
for (const element of document.querySelectorAll('[data-alpha-video]')) {
  const video = document.createElement('video');
  video.src = element.dataset.alphaVideo;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('aria-hidden', 'true');
  element.append(video);
  const canvas = element.querySelector('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const matte = document.createElement('canvas');
  const matteContext = matte.getContext('2d', { willReadFrequently: true });
  let callback = 0;

  function draw() {
    if (video.readyState < 2) return;
    const width = video.videoWidth / 2;
    const height = video.videoHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = matte.width = width;
      canvas.height = matte.height = height;
    }
    context.clearRect(0, 0, width, height);
    context.drawImage(video, 0, 0, width, height, 0, 0, width, height);
    matteContext.drawImage(video, width, 0, width, height, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    const mask = matteContext.getImageData(0, 0, width, height).data;
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      pixels.data[offset + 3] = mask[offset] < 12 ? 0 : mask[offset];
    }
    context.putImageData(pixels, 0, 0);

  }

  function nextFrame() {
    draw();
    if (video.paused) { callback = 0; return; }
    callback = video.requestVideoFrameCallback
      ? video.requestVideoFrameCallback(nextFrame)
      : requestAnimationFrame(nextFrame);
  }
  video.addEventListener('loadeddata', draw);
  video.addEventListener('seeked', draw);
  video.addEventListener('play', () => { if (!callback) nextFrame(); });
  alphaPlayers.push({ video });
}

const orbit = document.querySelector('[data-orbit]');
if (orbit) {
  const objects = [...orbit.querySelectorAll('.orbit-object')];
  let targetYaw = -18;
  let targetPitch = -10;
  let yaw = targetYaw;
  let pitch = targetPitch;
  let autoAngle = 0;
  let expansion = 0;
  let hovering = false;
  let inView = true;
  let frame = 0;
  let previousTime = 0;
  let activePointer = null;

  function syncVideos() {
    for (const { video } of alphaPlayers) {
      if (inView && !document.hidden && !reducedMotion.matches) video.play().catch(() => {});
      else video.pause();
    }
  }

  function reserveCollageSpace() {
    const height = orbit.clientHeight;
    const radius = Math.min(orbit.clientWidth * .36, 250);
    const objectHeight = Math.max(...objects.map(object => object.offsetHeight * Number(object.dataset.size)));
    const extent = height / 2 + Math.hypot(height * .19, radius * .4) + objectHeight * .68 - 48;
    document.querySelector('.profile-bottom').style.paddingTop = Math.ceil(extent) + 'px';
  }
  new ResizeObserver(reserveCollageSpace).observe(orbit);
  reserveCollageSpace();
  function paint() {
    const bounds = orbit.getBoundingClientRect();
    const radius = Math.min(bounds.width * (.32 + expansion * .04), 220 + expansion * 30);
    const tilt = pitch * Math.PI / 180;
    for (const object of objects) {
      const angle = (Number(object.dataset.phase) + yaw + autoAngle) * Math.PI / 180;
      const depth = Math.sin(angle) * radius;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * bounds.height * .19 * Math.cos(tilt) - depth * Math.sin(tilt);
      const scale = (1 + depth / 850) * Number(object.dataset.size);
      object.style.transform = 'translate(-50%,-50%) translate3d(' + x + 'px,' + y + 'px,0) scale(' + scale + ') rotate(' + Math.sin(angle) * 6 + 'deg)';
      object.style.zIndex = String(Math.round(depth + 400));
    }
  }

  function animate(time) {
    const elapsed = previousTime ? Math.min(time - previousTime, 50) : 16;
    previousTime = time;
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / 230);
    if (!reducedMotion.matches) autoAngle += elapsed * (hovering ? .002 : .005);
    yaw += (targetYaw - yaw) * blend;
    pitch += (targetPitch - pitch) * blend;
    expansion += ((hovering ? 1 : 0) - expansion) * blend;
    paint();
    const settling = Math.abs(targetYaw - yaw) + Math.abs(targetPitch - pitch) + Math.abs((hovering ? 1 : 0) - expansion) > .025;
    if (inView && !document.hidden && (!reducedMotion.matches || settling)) frame = requestAnimationFrame(animate);
    else { frame = 0; previousTime = 0; }
  }

  function schedule() { if (!frame) frame = requestAnimationFrame(animate); }
  orbit.addEventListener('pointerenter', () => { hovering = true; schedule(); });
  orbit.addEventListener('pointerleave', () => { hovering = false; schedule(); });
  function move(event) {
    if (event.pointerType === 'touch' && activePointer !== event.pointerId) return;
    const bounds = orbit.getBoundingClientRect();
    targetYaw = ((event.clientX - bounds.left) / bounds.width - .5) * 250;
    targetPitch = ((event.clientY - bounds.top) / bounds.height - .5) * 45;
    schedule();
  }
  orbit.addEventListener('pointermove', move);
  orbit.addEventListener('pointerdown', event => { activePointer = event.pointerId; hovering = true; move(event); });
  const release = () => { activePointer = null; };
  orbit.addEventListener('pointerup', release);
  orbit.addEventListener('pointercancel', release);
  orbit.addEventListener('keydown', event => {
    const change = { ArrowLeft: [-25, 0], ArrowRight: [25, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
    if (!change) return;
    event.preventDefault();
    targetYaw += change[0];
    targetPitch = Math.max(-30, Math.min(30, targetPitch + change[1]));
    schedule();
  });
  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    syncVideos();
    if (inView) schedule();
  }).observe(orbit);
  document.addEventListener('visibilitychange', () => { syncVideos(); if (!document.hidden) schedule(); });
  reducedMotion.addEventListener('change', () => { syncVideos(); schedule(); });
  new ResizeObserver(schedule).observe(orbit);
  schedule();
}

// Pin only after the full profile, including its bottom spacing, can be read.
const profile = document.querySelector('.profile');
if (profile) {
  const header = document.querySelector('header');
  function updateProfilePosition() {
    const headerHeight = header.getBoundingClientRect().height;
    const top = Math.min(headerHeight, innerHeight - profile.offsetHeight - 24);
    profile.style.setProperty('--profile-sticky-top', top + 'px');
  }
  const profileObserver = new ResizeObserver(updateProfilePosition);
  profileObserver.observe(profile);
  profileObserver.observe(header);
  window.addEventListener('resize', updateProfilePosition);
  updateProfilePosition();
}

// The profile itself is sticky on wide screens, so its home links target the page top.
for (const link of document.querySelectorAll('a[href$="#profile"]')) {
  link.addEventListener('click', event => {
    const target = new URL(link.href);
    if (target.pathname !== location.pathname) return;
    event.preventDefault();
    if (location.href !== target.href) history.pushState(null, '', target.href);
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  });
}

// A fresh homepage visit starts at Profile instead of restoring an old project position.
if (profile && (!location.hash || location.hash === '#profile')) {
  history.scrollRestoration = 'manual';
  const startAtProfile = () => window.scrollTo({top: 0, behavior: 'instant'});
  startAtProfile();
  requestAnimationFrame(startAtProfile);
  window.addEventListener('pageshow', startAtProfile);
}




// Hover unfolds the cover-first fan; each page lifts at its own position.
document.querySelectorAll('.design-fan').forEach(fan => {
  const cards=[...fan.querySelectorAll('.fan-page')];
  const caption=fan.querySelector('.fan-caption');
  const toggle=fan.querySelector('.fan-toggle');
  const stage=fan.querySelector('.fan-stage');
  let open=false, hoverReady=false, hoverTimer=null;
  const setOpen=value=>{
    clearTimeout(hoverTimer);
    hoverReady=false;
    open=value;
    if(open) hoverTimer=setTimeout(()=>{hoverReady=true;},750);
    fan.classList.toggle('is-open',open);
    if(toggle) toggle.setAttribute('aria-expanded',String(open));
    if(toggle) toggle.textContent=open?'Click outside to fold':'Click to unfold';
    cards.forEach(card=>card.classList.remove('is-active'));
    caption.textContent=open?'Home · Community · Events · ReEquip':'Click the stack to unfold our designs';
  };
  const activate=card=>{
    if(!open || !hoverReady)return;
    cards.forEach(other=>other.classList.toggle('is-active',other===card));
    caption.textContent=card.getAttribute('aria-label');
  };
  if(toggle) toggle.addEventListener('click',()=>setOpen(!open));
  cards.forEach(card=>{
    card.addEventListener('pointerenter',()=>activate(card));
    card.addEventListener('focus',()=>activate(card));
    card.addEventListener('click',()=>{if(!open)setOpen(true);else activate(card);});
    card.addEventListener('pointerleave',()=>card.classList.remove('is-active'));
  });
  document.addEventListener('click',event=>{
    if(!event.target.closest('.fan-page')&&!event.target.closest('.fan-toggle'))setOpen(false);
  });
  setOpen(false);
});
