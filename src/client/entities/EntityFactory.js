/**
 * Entity Factory — pure functions that create Three.js geometry/meshes.
 * No scene, no state, no side effects.
 *
 * Geometry caching: identical geometries (same type+shape+size) share a single
 * BufferGeometry instance. Callers must NOT dispose cached geometries directly.
 */

import * as THREE from 'three';
import { GEOMETRY_TEMPLATES } from '../GeometryTemplates.js';
import { createEntityToonMaterial, getEntityColor } from '../ToonMaterials.js';
import { createWindShaderMaterial, registerConveyorMaterial } from '../SurfaceShaders.js';

export function createBeveledBox(sx, sy, sz) {
  const bevel = Math.max(0.12, Math.min((sx + sz) / 2 * 0.06, sy * 0.4));
  const hx = sx / 2 - bevel;
  const hz = sz / 2 - bevel;

  const profile = new THREE.Shape();
  profile.moveTo(-hx, -hz);
  profile.lineTo(hx, -hz);
  profile.quadraticCurveTo(hx + bevel, -hz, hx + bevel, -hz + bevel);
  profile.lineTo(hx + bevel, hz);
  profile.quadraticCurveTo(hx + bevel, hz + bevel, hx, hz + bevel);
  profile.lineTo(-hx, hz + bevel);
  profile.quadraticCurveTo(-hx - bevel, hz + bevel, -hx - bevel, hz);
  profile.lineTo(-hx - bevel, -hz + bevel);
  profile.quadraticCurveTo(-hx - bevel, -hz, -hx, -hz);

  const geo = new THREE.ExtrudeGeometry(profile, {
    depth: sy,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
  });

  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -sy / 2, 0);
  return geo;
}

// ─── Geometry Cache ──────────────────────────────────────────
const _geometryCache = new Map();

export function getGeometryCacheKey(entity) {
  const shape = entity.properties?.shape || '';
  const [sx, sy, sz] = entity.size || [1, 1, 1];
  return `${entity.type}|${shape}|${sx}|${sy}|${sz}`;
}

function _createGeometry(entity) {
  const shape = entity.properties?.shape;
  const [sx, sy, sz] = entity.size || [1, 1, 1];

  if (!shape) {
    if (entity.type === 'collectible') {
      return new THREE.IcosahedronGeometry(0.5, 0);
    }
    if (entity.type === 'trigger' && entity.properties?.isGoal) {
      return new THREE.TorusGeometry(Math.max(sx, sz) / 2, Math.min(sx, sz) / 6, 12, 32);
    }
    if (entity.type === 'platform' || entity.type === 'ramp') {
      return createBeveledBox(sx, sy, sz);
    }
    return new THREE.BoxGeometry(sx, sy, sz);
  }

  if (GEOMETRY_TEMPLATES[shape]) {
    return GEOMETRY_TEMPLATES[shape](sx, sy, sz);
  }

  const maxDim = Math.max(sx, sy, sz) / 2;
  switch (shape) {
    case 'sphere':       return new THREE.SphereGeometry(maxDim, 16, 16);
    case 'cylinder':     return new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 16);
    case 'cone':         return new THREE.ConeGeometry(sx / 2, sy, 16);
    case 'pyramid':      return new THREE.ConeGeometry(sx / 2, sy, 4);
    case 'torus':        return new THREE.TorusGeometry(sx / 2, Math.min(sx, sz) / 6, 8, 24);
    case 'dodecahedron': return new THREE.DodecahedronGeometry(maxDim);
    case 'icosahedron':  return new THREE.IcosahedronGeometry(maxDim, 0);
    case 'octahedron':   return new THREE.OctahedronGeometry(maxDim);
    case 'ring':         return new THREE.TorusGeometry(sx / 2, Math.max(0.2, sx / 8), 8, 32);
    default:             return new THREE.BoxGeometry(sx, sy, sz);
  }
}

export function getGeometry(entity) {
  const key = getGeometryCacheKey(entity);
  let geo = _geometryCache.get(key);
  if (!geo) {
    geo = _createGeometry(entity);
    geo.computeBoundingSphere();
    _geometryCache.set(key, geo);
  }
  return geo;
}

// ─── Glow Geometry Cache ─────────────────────────────────────
let _collectibleGlowGeo = null;
const _goalGlowGeoCache = new Map();

function getCollectibleGlowGeometry() {
  if (!_collectibleGlowGeo) {
    _collectibleGlowGeo = new THREE.SphereGeometry(1.0, 16, 16);
    _collectibleGlowGeo.computeBoundingSphere();
  }
  return _collectibleGlowGeo;
}

function getGoalGlowGeometry(radius) {
  const key = radius.toFixed(2);
  let geo = _goalGlowGeoCache.get(key);
  if (!geo) {
    geo = new THREE.SphereGeometry(radius, 16, 16);
    geo.computeBoundingSphere();
    _goalGlowGeoCache.set(key, geo);
  }
  return geo;
}

export function clearGeometryCache() {
  for (const geo of _geometryCache.values()) geo.dispose();
  _geometryCache.clear();

  if (_collectibleGlowGeo) {
    _collectibleGlowGeo.dispose();
    _collectibleGlowGeo = null;
  }

  for (const geo of _goalGlowGeoCache.values()) geo.dispose();
  _goalGlowGeoCache.clear();
}

function _drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function _createTextSpriteTexture(text, {
  width = 256,
  height = 128,
  background = '#2c3e50',
  color = '#ffffff',
  stroke = '#0d0520',
  fontSize = 28,
  padding = 16,
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, width, height);

  _drawRoundedRect(ctx, padding / 2, padding / 2, width - padding, height - padding, 18);
  ctx.fillStyle = background;
  ctx.globalAlpha = 0.92;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.lineWidth = 5;
  ctx.strokeStyle = stroke;
  ctx.stroke();

  const lines = String(text || '').split('\n').slice(0, 2);
  ctx.font = `700 ${fontSize}px Nunito, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (lines.length === 1) {
    ctx.fillText(lines[0], width / 2, height / 2);
  } else {
    const spacing = Math.max(20, fontSize * 0.95);
    const startY = height / 2 - spacing / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], width / 2, startY + i * spacing);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function _updateTextSprite(mesh, key, {
  text,
  background,
  color = '#ffffff',
  scale = [3.4, 1.7, 1],
  fontSize = 26,
}) {
  let sprite = mesh.userData[key];
  const prevText = sprite?.userData?.text;
  const prevBg = sprite?.userData?.background;
  const prevColor = sprite?.userData?.color;
  if (sprite && prevText === text && prevBg === background && prevColor === color) return sprite;

  const map = _createTextSpriteTexture(text, {
    background,
    color,
    fontSize,
  });

  if (!sprite) {
    const material = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    sprite = new THREE.Sprite(material);
    sprite.center.set(0.5, 0.5);
    mesh.add(sprite);
    mesh.userData[key] = sprite;
  } else {
    const oldMap = sprite.material?.map;
    if (sprite.material) sprite.material.map = map;
    if (oldMap) oldMap.dispose();
  }

  sprite.scale.set(scale[0], scale[1], scale[2] || 1);
  sprite.userData = {
    ...(sprite.userData || {}),
    text,
    background,
    color,
  };
  return sprite;
}

export function syncRiskEntityOverlays(mesh, entity) {
  const props = entity.properties || {};

  if (props.isRiskLabel) {
    // Hide anchor mesh; render only billboard label.
    mesh.material.transparent = true;
    mesh.material.opacity = 0;
    mesh.material.depthWrite = false;

    _updateTextSprite(mesh, 'riskLabelSprite', {
      text: props.text || '',
      background: props.bgColor || '#2c3e50',
      color: '#ffffff',
      scale: [3.9, 2.0, 1],
      fontSize: 24,
    });
  }

  if (props.riskDieValue !== undefined && props.riskDieValue !== null) {
    _updateTextSprite(mesh, 'riskDieSprite', {
      text: String(props.riskDieValue),
      background: props.riskDieSide === 'defender' ? '#202020' : '#ffffff',
      color: props.riskDieSide === 'defender' ? '#ffffff' : '#202020',
      scale: [1.05, 1.05, 1],
      fontSize: 42,
    });
    const dieSprite = mesh.userData.riskDieSprite;
    if (dieSprite) dieSprite.position.set(0, 0, 0.48);
  }
}

// ─── Mesh Creation ───────────────────────────────────────────
export function createEntityMesh(entity) {
  const geometry = getGeometry(entity);
  const props = entity.properties || {};
  const color = getEntityColor(entity.type, props.color);

  let material;
  if (props.isWind) {
    material = createWindShaderMaterial(props.windForce || [1, 0, 0]);
  } else {
    material = createEntityToonMaterial(entity);
  }

  if (props.isConveyor && material.map) {
    registerConveyorMaterial(material, props.conveyorSpeed || 6, props.conveyorDir || [1, 0, 0]);
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...entity.position);
  if (props.rotation) {
    mesh.rotation.set(props.rotation[0] || 0, props.rotation[1] || 0, props.rotation[2] || 0);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { entity, rotating: props.rotating, speed: props.speed || 1 };

  if (entity.type === 'collectible') {
    const glowGeometry = getCollectibleGlowGeometry();
    const glowMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    mesh.add(glow);
  }

  if (entity.type === 'trigger' && props.isGoal) {
    const [sx, sy, sz] = entity.size || [3, 3, 3];
    const radius = Math.max(sx, sy, sz) * 0.6;
    const goalGlow = new THREE.Mesh(
      getGoalGlowGeometry(radius),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mesh.add(goalGlow);
  }

  syncRiskEntityOverlays(mesh, entity);

  return mesh;
}
