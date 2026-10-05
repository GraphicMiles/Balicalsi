/*
 * Island Rally — coastal art direction pass.
 * Procedural, original scenery and surfacing so the game remains fully offline.
 */
(function () {
  'use strict';

  const T = THREE;
  const art = { installed: false, built: false, water: null, waterTexture: null, waterTime: 0, waterTicks: 0, menuCar: null, menuHeading: 0 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function seeded(seed) {
    let a = seed >>> 0 || 20261005;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function canvasTexture(width, height, paint, repeatX = 1, repeatY = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    paint(canvas.getContext('2d'), width, height);
    const texture = new T.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.encoding = T.sRGBEncoding;
    return texture;
  }

  function makeSandTexture(rng) {
    return canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#b68a53'; g.fillRect(0, 0, w, h);
      const colors = ['rgba(255,242,204,.18)', 'rgba(128,91,48,.09)', 'rgba(238,213,165,.15)', 'rgba(116,91,63,.055)'];
      for (let i = 0; i < 44; i++) {
        const x = rng() * w, y = rng() * h, r = 18 + rng() * 80;
        const grad = g.createRadialGradient(x, y, 1, x, y, r);
        grad.addColorStop(0, colors[i % colors.length]); grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 15000; i++) {
        const a = .04 + rng() * .12;
        g.fillStyle = rng() > .48 ? `rgba(255,248,218,${a})` : `rgba(94,68,42,${a})`;
        const s = .6 + rng() * 2.2; g.fillRect(rng() * w, rng() * h, s, s);
      }
      g.lineWidth = 1.4;
      for (let i = 0; i < 28; i++) {
        const y = rng() * h, x = rng() * w;
        g.strokeStyle = i % 2 ? 'rgba(255,242,208,.14)' : 'rgba(113,86,52,.08)';
        g.beginPath(); g.moveTo(x, y);
        for (let k = 1; k < 8; k++) g.lineTo(x + k * 14, y + Math.sin(k * .7 + i) * 2.2);
        g.stroke();
      }
    }, 38, 38);
  }

  function makeCobbleTexture(rng) {
    return canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#554a3c'; g.fillRect(0, 0, w, h);
      const stone = ['#b5a184', '#c3ad8a', '#9b896f', '#d0ba94', '#aa9677', '#c8b18a'];
      const cw = 55, ch = 39;
      for (let row = -1; row < h / ch + 2; row++) {
        const shift = row % 2 ? cw / 2 : 0;
        for (let col = -1; col < w / cw + 2; col++) {
          const x = col * cw + shift + 2 + (rng() - .5) * 3;
          const y = row * ch + 2 + (rng() - .5) * 3;
          const rw = cw - 5 - rng() * 5, rh = ch - 5 - rng() * 4;
          const radius = 7 + rng() * 5;
          g.beginPath();
          g.moveTo(x + radius, y); g.lineTo(x + rw - radius, y + 1);
          g.quadraticCurveTo(x + rw, y, x + rw, y + radius);
          g.lineTo(x + rw - 1, y + rh - radius);
          g.quadraticCurveTo(x + rw, y + rh, x + rw - radius, y + rh);
          g.lineTo(x + radius, y + rh - 1);
          g.quadraticCurveTo(x, y + rh, x, y + rh - radius);
          g.lineTo(x + 1, y + radius); g.quadraticCurveTo(x, y, x + radius, y); g.closePath();
          g.fillStyle = stone[Math.floor(rng() * stone.length)]; g.fill();
          g.strokeStyle = 'rgba(48,39,31,.55)'; g.lineWidth = 2.2; g.stroke();
          g.strokeStyle = 'rgba(255,239,206,.12)'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(x + 7, y + 4); g.lineTo(x + rw - 9, y + 4); g.stroke();
        }
      }
      for (let i = 0; i < 1800; i++) {
        g.fillStyle = rng() > .5 ? 'rgba(255,244,218,.12)' : 'rgba(39,31,24,.11)';
        g.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
      }
    });
  }

  function makePackedEarthTexture(rng) {
    return canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#936b43'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 10000; i++) {
        const a = .035 + rng() * .14;
        g.fillStyle = rng() > .55 ? `rgba(244,214,158,${a})` : `rgba(72,53,38,${a})`;
        const s = .6 + rng() * 3.2; g.fillRect(rng() * w, rng() * h, s, s);
      }
      g.lineWidth = 3;
      for (let i = 0; i < 24; i++) {
        const x = rng() * w, y = rng() * h;
        g.strokeStyle = i % 2 ? 'rgba(238,201,144,.12)' : 'rgba(63,47,35,.1)';
        g.beginPath(); g.moveTo(x, y);
        for (let k = 1; k < 10; k++) g.lineTo(x + k * 12, y + Math.sin(k * .6 + i) * 3);
        g.stroke();
      }
    });
  }

  function makeAsphaltTexture(rng) {
    return canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#494b50'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 16000; i++) {
        g.fillStyle = rng() > .5 ? 'rgba(255,255,255,.07)' : 'rgba(12,15,19,.13)';
        const s = .6 + rng() * 2.4; g.fillRect(rng() * w, rng() * h, s, s);
      }
      g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = 5;
      for (let i = 0; i < 18; i++) {
        const x = rng() * w; g.beginPath(); g.moveTo(x, 0);
        for (let y = 0; y <= h; y += 24) g.lineTo(x + Math.sin(y * .04 + i) * 5, y);
        g.stroke();
      }
    });
  }

  function makeThatchedTexture(rng) {
    return canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#9b6536'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 950; i++) {
        const x = rng() * w, y = rng() * h, len = 15 + rng() * 42;
        g.strokeStyle = rng() > .5 ? 'rgba(229,183,111,.6)' : 'rgba(70,44,27,.35)';
        g.lineWidth = 1 + rng() * 2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (rng() - .5) * 8); g.stroke();
      }
      for (let y = 0; y < h; y += 38) {
        g.strokeStyle = 'rgba(65,42,27,.22)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 11); g.stroke();
      }
    });
  }

  function textTexture(title, subtitle, background) {
    return canvasTexture(768, 256, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, background || '#e86a45'); grad.addColorStop(1, '#a73b35');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(18,31,41,.95)'; g.fillRect(0, h - 18, w, 18);
      g.strokeStyle = 'rgba(255,231,173,.9)'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#fff4d5'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 68px system-ui, sans-serif'; g.fillText(title, w / 2, subtitle ? h * .42 : h * .52, w - 50);
      if (subtitle) { g.font = '700 28px system-ui, sans-serif'; g.fillStyle = '#ffe4a5'; g.fillText(subtitle, w / 2, h * .76, w - 60); }
    });
  }

  function tuneExistingWorld(rng) {
    const sand = makeSandTexture(rng);
    island.material.map = sand;
    island.material.bumpMap = sand;
    island.material.color.set(0xffffff);
    island.material.bumpScale = .018;
    island.material.roughness = .96;
    island.material.metalness = 0;
    island.material.needsUpdate = true;

    scene.fog.color.setHex(0x78b7c6);
    scene.fog.near = 420; scene.fog.far = 1280;
    hemi.color.setHex(0xaed8e8); hemi.groundColor.setHex(0x825b38); hemi.intensity = .72;
    sun.color.setHex(0xffc47e); sun.intensity = 1.38;
    fill.color.setHex(0x58b8ca); fill.intensity = .26;
    renderer.toneMappingExposure = .78;
    sun.shadow.mapSize.set(innerWidth < 760 ? 1024 : 1536, innerWidth < 760 ? 1024 : 1536);
    sun.shadow.camera.left = -54; sun.shadow.camera.right = 54;
    sun.shadow.camera.top = 54; sun.shadow.camera.bottom = -54;
    sun.shadow.camera.updateProjectionMatrix();
    if (foam && foam.material) { foam.material.color.setHex(0xe7fff3); foam.material.opacity = .52; }

    // The original flat sheet is replaced with a softly animated, glossy lagoon.
    sea.visible = false;
    const waterTexture = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#20b8c2'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 55; i++) {
        const x = rng() * w, y = rng() * h, rx = 24 + rng() * 100, ry = 4 + rng() * 11;
        const grad = g.createLinearGradient(x - rx, y, x + rx, y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(.48, `rgba(222,255,250,${.1 + rng() * .18})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad; g.beginPath(); g.ellipse(x, y, rx, ry, (rng() - .5) * .12, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 6000; i++) {
        g.fillStyle = rng() > .5 ? 'rgba(255,255,255,.05)' : 'rgba(5,73,99,.045)';
        g.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1);
      }
    }, 24, 24);
    const waterGeometry = new T.PlaneGeometry(4200, 4200, 56, 56);
    waterGeometry.rotateX(-Math.PI / 2);
    const position = waterGeometry.attributes.position;
    const base = new Float32Array(position.array.length);
    base.set(position.array);
    const waterMaterial = new T.MeshStandardMaterial({
      map: waterTexture, color: 0xffffff, roughness: .24, metalness: .1,
      envMapIntensity: .78
    });
    const water = new T.Mesh(waterGeometry, waterMaterial);
    water.position.y = -.78; water.receiveShadow = true; water.frustumCulled = false;
    scene.add(water);
    art.water = { mesh: water, geometry: waterGeometry, base, texture: waterTexture, position };
    art.waterTexture = waterTexture;

    // Turn the flat blue dome into a warm, luminous late-afternoon gradient.
    if (sky.material.map && sky.material.map.image) {
      const c = sky.material.map.image, g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, c.height);
      grad.addColorStop(0, '#263866');
      grad.addColorStop(.30, '#536e9b');
      grad.addColorStop(.55, '#9a668b');
      grad.addColorStop(.73, '#db795f');
      grad.addColorStop(.88, '#ffc06e');
      grad.addColorStop(1, '#d8d9ad');
      g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
      sky.material.map.needsUpdate = true;
    }
  }

  function buildTrackSurface(rng) {
    const cobble = makeCobbleTexture(rng);
    const earth = makePackedEarthTexture(rng);
    const asphalt = makeAsphaltTexture(rng);
    const mats = [
      new T.MeshStandardMaterial({ map: cobble, color: 0xffffff, roughness: .9, bumpMap: cobble, bumpScale: .035, side: T.DoubleSide }),
      new T.MeshStandardMaterial({ map: earth, color: 0xffffff, roughness: .95, bumpMap: earth, bumpScale: .03, side: T.DoubleSide }),
      new T.MeshStandardMaterial({ map: asphalt, color: 0xffffff, roughness: .72, bumpMap: asphalt, bumpScale: .018, side: T.DoubleSide }),
      new T.MeshStandardMaterial({ map: cobble, color: 0xffffff, roughness: .92, bumpMap: cobble, bumpScale: .03, side: T.DoubleSide })
    ];
    const ranges = [
      [0, .27, 0], [.27, .54, 1], [.54, .79, 2], [.79, 1, 3]
    ];
    const roadWidth = 7.18;
    ranges.forEach(([lo, hi, matIndex]) => {
      const start = Math.floor(N * lo), end = Math.floor(N * hi);
      const count = end - start;
      const positions = [], uvs = [], indices = [];
      for (let j = 0; j <= count; j++) {
        const i = (start + j) % N, p = pts[i], n = nm[i], dist = (start + j) * (L / N);
        positions.push(p.x - n.x * roadWidth, .095, p.z - n.z * roadWidth,
                       p.x + n.x * roadWidth, .095, p.z + n.z * roadWidth);
        uvs.push(0, dist * .19, roadWidth * .38, dist * .19);
        if (j < count) { const q = j * 2; indices.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      const mesh = new T.Mesh(geometry, mats[matIndex]); mesh.receiveShadow = true; mesh.renderOrder = 2;
      scene.add(mesh);
    });

    // Fine cream edge lines and short sun-yellow center dashes keep the route readable.
    function markingStrip(offset, width, material, step = 1, dashLength = 0) {
      const positions = [], indices = [];
      const addQuad = (i0, i1) => {
        const baseIndex = positions.length / 3;
        for (const i of [i0, i1]) {
          const p = pts[i % N], n = nm[i % N];
          for (const side of [-1, 1]) positions.push(p.x + n.x * (offset + side * width * .5), .125, p.z + n.z * (offset + side * width * .5));
        }
        indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 1, baseIndex + 3, baseIndex + 2);
      };
      if (!dashLength) {
        for (let i = 0; i < N; i++) addQuad(i, i + 1);
      } else {
        const dashSamples = Math.max(1, Math.round(dashLength / (L / N)));
        for (let i = 0; i < N; i += step) addQuad(i, i + dashSamples);
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      g.setIndex(indices); g.computeVertexNormals();
      const mesh = new T.Mesh(g, material); mesh.frustumCulled = false; mesh.renderOrder = 3; scene.add(mesh);
    }
    const edgeMat = new T.MeshBasicMaterial({ color: 0xfff0ca, transparent: true, opacity: .78, side: T.DoubleSide });
    const dashMat = new T.MeshBasicMaterial({ color: 0xffd368, transparent: true, opacity: .72, side: T.DoubleSide });
    markingStrip(-6.82, .11, edgeMat); markingStrip(6.82, .11, edgeMat);
    markingStrip(0, .12, dashMat, 8, 2.5);

    // Tidy up the original red/white kerbs and leave them just outside the new surface.
    const kerb = canvasTexture(128, 128, (g, w, h) => {
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        g.fillStyle = (row + col) % 2 ? '#f7f1df' : '#ec604b';
        g.fillRect(col * 16, row * 16, 16, 16);
      }
      g.strokeStyle = 'rgba(48,46,45,.16)'; g.lineWidth = 2;
      for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    }, 1, 1);
    kerbMat.map = kerb; kerbMat.color.set(0xffffff); kerbMat.needsUpdate = true;
  }

  function palmFrondGeometry() {
    const p = [], idx = [];
    const Lf = 5.8, steps = 13;
    const curveY = t => 1.0 * Math.sin(t * Math.PI * .92) - 1.55 * t * t;
    // A fine central rib.
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = Lf * t, y = curveY(t), w = .055 * (1 - .55 * t);
      p.push(x, y, -w, x, y + w * .32, 0, x, y, w);
      if (i < steps) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    }
    // Slender paired leaflets taper toward the frond tip.
    for (let i = 1; i < steps; i++) {
      const t = i / steps, x = Lf * t, y = curveY(t), len = 1.25 * (1 - t) + .18;
      for (const side of [-1, 1]) {
        const a = p.length / 3;
        p.push(x, y, 0);
        p.push(x - len * .18, y - len * .23, side * len * .55);
        p.push(x - len * .68, y - len * .65, side * len);
        p.push(x + len * .04, y - len * .24, side * len * .54);
        idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
      }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }

  function buildPalms(rng) {
    const maxTrees = 64, maxFronds = maxTrees * 7;
    const trunkGeo = new T.CylinderGeometry(.18, .34, 7, 10, 6);
    const bark = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#9a7049'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        g.strokeStyle = i % 2 ? 'rgba(60,41,29,.24)' : 'rgba(230,190,132,.25)'; g.lineWidth = 2 + (i % 3);
        g.beginPath(); g.moveTo(i * 17 % w, 0); g.lineTo(i * 17 % w + (i % 2 ? 14 : -14), h); g.stroke();
      }
      for (let y = 32; y < h; y += 34) { g.strokeStyle = 'rgba(56,41,31,.28)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 8); g.stroke(); }
    });
    const trunkMat = new T.MeshStandardMaterial({ map: bark, roughness: .95, color: 0xffffff });
    const leafMat = new T.MeshStandardMaterial({ color: 0x319456, roughness: .72, side: T.DoubleSide, flatShading: true });
    const trunks = new T.InstancedMesh(trunkGeo, trunkMat, maxTrees);
    const fronds = new T.InstancedMesh(palmFrondGeometry(), leafMat, maxFronds);
    const dummy = new T.Object3D(), used = [];
    let treeCount = 0, frondCount = 0;
    const heroTrees = [[9,-1,22],[24,1,24],[42,-1,23],[584,1,25],[606,-1,24]];
    for (let attempt = 0; attempt < 1500 && treeCount < maxTrees; attempt++) {
      const fixed = attempt < heroTrees.length ? heroTrees[attempt] : null;
      const i = fixed ? fixed[0] : Math.floor(rng() * N), side = fixed ? fixed[1] : (rng() < .5 ? -1 : 1), offset = fixed ? fixed[2] : 17 + rng() * 64;
      const x = pts[i].x + nm[i].x * side * offset, z = pts[i].z + nm[i].z * side * offset;
      const coast = Math.hypot(x, z + 115);
      if (coast < 54 || coast > 267) continue;
      let clear = true;
      for (const q of used) if ((x - q.x) ** 2 + (z - q.z) ** 2 < 17 * 17) { clear = false; break; }
      if (!clear) continue;
      const s = .9 + rng() * .5, lean = (rng() - .5) * .12, phase = rng() * Math.PI * 2;
      used.push({ x, z });
      dummy.position.set(x, 3.5 * s, z); dummy.rotation.set(0, phase, lean); dummy.scale.set(s, s, s); dummy.updateMatrix();
      trunks.setMatrixAt(treeCount++, dummy.matrix);
      for (let k = 0; k < 7; k++) {
        dummy.position.set(x, 6.45 * s, z); dummy.rotation.set((rng() - .5) * .08, phase + k * Math.PI * 2 / 7, (rng() - .5) * .08);
        dummy.scale.set(s, s, s); dummy.updateMatrix(); fronds.setMatrixAt(frondCount++, dummy.matrix);
      }
    }
    trunks.count = treeCount; fronds.count = frondCount;
    trunks.castShadow = true; trunks.receiveShadow = true; trunks.frustumCulled = false;
    fronds.castShadow = false; fronds.receiveShadow = false; fronds.frustumCulled = false;
    trunks.instanceMatrix.needsUpdate = true; fronds.instanceMatrix.needsUpdate = true;
    scene.add(trunks, fronds);

    // Low tropical shrubs create a lush, layered verge without thousands of draw calls.
    const shrubGeo = new T.IcosahedronGeometry(1, 1);
    const shrubMat = new T.MeshStandardMaterial({ color: 0x3c8a50, roughness: .9, flatShading: true });
    const shrubs = new T.InstancedMesh(shrubGeo, shrubMat, 190);
    let shrubCount = 0;
    for (let i = 0; i < 190; i++) {
      const j = Math.floor(rng() * N), side = rng() < .5 ? -1 : 1, off = 9.6 + rng() * 7;
      const x = pts[j].x + nm[j].x * side * off, z = pts[j].z + nm[j].z * side * off;
      if (Math.hypot(x, z + 115) > 272) continue;
      const s = .45 + rng() * .85;
      dummy.position.set(x, .42 * s, z); dummy.rotation.set(rng() * .5, rng() * 6.28, rng() * .5);
      dummy.scale.set(1.6 * s, .75 * s, 1.25 * s); dummy.updateMatrix(); shrubs.setMatrixAt(shrubCount++, dummy.matrix);
    }
    shrubs.count = shrubCount; shrubs.castShadow = false; shrubs.receiveShadow = true; shrubs.frustumCulled = false;
    shrubs.instanceMatrix.needsUpdate = true; scene.add(shrubs);
  }

  function roofGeometry(width, depth, wallHeight, rise) {
    const x0 = -width / 2, x1 = width / 2, z0 = -depth / 2, z1 = depth / 2, peak = wallHeight + rise;
    const p = [
      x0, wallHeight, z0,  x0, wallHeight, z1,  x0, peak, 0,
      x1, wallHeight, z0,  x1, wallHeight, z1,  x1, peak, 0
    ];
    const uv = [0,0, 0,1, .5,1, 1,0, 1,1, .5,1];
    const index = [1,4,5, 1,5,2, 0,2,5, 0,5,3, 0,1,2, 3,5,4];
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(index); g.computeVertexNormals(); return g;
  }

  function makeHouse(x, z, yaw, scale, palette, roofMat, rng, shopName) {
    const root = new T.Group(); root.position.set(x, 0, z); root.rotation.y = yaw; root.scale.setScalar(scale);
    const width = 5.1 + rng() * 1.6, depth = 4.7 + rng() * 1.4, h = 3.1 + rng() * .5, rise = 1.25 + rng() * .4;
    const wallMat = new T.MeshStandardMaterial({ color: palette[Math.floor(rng() * palette.length)], roughness: .88, flatShading: true });
    const wood = new T.MeshStandardMaterial({ color: 0x65452f, roughness: .92 });
    const trim = new T.MeshStandardMaterial({ color: 0xe6c996, roughness: .8 });
    const glass = new T.MeshPhysicalMaterial({ color: 0x73c7d0, roughness: .18, metalness: .08, clearcoat: .8, transparent: true, opacity: .88 });
    const wall = new T.Mesh(new T.BoxGeometry(width, h, depth), wallMat); wall.position.y = h / 2; wall.castShadow = wall.receiveShadow = true; root.add(wall);
    const eave = new T.Mesh(new T.BoxGeometry(width + .7, .18, depth + .85), wood); eave.position.y = h - .02; eave.castShadow = true; root.add(eave);
    const roof = new T.Mesh(roofGeometry(width + .75, depth + .8, h, rise), roofMat); roof.material.side = T.DoubleSide; roof.castShadow = true; roof.receiveShadow = true; root.add(roof);

    // Deep timber door and bright sea-glass windows.
    const door = new T.Mesh(new T.BoxGeometry(.88, 1.85, .11), wood); door.position.set(0, .94, depth / 2 + .08); root.add(door);
    const knob = new T.Mesh(new T.SphereGeometry(.06, 10, 8), new T.MeshStandardMaterial({ color: 0xf0c56c, metalness: .65, roughness: .3 }));
    knob.position.set(.28, .94, depth / 2 + .15); root.add(knob);
    const windowFrames = new T.InstancedMesh(new T.BoxGeometry(1.05, .88, .12), trim, 2);
    const windowPanes = new T.InstancedMesh(new T.BoxGeometry(.78, .62, .13), glass, 2);
    const windowDummy = new T.Object3D();
    for (let i = 0; i < 2; i++) {
      const wx = (i ? 1 : -1) * width * .29, wy = h * .59, wz = depth / 2 + .08;
      windowDummy.position.set(wx, wy, wz); windowDummy.rotation.set(0, 0, 0); windowDummy.scale.set(1, 1, 1); windowDummy.updateMatrix(); windowFrames.setMatrixAt(i, windowDummy.matrix);
      windowDummy.position.set(wx, wy, wz + .035); windowDummy.updateMatrix(); windowPanes.setMatrixAt(i, windowDummy.matrix);
    }
    windowFrames.instanceMatrix.needsUpdate = true; windowPanes.instanceMatrix.needsUpdate = true; root.add(windowFrames, windowPanes);
    const porch = new T.Mesh(new T.BoxGeometry(width * .68, .13, 1.05), wood); porch.position.set(0, 2.28, depth / 2 + .45); root.add(porch);
    const porchPosts = new T.InstancedMesh(new T.CylinderGeometry(.07, .1, 2.2, 8), trim, 2);
    for (let i = 0; i < 2; i++) {
      windowDummy.position.set((i ? 1 : -1) * width * .31, 1.1, depth / 2 + .82); windowDummy.rotation.set(0, 0, 0); windowDummy.scale.set(1, 1, 1); windowDummy.updateMatrix(); porchPosts.setMatrixAt(i, windowDummy.matrix);
    }
    porchPosts.instanceMatrix.needsUpdate = true; root.add(porchPosts);
    // Small painted fascia makes a few of the cottages read as beachfront shops.
    if (shopName) {
      const board = new T.Mesh(new T.BoxGeometry(width * .62, .55, .12), wood); board.position.set(0, h - .48, depth / 2 + .1); root.add(board);
      const label = new T.Mesh(new T.PlaneGeometry(width * .56, .42), new T.MeshBasicMaterial({ map: textTexture(shopName, '', '#397d79'), side: T.DoubleSide }));
      label.position.set(0, h - .48, depth / 2 + .17); root.add(label);
    }
    scene.add(root); return root;
  }

  function buildVillage(rng) {
    const roofTexture = makeThatchedTexture(rng);
    const roofMat = new T.MeshStandardMaterial({ map: roofTexture, color: 0xffffff, roughness: .98, side: T.DoubleSide });
    const palettes = [
      [0xd9a36a, 0xc98560, 0xd9a094],
      [0x71bba8, 0x64a89c, 0xc6b47a],
      [0xd68165, 0xb96e58, 0xd2ae7f],
      [0xd5c49a, 0x98bca7, 0xd1a850]
    ];
    const clusters = [[18, 142], [437, 606]];
    const occupied = [];
    const shopNames = ['MANGO BAR', 'CORAL CAFE', 'TIDE & TACKLE', 'SALT SHACK', 'SUNSET SURF'];
    let total = 0;
    clusters.forEach(([a, b], clusterIndex) => {
      for (let j = 0; j < 7; j++) {
        const i = a + Math.floor(rng() * (b - a)), side = rng() < .5 ? -1 : 1, off = 15.2 + rng() * 12;
        const x = pts[i].x + nm[i].x * side * off, z = pts[i].z + nm[i].z * side * off;
        const coast = Math.hypot(x, z + 115);
        if (coast < 68 || coast > 266) continue;
        if (occupied.some(q => (q.x - x) ** 2 + (q.z - z) ** 2 < 12 * 12)) continue;
        occupied.push({ x, z });
        const yaw = Math.atan2(-tg[i].z, tg[i].x) + (side > 0 ? Math.PI : 0);
        const shop = j % 3 === 1 ? shopNames[(j + clusterIndex * 2) % shopNames.length] : '';
        makeHouse(x, z, yaw, .83 + rng() * .26, palettes[(j + clusterIndex) % palettes.length], roofMat, rng, shop);
        total++;
      }
    });
    // A few recognizable cottages sit close to the opening stretch, so the first camera view feels inhabited.
    [[14, -1], [31, 1], [46, -1]].forEach(([i, side], j) => {
      const x = pts[i].x + nm[i].x * side * 17.5, z = pts[i].z + nm[i].z * side * 17.5;
      const yaw = Math.atan2(-tg[i].z, tg[i].x) + (side > 0 ? Math.PI : 0);
      makeHouse(x, z, yaw, .78, palettes[(j + 2) % palettes.length], roofMat, rng, ['TIDE CAFE', 'SURF STOP', 'PALM POST'][j]);
    });
    // A small handful of beach huts sit farther down on the sand, away from the racing line.
    for (let j = 0; j < 4; j++) {
      const a = rng() * Math.PI * 2, r = 175 + rng() * 48;
      const x = Math.cos(a) * r, z = -115 + Math.sin(a) * r;
      const yaw = a + Math.PI / 2 + (rng() - .5) * .35;
      makeHouse(x, z, yaw, .72 + rng() * .18, palettes[(j + 1) % palettes.length], roofMat, rng, j % 2 ? 'ISLAND CAFE' : '');
      total++;
    }
    return total;
  }

  function buildCoastRocks(rng) {
    const rockGeometry = new T.IcosahedronGeometry(1, 1);
    const rockMaterial = new T.MeshStandardMaterial({ color: 0x625a50, roughness: .98, flatShading: true });
    const cliffs = new T.InstancedMesh(rockGeometry, rockMaterial, 30);
    const colors = [0x665c52, 0x716456, 0x5d5e58, 0x83705b];
    const dummy = new T.Object3D();
    for (let i = 0; i < 30; i++) {
      const a = i / 30 * Math.PI * 2 + (rng() - .5) * .08, r = 282 + rng() * 16;
      const x = Math.cos(a) * r, z = -115 + Math.sin(a) * r;
      const sx = 5 + rng() * 9, sy = 8 + rng() * 16, sz = 5 + rng() * 10;
      dummy.position.set(x, sy * .42 - .8, z); dummy.rotation.set((rng() - .5) * .28, rng() * Math.PI, (rng() - .5) * .24);
      dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); cliffs.setMatrixAt(i, dummy.matrix);
      if (cliffs.setColorAt) cliffs.setColorAt(i, new T.Color(colors[i % colors.length]));
    }
    cliffs.castShadow = true; cliffs.receiveShadow = true; cliffs.frustumCulled = false;
    cliffs.instanceMatrix.needsUpdate = true; if (cliffs.instanceColor) cliffs.instanceColor.needsUpdate = true;
    scene.add(cliffs);

    // Distant green islands give the lagoon a proper horizon instead of an empty plane.
    const islandGeo = new T.IcosahedronGeometry(1, 2);
    const islandMat = new T.MeshStandardMaterial({ color: 0x596f5d, roughness: 1, flatShading: true });
    const distant = new T.InstancedMesh(islandGeo, islandMat, 8);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + .18, r = 440 + rng() * 180;
      const sx = 38 + rng() * 55, sy = 18 + rng() * 27, sz = 34 + rng() * 56;
      dummy.position.set(Math.cos(a) * r, sy * .53 - 1, -115 + Math.sin(a) * r);
      dummy.rotation.set((rng() - .5) * .18, rng() * 6.28, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
      distant.setMatrixAt(i, dummy.matrix);
      if (distant.setColorAt) distant.setColorAt(i, new T.Color(i % 2 ? 0x526c5a : 0x637663));
    }
    distant.instanceMatrix.needsUpdate = true; if (distant.instanceColor) distant.instanceColor.needsUpdate = true;
    distant.castShadow = false; distant.receiveShadow = false; distant.frustumCulled = false; scene.add(distant);
  }

  function makeSign(x, z, yaw, title, subtitle, color) {
    const root = new T.Group(); root.position.set(x, 0, z); root.rotation.y = yaw;
    const postMat = new T.MeshStandardMaterial({ color: 0x6b4931, roughness: .9 });
    const post = new T.Mesh(new T.CylinderGeometry(.11, .15, 3.25, 8), postMat); post.position.y = 1.62; post.castShadow = true; root.add(post);
    const board = new T.Mesh(new T.BoxGeometry(4.4, 1.13, .23), postMat); board.position.set(0, 3.18, 0); board.castShadow = true; root.add(board);
    const face = new T.Mesh(new T.PlaneGeometry(4.14, .88), new T.MeshBasicMaterial({ map: textTexture(title, subtitle, color), side: T.DoubleSide }));
    face.position.set(0, 3.18, .125); root.add(face);
    scene.add(root); return root;
  }

  function buildStartGate() {
    const p = pts[0], forward = tg[0], heading = Math.atan2(-forward.z, forward.x);
    const gate = new T.Group(); gate.position.set(p.x, 0, p.z); gate.rotation.y = heading;
    const timber = new T.MeshStandardMaterial({ color: 0x754c31, roughness: .85 });
    const coral = new T.MeshStandardMaterial({ color: 0xe76e45, roughness: .55, metalness: .06 });
    for (const side of [-1, 1]) {
      const post = new T.Mesh(new T.CylinderGeometry(.18, .25, 7.6, 10), timber);
      post.position.set(0, 3.8, side * 9.25); post.castShadow = true; gate.add(post);
      const base = new T.Mesh(new T.CylinderGeometry(.62, .74, .38, 8), coral); base.position.set(0, .2, side * 9.25); gate.add(base);
      const lamp = new T.Mesh(new T.SphereGeometry(.22, 14, 10), new T.MeshStandardMaterial({ color: 0xffdf8a, emissive: 0xf0a52b, emissiveIntensity: .65 }));
      lamp.position.set(0, 7.7, side * 9.25); gate.add(lamp);
    }
    const beam = new T.Mesh(new T.BoxGeometry(.44, .44, 19.2), timber); beam.position.set(0, 7.45, 0); beam.castShadow = true; gate.add(beam);
    const bannerTex = canvasTexture(1024, 256, (g, w, h) => {
      g.fillStyle = '#163943'; g.fillRect(0, 0, w, h);
      const tile = 42;
      for (let y = 0; y < 2; y++) for (let x = 0; x < Math.ceil(w / tile); x++) {
        g.fillStyle = (x + y) % 2 ? '#fff0d2' : '#17252b'; g.fillRect(x * tile, y * tile, tile, tile);
        g.fillStyle = (x + y) % 2 ? '#17252b' : '#fff0d2'; g.fillRect(x * tile, h - (y + 1) * tile, tile, tile);
      }
      g.fillStyle = '#ee7049'; g.fillRect(0, 84, w, 88);
      g.fillStyle = '#fff5de'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 46px system-ui, sans-serif'; g.fillText('BALI COAST  •  GRAND PRIX', w / 2, 128);
    }, 1, 1);
    const banner = new T.Mesh(new T.PlaneGeometry(18.3, 1.55), new T.MeshBasicMaterial({ map: bannerTex, side: T.DoubleSide, toneMapped: false }));
    banner.rotation.y = Math.PI / 2; banner.position.set(0, 6.1, 0); gate.add(banner);

    const balloons = [0xe75b50, 0xffd05c, 0x3aabc3, 0xf07e9f, 0xf4eee0, 0x7c6ec4];
    const balloonMat = balloons.map(color => new T.MeshStandardMaterial({ color, roughness: .28, metalness: .04 }));
    for (let i = 0; i < 9; i++) {
      const z = -10.2 + (i % 4) * .5, y = 4.8 + Math.floor(i / 4) * .75 + Math.sin(i * 1.6) * .25;
      const x = (i % 2 ? .35 : -.35);
      const balloon = new T.Mesh(new T.SphereGeometry(.34, 16, 12), balloonMat[i % balloonMat.length]);
      balloon.position.set(x, y, z); balloon.scale.y = 1.28; gate.add(balloon);
      const cord = new T.Mesh(new T.CylinderGeometry(.012, .012, 1.15, 5), new T.MeshStandardMaterial({ color: 0xf0daba, roughness: .9 }));
      cord.position.set(x, y - .68, z); gate.add(cord);
    }
    scene.add(gate);

    // Short string-light garlands in the town sector echo the lively festival start.
    for (const index of [44, 86, 106]) {
      const center = pts[index], n = nm[index];
      const left = new T.Vector3(center.x - n.x * 10, 6.2, center.z - n.z * 10);
      const right = new T.Vector3(center.x + n.x * 10, 6.2, center.z + n.z * 10);
      const curve = new T.CatmullRomCurve3([left, new T.Vector3(center.x, 4.95, center.z), right]);
      scene.add(new T.Mesh(new T.TubeGeometry(curve, 22, .035, 6, false), new T.MeshStandardMaterial({ color: 0x473d34, roughness: .8 })));
      for (let i = 1; i < 8; i++) {
        const q = curve.getPoint(i / 8);
        const bulb = new T.Mesh(new T.SphereGeometry(.105, 10, 8), new T.MeshStandardMaterial({ color: 0xffe1a0, emissive: 0xffb64c, emissiveIntensity: .65, roughness: .28 }));
        bulb.position.copy(q); scene.add(bulb);
      }
    }

    const signPos = pts[28], signSide = nm[28];
    makeSign(signPos.x + signSide.x * 11, signPos.z + signSide.z * 11, heading,
      'MANGO COVE', 'PALM ISLAND ROUTE', '#367d79');
    const signPos2 = pts[570], signSide2 = nm[570];
    makeSign(signPos2.x - signSide2.x * 11, signPos2.z - signSide2.z * 11, Math.atan2(-tg[570].z, tg[570].x) + Math.PI,
      'DRIFTWOOD PIER', 'COASTAL DISTRICT', '#39728a');
  }

  function buildDocksAndBoards(rng) {
    const plankTexture = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#8d6543'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 48) {
        g.fillStyle = y % 96 ? '#9a704c' : '#7a573c'; g.fillRect(0, y, w, 46);
        g.strokeStyle = 'rgba(48,35,25,.48)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, y + 47); g.lineTo(w, y + 47); g.stroke();
        g.strokeStyle = 'rgba(238,198,139,.18)'; g.lineWidth = 1;
        for (let k = 0; k < 7; k++) { const x = rng() * w; g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x + 30 + rng() * 90, y + 6 + rng() * 5); g.stroke(); }
      }
    }, 1, 5);
    const wood = new T.MeshStandardMaterial({ map: plankTexture, color: 0xffffff, roughness: .92 });
    const postMat = new T.MeshStandardMaterial({ color: 0x765137, roughness: .95 });
    const postGeo = new T.CylinderGeometry(.16, .22, 3.3, 8);
    for (const angle of [.34, 2.84, 4.66]) {
      const dirX = Math.cos(angle), dirZ = Math.sin(angle), r = 226;
      const dock = new T.Group(); dock.position.set(dirX * r, 0, -115 + dirZ * r);
      dock.rotation.y = Math.atan2(dirX, dirZ);
      const deck = new T.Mesh(new T.BoxGeometry(8.6, .36, 42), wood); deck.position.set(0, .85, 12); deck.receiveShadow = true; deck.castShadow = true; dock.add(deck);
      const posts = new T.InstancedMesh(postGeo, postMat, 6), dummy = new T.Object3D();
      let postCount = 0;
      for (const side of [-1, 1]) for (const z of [-5, 12, 29]) {
        dummy.position.set(side * 4.1, -.25, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        posts.setMatrixAt(postCount++, dummy.matrix);
      }
      posts.count = postCount; posts.castShadow = true; posts.instanceMatrix.needsUpdate = true; dock.add(posts);
      scene.add(dock);

      // A few upright boards and striped beach umbrellas make the shoreline read as a place.
      const shoreX = dirX * 204, shoreZ = -115 + dirZ * 204;
      const surfGroup = new T.Group(); surfGroup.position.set(shoreX, 2.0, shoreZ); surfGroup.rotation.y = angle;
      const boardColors = [0xf05e4e, 0xf5e4bd, 0x31b9bc, 0xffbd4d];
      for (let i = 0; i < 3; i++) {
        const boardMat = new T.MeshStandardMaterial({ color: boardColors[(i + Math.floor(angle * 3)) % boardColors.length], roughness: .38, metalness: .02 });
        const shape = new T.Shape(); shape.moveTo(-.42, -1.75); shape.quadraticCurveTo(-.52, -.95, -.36, .8); shape.quadraticCurveTo(0, 2.25, .36, .8); shape.quadraticCurveTo(.52, -.95, .42, -1.75); shape.closePath();
        const geo = new T.ExtrudeGeometry(shape, { depth: .13, bevelEnabled: true, bevelThickness: .035, bevelSize: .035, bevelSegments: 2 });
        const board = new T.Mesh(geo, boardMat); board.position.set((i - 1) * 1.03, 0, 0); board.rotation.y = i * .11; surfGroup.add(board);
      }
      scene.add(surfGroup);

      const umbrella = new T.Group(); umbrella.position.set(dirX * 188, 0, -115 + dirZ * 188);
      const pole = new T.Mesh(new T.CylinderGeometry(.055, .075, 3.25, 8), postMat); pole.position.y = 1.62; umbrella.add(pole);
      const canopy = new T.Mesh(new T.ConeGeometry(2.15, .72, 12, 1), new T.MeshStandardMaterial({ color: 0xf4c261, roughness: .68, side: T.DoubleSide }));
      canopy.position.y = 3.1; umbrella.add(canopy); scene.add(umbrella);
    }
  }

  function buildExtraProps(rng) {
    const rockGeo = new T.IcosahedronGeometry(1, 0);
    const rockMat = new T.MeshStandardMaterial({ color: 0x70604e, roughness: .97, flatShading: true });
    const rocks = new T.InstancedMesh(rockGeo, rockMat, 72); const dummy = new T.Object3D(); let count = 0;
    for (let i = 0; i < 72; i++) {
      const idx = Math.floor(rng() * N), side = rng() < .5 ? -1 : 1, off = 10 + rng() * 25;
      const x = pts[idx].x + nm[idx].x * side * off, z = pts[idx].z + nm[idx].z * side * off;
      if (Math.hypot(x, z + 115) > 270) continue;
      const s = .45 + rng() * 2.2; dummy.position.set(x, s * .4, z);
      dummy.rotation.set(rng() * .5, rng() * 6, rng() * .45); dummy.scale.set(s * 1.3, s * .72, s); dummy.updateMatrix(); rocks.setMatrixAt(count, dummy.matrix);
      if (rocks.setColorAt) rocks.setColorAt(count, new T.Color([0x978b78, 0x847b6d, 0xada080][i % 3]));
      count++;
    }
    rocks.count = count; rocks.castShadow = true; rocks.receiveShadow = true; rocks.frustumCulled = false;
    rocks.instanceMatrix.needsUpdate = true; if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true; scene.add(rocks);

    // A few low-poly pennants are placed just beyond the racing line.
    const flagColors = [0xe85e4d, 0xffd166, 0x45a9a5, 0xf2ead8];
    for (const idx of [61, 73, 91, 465, 482, 498]) {
      const side = idx % 2 ? 1 : -1, n = nm[idx], p = pts[idx], x = p.x + n.x * side * 10.4, z = p.z + n.z * side * 10.4;
      const pole = new T.Mesh(new T.CylinderGeometry(.045, .07, 4.2, 7), new T.MeshStandardMaterial({ color: 0x6a4b32, roughness: .88 }));
      pole.position.set(x, 2.1, z); scene.add(pole);
      const flagGeo = new T.BufferGeometry();
      flagGeo.setAttribute('position', new T.Float32BufferAttribute([x,3.95,z, x,2.95,z, x + n.x * side * 1.4,3.43,z + n.z * side * 1.4], 3));
      flagGeo.setIndex([0,1,2]); flagGeo.computeVertexNormals();
      scene.add(new T.Mesh(flagGeo, new T.MeshStandardMaterial({ color: flagColors[Math.floor(idx / 10) % flagColors.length], side: T.DoubleSide, roughness: .7 })));
    }
  }

  function buildMysteryCrates() {
    if (!gifts.length) {
      const question = canvasTexture(256, 256, (g, w, h) => {
        const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, '#ffe76c'); grad.addColorStop(1, '#ff9e35');
        g.fillStyle = grad; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(113,67,25,.45)'; g.lineWidth = 14; g.strokeRect(8, 8, w - 16, h - 16);
        g.fillStyle = '#fff9e8'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 190px system-ui, sans-serif'; g.fillText('?', w / 2, h * .53);
      });
      const positions = [28, 73, 119, 164, 208, 253, 298, 343, 388, 431, 476, 519, 562, 607];
      positions.forEach((idx, i) => {
        const lane = (i % 3 - 1) * 4.1, p = pts[idx], n = nm[idx];
        const root = new T.Group();
        const crate = new T.Mesh(new T.BoxGeometry(1.5, 1.5, 1.5, 2, 2, 2), new T.MeshPhysicalMaterial({
          map: question, color: 0xffffff, emissive: 0x9d4812, emissiveIntensity: .22, metalness: .18, roughness: .28, clearcoat: .9
        }));
        crate.castShadow = true; root.add(crate);
        const halo = new T.Mesh(new T.TorusGeometry(1.2, .055, 10, 32), new T.MeshBasicMaterial({ color: 0xffedaa, transparent: true, opacity: .72 }));
        halo.rotation.x = Math.PI / 2; halo.position.y = -.23; root.add(halo);
        const spark = new T.Mesh(new T.OctahedronGeometry(.19, 0), new T.MeshStandardMaterial({ color: 0xfff2a6, emissive: 0xffcf4b, emissiveIntensity: 1.1 }));
        spark.position.set(.86, .92, 0); root.add(spark);
        root.position.set(p.x + n.x * lane, 1.4, p.z + n.z * lane); scene.add(root);
        gifts.push({ m: root, x: root.position.x, z: root.position.z, t: 0 });
      });
    }
  }

  function build(seed) {
    if (art.built) return;
    const rng = seeded(seed || 20261005);
    tuneExistingWorld(rng);
    buildTrackSurface(rng);
    buildPalms(rng);
    buildCoastRocks(rng);
    buildVillage(rng);
    buildDocksAndBoards(rng);
    buildExtraProps(rng);
    buildStartGate();
    buildMysteryCrates();
    art.built = true;
  }

  function update(dt, now) {
    if (!art.built) return;
    const time = now * .001;
    if (art.water) {
      const w = art.water, a = w.position, base = w.base;
      for (let i = 0; i < a.count; i++) {
        const k = i * 3, x = base[k], z = base[k + 2];
        a.array[k + 1] = base[k + 1] + Math.sin(x * .018 + time * 1.15) * .24 + Math.sin(z * .022 - time * .82) * .16;
      }
      a.needsUpdate = true; if((art.waterTicks++&1)===0)w.geometry.computeVertexNormals();
      w.texture.offset.x = (time * .006) % 1; w.texture.offset.y = (time * .003) % 1;
      if (foam && foam.material) foam.material.opacity = .43 + .11 * Math.sin(time * 1.2);
    }
    // A slow three-quarter fly-by frames the display buggy, checkered start gate and coast.
    if (art.menuCar) art.menuCar.root.visible = raceState === 'lobby';
    if (raceState === 'lobby' && art.menuCar) {
      const h = art.menuHeading, fx = Math.cos(h), fz = -Math.sin(h), nx = Math.sin(h), nz = Math.cos(h);
      const sway = Math.sin(now * .00018) * .55;
      const car = art.menuCar.root.position;
      const desired = new T.Vector3(car.x - fx * 12 - nx * (7 + sway), 6.1, car.z - fz * 12 - nz * (7 + sway));
      camera.position.lerp(desired, Math.min(1, dt * 1.8));
      camera.lookAt(car.x + fx * 8, 1.35, car.z + fz * 8);
      art.menuCar.tilt.rotation.z = Math.sin(now * .001) * .012;
      art.menuCar.root.position.y = Math.sin(now * .0014) * .025;
      const fov = 56; if (Math.abs(camera.fov - fov) > .1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 1.4); camera.updateProjectionMatrix(); }
    }
  }

  function install() {
    if (art.installed) return;
    art.installed = true;
    build(typeof seed !== 'undefined' ? seed : 20261005);
    if (typeof sceneryBuilt !== 'undefined') sceneryBuilt = true;
    buildMysteryCrates();
    if (typeof makeCar === 'function') {
      const p = pts[0], f = tg[0]; art.menuHeading = Math.atan2(-f.z, f.x);
      art.menuCar = makeCar(new T.Color('#ff5a1f').getHex(), SLOT_SKINS[0], true);
      art.menuCar.root.position.set(p.x - f.x * 10, 0, p.z - f.z * 10);
      art.menuCar.root.rotation.y = art.menuHeading;
      const fx = Math.cos(art.menuHeading), fz = -Math.sin(art.menuHeading), nx = Math.sin(art.menuHeading), nz = Math.cos(art.menuHeading);
      camera.position.set(art.menuCar.root.position.x - fx * 12 - nx * 7, 6.1, art.menuCar.root.position.z - fz * 12 - nz * 7);
      camera.lookAt(art.menuCar.root.position.x + fx * 8, 1.35, art.menuCar.root.position.z + fz * 8);
      camera.fov = 56; camera.updateProjectionMatrix();
    }
  }

  window.CoastalArt = { install, build, buildMysteryCrates, update };
})();
