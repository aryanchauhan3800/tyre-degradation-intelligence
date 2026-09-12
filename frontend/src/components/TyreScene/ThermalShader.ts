/**
 * TYRETRACE — 3D Tyre Tread Thermal Shader
 *
 * Implements:
 * - Continuous 7-stop calibrated Infrared (IR) thermal colormap rendered ON THE TREAD RUBBER SURFACE ONLY.
 * - Temperature computed as a continuous physical field across 5 tread width zones:
 *   [Inner Shoulder | Inner Tread | Center Tread | Outer Tread | Outer Shoulder]
 * - Rotational Heat Carriage: Heat generated at the road contact patch is physically
 *   carried around the wheel circumference by the rotating rubber mass.
 * - Self-emissive radiance: Thermal image is emitted AFTER lighting so scene lights cannot tint
 *   or wash it (true IR camera behavior).
 * - White-hot core clipping above 112°C, controlled emissive, no halos.
 * - Preserves PBR rubber roughness, tread grooves, bump/normal map, and specular highlights.
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
  uniform float uInnerShoulderTemp;
  uniform float uInnerTreadTemp;
  uniform float uCenterTreadTemp;
  uniform float uOuterTreadTemp;
  uniform float uOuterShoulderTemp;
  uniform float uSurfaceTemp;
  uniform float uContactPatchHeat;
  uniform float uWheelAngle;

  // Self-emissive radiance computed in the color chunk and emitted after lighting,
  // so the thermal image is completely independent of scene lights (true IR camera behavior).
  vec3 gThermalEmissive = vec3(0.0);

  // Exact 7-Stop Calibrated IR Thermal Spectrum (20°C to 120°C+)
  // 20–30°C  -> Deep Royal Blue
  // 30–45°C  -> Electric Cyan / Blue-Green
  // 45–60°C  -> Pure Emerald Green
  // 60–75°C  -> Intense Lemon Yellow
  // 75–90°C  -> Fiery Saturated Orange
  // 90–110°C -> Crimson Red
  // 110°C+   -> Extremely Hot Red / White Core
  vec3 getThermalPaletteColor(float tempC) {
    if (tempC <= 25.0) {
      return vec3(0.02, 0.15, 0.90); // Deep Royal Blue
    } else if (tempC < 40.0) {
      // 25-40°C: Deep Blue -> Cyan
      float t = (tempC - 25.0) / 15.0;
      return mix(vec3(0.02, 0.15, 0.90), vec3(0.00, 0.90, 0.96), t);
    } else if (tempC < 55.0) {
      // 40-55°C: Cyan -> Pure Emerald Green
      float t = (tempC - 40.0) / 15.0;
      return mix(vec3(0.00, 0.90, 0.96), vec3(0.12, 0.88, 0.22), t);
    } else if (tempC < 75.0) {
      // 55-75°C: Green -> Intense Lemon Yellow
      float t = (tempC - 55.0) / 20.0;
      return mix(vec3(0.12, 0.88, 0.22), vec3(0.98, 0.92, 0.04), t);
    } else if (tempC < 92.0) {
      // 75-92°C: Yellow -> Fiery Orange
      float t = (tempC - 75.0) / 17.0;
      return mix(vec3(0.98, 0.92, 0.04), vec3(1.00, 0.46, 0.00), t);
    } else if (tempC < 110.0) {
      // 92-110°C: Orange -> Crimson Red
      float t = (tempC - 92.0) / 18.0;
      return mix(vec3(1.00, 0.46, 0.00), vec3(1.00, 0.10, 0.00), t);
    } else {
      // >= 110°C: Extremely Hot Crimson Red to White-Hot Core
      float t = clamp((tempC - 110.0) / 15.0, 0.0, 1.0);
      return mix(vec3(1.00, 0.10, 0.00), vec3(1.00, 0.96, 0.88), t);
    }
  }

  // ---- Thermal imaging noise toolkit ----
  float thermalHash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float thermalNoise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = thermalHash21(i);
    float b = thermalHash21(i + vec2(1.0, 0.0));
    float c = thermalHash21(i + vec2(0.0, 1.0));
    float d = thermalHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float thermalFbm(vec2 p) {
    float v = 0.0;
    v += 0.5 * thermalNoise2(p);
    v += 0.25 * thermalNoise2(p * 2.3 + 17.3);
    v += 0.125 * thermalNoise2(p * 5.1 + 9.7);
    v += 0.0625 * thermalNoise2(p * 11.0 + 3.1);
    return v / 0.9375;
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

    // Position around circumference in LOCAL space — rotates with wheel mass
    float theta = atan(vThermalLocalPos.y, vThermalLocalPos.x);

    // ---------- SPATIAL TEMPERATURE FIELD INTERPOLATION (5 Width Zones) ----------
    // u=0.0: Inner Shoulder, u=0.25: Inner Tread, u=0.5: Center Tread, u=0.75: Outer Tread, u=1.0: Outer Shoulder
    float baseTemp;
    if (u < 0.25) {
      baseTemp = mix(uInnerShoulderTemp, uInnerTreadTemp, smoothstep(0.0, 0.25, u));
    } else if (u < 0.5) {
      baseTemp = mix(uInnerTreadTemp, uCenterTreadTemp, smoothstep(0.25, 0.5, u));
    } else if (u < 0.75) {
      baseTemp = mix(uCenterTreadTemp, uOuterTreadTemp, smoothstep(0.5, 0.75, u));
    } else {
      baseTemp = mix(uOuterTreadTemp, uOuterShoulderTemp, smoothstep(0.75, 1.0, u));
    }

    // Surface sensor skin bias
    baseTemp += (uSurfaceTemp - baseTemp) * 0.12;

    // ---------- ROTATIONAL HEAT CARRIAGE & CONTACT PATCH FRICTION ----------
    // World space down vector: contact patch is always at the road interface (bottom)
    float worldDown = dot(normalize(vThermalWorldNormal), vec3(0.0, -1.0, 0.0));
    float contactPatchZone = smoothstep(0.10, 0.95, worldDown);

    // Friction heat generated at contact patch (bottom of wheel)
    float directContactHeat = contactPatchZone * uContactPatchHeat * 12.0;

    // As wheel spins (uWheelAngle), rubber leaving the contact patch carries heat around!
    // We compute circumferential offset relative to the bottom contact zone
    float rotTheta = theta + uWheelAngle;
    float trailHeat = smoothstep(0.0, 3.14159, abs(mod(rotTheta + 1.5708, 6.28318) - 3.14159));
    float rubberMassHeat = (1.0 - trailHeat * 0.35) * uContactPatchHeat * 4.5;

    // Airflow convective cooling along upper arc
    float upperCool = smoothstep(0.10, 0.95, -worldDown) * 3.2;

    // Turbulent heat irregularities (value noise) carried by rotating rubber
    float ca = cos(theta);
    float sa = sin(theta);
    vec2 npA = vec2(ca, sa) * 2.8 + vec2(z * 15.0, z * 7.0);
    float turb = (thermalFbm(npA) - 0.5) * 4.8;
    float fine = (thermalNoise2(npA * 6.5) - 0.5) * 1.6;

    // Micro-wear thermal filaments along rolling direction
    float filament = thermalNoise2(vec2(ca, sa) * 9.0 + vec2(z * 28.0, 12.0));
    float filaments = smoothstep(0.62, 0.88, filament) * 2.2;

    float tempC = baseTemp + directContactHeat + rubberMassHeat - upperCool + turb + fine + filaments;

    // Groove thermal characteristics (cool groove valley, hot groove edge pooling)
    float h1 = abs(u - 0.25);
    float h2 = abs(u - 0.50);
    float h3 = abs(u - 0.75);
    float grooveCore = max(max(smoothstep(0.026, 0.005, h1), smoothstep(0.026, 0.005, h2)), smoothstep(0.026, 0.005, h3));
    float grooveHalo = max(max(smoothstep(0.055, 0.028, h1), smoothstep(0.055, 0.028, h2)), smoothstep(0.055, 0.028, h3));
    tempC -= grooveCore * 5.5;
    tempC += grooveHalo * 1.8;

    // ---------- INFRARED CAMERA COLORTABLE RENDERING ----------
    vec3 thermalColor = getThermalPaletteColor(tempC);

    // White-hot core clipping above 108°C
    float hotCore = smoothstep(108.0, 120.0, tempC);
    thermalColor = mix(thermalColor, vec3(1.0, 0.97, 0.90), hotCore * 0.55);

    // Subtle form lighting so rubber curvature remains readable
    float light = 0.92 + 0.08 * max(0.0, dot(vThermalWorldNormal, normalize(vec3(-0.5, 0.8, 0.6))));

    // IR Sensor noise grain
    float grain = fract(sin(dot(vThermalLocalPos.xy * 43.0 + theta, vec2(12.9898, 78.233))) * 43758.5453);
    thermalColor *= (0.975 + 0.05 * grain);

    // Emissivity modulation from rubber micro-wear
    float emissivity = 0.94 + 0.06 * thermalNoise2(vec2(ca, sa) * 5.2 + vec2(z * 20.0, 4.5));

    // Self-emissive thermal radiance added AFTER lighting
    gThermalEmissive = thermalColor * light * 1.15 * emissivity * uThermalActive;

    // Faint IR camera scanline effect
    float scan = 0.985 + 0.015 * sin(gl_FragCoord.y * 2.3);
    gThermalEmissive *= scan;

    // Diffuse goes dark carbon while thermal is active
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.013, 0.015), uThermalActive);
  }
`;

export const thermalEmissiveFragmentReplace = `
  #include <emissivemap_fragment>
  // Emit the full self-radiant thermal image (computed in color chunk)
  totalEmissiveRadiance += gThermalEmissive;
`;
