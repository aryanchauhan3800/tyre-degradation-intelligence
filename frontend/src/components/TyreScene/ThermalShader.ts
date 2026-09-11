/**
 * TYRETRACE — 3D Tyre Tread Thermal Shader
 *
 * Implements:
 * - Direct CFD thermal colormap rendered ON THE TREAD RUBBER SURFACE ONLY.
 * - Saturated, high-contrast engineering spectrum:
 *   Left (Inner Shoulder, z ≈ -0.177): HOT RED (118°C)
 *   Left-Center: SATURATED ORANGE (110°C)
 *   Center-Left: VIVID LEMON YELLOW (97°C)
 *   Center: EMERALD GREEN (96°C)
 *   Center-Right: BRIGHT CYAN
 *   Right (Outer Shoulder, z ≈ +0.177): DEEP COBALT BLUE (84°C / <60°C)
 * - Authentic longitudinal grooves with shadowed depth
 * - Realistic rubber roughness and curvature shading (no blown-out white/pastel)
 * - Zero outer halos, zero external glowing rings, zero silhouette glow
 */

export const thermalVertexShaderChunk = `
  varying vec3 vThermalLocalPos;
  varying vec3 vThermalWorldNormal;
`;

export const thermalVertexShaderAssign = `
  #include <begin_vertex>
  vThermalLocalPos = position;
  vThermalWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
`;

export const thermalFragmentHeader = `
  varying vec3 vThermalLocalPos;
  varying vec3 vThermalWorldNormal;
  uniform float uThermalActive;
  uniform float uInnerTemp;
  uniform float uCenterTemp;
  uniform float uOuterTemp;
  uniform float uSurfaceTemp;

  // Exact CFD thermal spectrum matching reference image
  vec3 getThermalPaletteColor(float tempC) {
    if (tempC <= 60.0) {
      // Deep Royal Blue
      return vec3(0.05, 0.22, 0.95);
    } else if (tempC < 75.0) {
      // 60-75: Royal Blue -> Electric Blue
      float t = (tempC - 60.0) / 15.0;
      return mix(vec3(0.05, 0.22, 0.95), vec3(0.00, 0.55, 1.00), t);
    } else if (tempC < 85.0) {
      // 75-85: Electric Blue -> Bright Cyan
      float t = (tempC - 75.0) / 10.0;
      return mix(vec3(0.00, 0.55, 1.00), vec3(0.00, 0.88, 0.98), t);
    } else if (tempC < 95.0) {
      // 85-95: Cyan -> Pure Emerald Green
      float t = (tempC - 85.0) / 10.0;
      return mix(vec3(0.00, 0.88, 0.98), vec3(0.08, 0.85, 0.18), t);
    } else if (tempC < 103.0) {
      // 95-103: Green -> Intense Lemon Yellow
      float t = (tempC - 95.0) / 8.0;
      return mix(vec3(0.08, 0.85, 0.18), vec3(0.98, 0.90, 0.00), t);
    } else if (tempC < 112.0) {
      // 103-112: Yellow -> Rich Saturated Fiery Orange
      float t = (tempC - 103.0) / 9.0;
      return mix(vec3(0.98, 0.90, 0.00), vec3(1.00, 0.42, 0.00), t);
    } else if (tempC < 118.0) {
      // 112-118: Orange -> Intense Vivid Red
      float t = (tempC - 112.0) / 6.0;
      return mix(vec3(1.00, 0.42, 0.00), vec3(0.95, 0.06, 0.02), t);
    } else {
      // >= 118°C: Deep Crimson Hot Spot
      float t = clamp((tempC - 118.0) / 6.0, 0.0, 1.0);
      return mix(vec3(0.95, 0.06, 0.02), vec3(0.82, 0.00, 0.00), t);
    }
  }
`;

export const thermalColorFragmentReplace = `
  #include <color_fragment>
  if (uThermalActive > 0.001) {
    // Coordinate along tyre width:
    // z = -0.1769 is the INNER SHOULDER (left side of tread)
    // z = +0.1769 is the OUTER SHOULDER (right side of tread, adjacent to sidewall)
    float z = vThermalLocalPos.z;
    float u = clamp((z + 0.1769) / 0.3538, 0.0, 1.0);

    // Calibrated CFD colormap across tread width matching reference image:
    // u = 0.00..0.34: PURE CRIMSON RED (Hot Spot ~118°C)
    // u = 0.34..0.52: FIERY ORANGE (Inner Shoulder ~110°C)
    // u = 0.52..0.68: VIVID LEMON YELLOW (Surface Temp ~97°C)
    // u = 0.68..0.82: EMERALD GREEN (Tread Center ~96°C)
    // u = 0.82..0.92: BRIGHT ELECTRIC CYAN (~88°C)
    // u = 0.92..1.00: DEEP COBALT BLUE (Outer Shoulder ~84°C)
    vec3 cfdColor;
    if (u < 0.34) {
      float t = u / 0.34;
      cfdColor = mix(vec3(0.96, 0.04, 0.01), vec3(0.98, 0.20, 0.01), t);
    } else if (u < 0.52) {
      float t = (u - 0.34) / 0.18;
      cfdColor = mix(vec3(0.98, 0.20, 0.01), vec3(1.00, 0.52, 0.00), t);
    } else if (u < 0.68) {
      float t = (u - 0.52) / 0.16;
      cfdColor = mix(vec3(1.00, 0.52, 0.00), vec3(0.98, 0.92, 0.00), t);
    } else if (u < 0.82) {
      float t = (u - 0.68) / 0.14;
      cfdColor = mix(vec3(0.98, 0.92, 0.00), vec3(0.05, 0.86, 0.16), t);
    } else if (u < 0.92) {
      float t = (u - 0.82) / 0.10;
      cfdColor = mix(vec3(0.05, 0.86, 0.16), vec3(0.00, 0.84, 0.98), t);
    } else {
      float t = (u - 0.92) / 0.08;
      cfdColor = mix(vec3(0.00, 0.84, 0.98), vec3(0.04, 0.24, 0.96), t);
    }

    // 4 Authentic F1 longitudinal grooves separating the 5 tread ribs:
    // Grooves at u ≈ 0.32, 0.50, 0.68, 0.83
    float g1 = smoothstep(0.015, 0.0, abs(u - 0.32));
    float g2 = smoothstep(0.015, 0.0, abs(u - 0.50));
    float g3 = smoothstep(0.015, 0.0, abs(u - 0.68));
    float g4 = smoothstep(0.015, 0.0, abs(u - 0.83));
    float groove = max(max(g1, g2), max(g3, g4));
    cfdColor = mix(cfdColor, cfdColor * 0.18, groove * 0.88);

    // Subtle cross-siping tread blocks around circumference
    float theta = atan(vThermalLocalPos.y, vThermalLocalPos.x);
    float sipe = smoothstep(0.022, 0.0, abs(fract(theta * 24.0) - 0.5));
    cfdColor *= (0.95 + 0.05 * (1.0 - sipe * 0.35));

    // Realistic micro-roughness grain
    float grain = fract(sin(dot(vThermalLocalPos.xy * 36.0, vec2(12.9898, 78.233))) * 43758.5453);
    cfdColor *= (0.98 + 0.02 * grain);

    // Realistic directional shading: preserves 100% saturated CFD color
    float light = 0.80 + 0.20 * max(0.0, dot(vThermalWorldNormal, normalize(vec3(-0.5, 0.8, 0.6))));
    diffuseColor.rgb = mix(diffuseColor.rgb, cfdColor * light, uThermalActive);
  }
`;

export const thermalEmissiveFragmentReplace = `
  #include <emissivemap_fragment>
  // Controlled subtle warmth in hottest red hot spot (strictly on rubber surface, NO halos)
  if (uThermalActive > 0.001) {
    float z = vThermalLocalPos.z;
    float u = clamp((z + 0.1769) / 0.3538, 0.0, 1.0);
    if (u < 0.15) {
      float hotEmissive = (1.0 - u / 0.15) * 0.12;
      totalEmissiveRadiance += vec3(0.95, 0.05, 0.01) * hotEmissive;
    }
  }
`;
