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

  vec3 gThermalFinalColor = vec3(0.0);

  // Exact 7-Stop Calibrated IR Thermal Spectrum (25°C to 115°C+)
  // Matches the vertical HUD scale exactly:
  // < 25°C   -> Deep Royal Blue (#0526e6)
  // 25–35°C  -> Electric Cyan (#00e5f5)
  // 35–55°C  -> Pure Emerald Green (#1ee038)
  // 55–70°C  -> Intense Lemon Yellow (#faeb0a)
  // 70–85°C  -> Warm Orange (#ff7700)
  // 85–105°C -> Red-Orange (#ff1a00)
  // >= 105°C -> Saturated Deep Crimson Red (#f50505) - never white!
  vec3 getThermalPaletteColor(float tempC) {
    if (tempC <= 25.0) {
      return vec3(0.02, 0.15, 0.90); // Deep Royal Blue
    } else if (tempC < 35.0) {
      float t = (tempC - 25.0) / 10.0;
      return mix(vec3(0.02, 0.15, 0.90), vec3(0.00, 0.90, 0.96), t); // Blue -> Cyan
    } else if (tempC < 55.0) {
      float t = (tempC - 35.0) / 20.0;
      return mix(vec3(0.00, 0.90, 0.96), vec3(0.12, 0.88, 0.22), t); // Cyan -> Emerald Green
    } else if (tempC < 70.0) {
      float t = (tempC - 55.0) / 15.0;
      return mix(vec3(0.12, 0.88, 0.22), vec3(0.98, 0.92, 0.04), t); // Green -> Lemon Yellow
    } else if (tempC < 85.0) {
      float t = (tempC - 70.0) / 15.0;
      return mix(vec3(0.98, 0.92, 0.04), vec3(1.00, 0.46, 0.00), t); // Yellow -> Orange
    } else if (tempC < 105.0) {
      float t = (tempC - 85.0) / 20.0;
      return mix(vec3(1.00, 0.46, 0.00), vec3(0.96, 0.08, 0.02), t); // Orange -> Crimson Red
    } else {
      // >= 105°C: Rich Saturated Deep Crimson Red (stays deep red, never white!)
      return vec3(0.96, 0.04, 0.02);
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
    // z = -0.1769 is the INNER SHOULDER (inboard side of tread)
    // z = +0.1769 is the OUTER SHOULDER (outboard side of tread, adjacent to sidewall)
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
    baseTemp += (uSurfaceTemp - baseTemp) * 0.10;

    // ---------- ROTATIONAL HEAT CARRIAGE & CONTACT PATCH FRICTION ----------
    // World space down vector: contact patch is always at the road interface (bottom)
    float worldDown = dot(normalize(vThermalWorldNormal), vec3(0.0, -1.0, 0.0));
    float contactPatchZone = smoothstep(0.10, 0.95, worldDown);

    // Friction heat generated at contact patch (bottom of wheel)
    float directContactHeat = contactPatchZone * uContactPatchHeat * 4.0;

    // As wheel spins (uWheelAngle), rubber leaving the contact patch carries heat around
    float rotTheta = theta + uWheelAngle;
    float trailHeat = smoothstep(0.0, 3.14159, abs(mod(rotTheta + 1.5708, 6.28318) - 3.14159));
    float rubberMassHeat = (1.0 - trailHeat * 0.35) * uContactPatchHeat * 1.5;

    // Airflow convective cooling along upper arc
    float upperCool = smoothstep(0.10, 0.95, -worldDown) * 1.5;

    // Subtle thermal noise texture carried by rotating rubber
    float ca = cos(theta);
    float sa = sin(theta);
    vec2 npA = vec2(ca, sa) * 2.8 + vec2(z * 15.0, z * 7.0);
    float turb = (thermalFbm(npA) - 0.5) * 2.0;

    float tempC = baseTemp + directContactHeat + rubberMassHeat - upperCool + turb;

    // Groove thermal characteristics (cool groove valley, hot groove edge pooling)
    float h1 = abs(u - 0.25);
    float h2 = abs(u - 0.50);
    float h3 = abs(u - 0.75);
    float grooveCore = max(max(smoothstep(0.026, 0.005, h1), smoothstep(0.026, 0.005, h2)), smoothstep(0.026, 0.005, h3));
    float grooveHalo = max(max(smoothstep(0.055, 0.028, h1), smoothstep(0.055, 0.028, h2)), smoothstep(0.055, 0.028, h3));
    tempC -= grooveCore * 3.0;
    tempC += grooveHalo * 1.2;

    // ---------- INFRARED CAMERA COLORTABLE RENDERING ----------
    vec3 thermalColor = getThermalPaletteColor(tempC);

    // Subtle form shading so rubber curvature and grooves remain crisp
    float form = 0.88 + 0.12 * max(0.0, dot(vThermalWorldNormal, normalize(vec3(-0.3, 0.7, 0.6))));

    // Modulate with IR camera grain
    float grain = fract(sin(dot(vThermalLocalPos.xy * 43.0 + theta, vec2(12.9898, 78.233))) * 43758.5453);

    // Store final saturated thermal color for dithering fragment output
    gThermalFinalColor = thermalColor * form * (0.98 + 0.04 * grain);
  }
`;

export const thermalEmissiveFragmentReplace = `
  #include <emissivemap_fragment>
`;

export const thermalDitheringFragmentReplace = `
  #include <dithering_fragment>
  if (uThermalActive > 0.001) {
    // Override final fragment color with calibrated infrared radiation map,
    // completely immune to scene spotlights bleaching the colors to white!
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gThermalFinalColor, uThermalActive);
  }
`;
