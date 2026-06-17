import { describe, it, expect, beforeEach } from 'vitest';

// Import the store factory directly so each test gets a fresh instance.
// Do NOT import the singleton `useMobiusStore` here — tests share module state.
import { createMobiusStore, MOBIUS_DEFAULTS, PRESETS } from '@/app/stores/mobiusStore';

describe('mobiusStore', () => {
  let store: ReturnType<typeof createMobiusStore>;

  beforeEach(() => {
    store = createMobiusStore();
  });

  it('initializes with MOBIUS_DEFAULTS', () => {
    const state = store.getState();
    expect(state.tubeRadius).toBe(MOBIUS_DEFAULTS.tubeRadius);
    expect(state.activePreset).toBe('home');
  });

  it('reset() restores MOBIUS_DEFAULTS', () => {
    store.getState().setUniforms({ tubeRadius: 0.001, bloomIntensity: 99 });
    store.getState().reset();
    const state = store.getState();
    expect(state.tubeRadius).toBe(MOBIUS_DEFAULTS.tubeRadius);
    expect(state.bloomIntensity).toBe(MOBIUS_DEFAULTS.bloomIntensity);
  });

  it('setPreset("tokens") applies tokens preset values', () => {
    store.getState().setPreset('tokens');
    const state = store.getState();
    expect(state.activePreset).toBe('tokens');
    expect(state.tubeRadius).toBe(PRESETS.tokens.tubeRadius);
    expect(state.uWaveAmplitude).toBe(PRESETS.tokens.uWaveAmplitude);
  });

  it('setPreset("lab") does not change geometry uniforms', () => {
    store.getState().setUniforms({ tubeRadius: 0.07 });
    store.getState().setPreset('lab');
    expect(store.getState().tubeRadius).toBe(0.07); // unchanged
    expect(store.getState().activePreset).toBe('lab');
  });

  it('setPreset("sketchbook") does not change geometry uniforms', () => {
    store.getState().setUniforms({ tubeRadius: 0.07 });
    store.getState().setPreset('sketchbook');
    expect(store.getState().tubeRadius).toBe(0.07);
    expect(store.getState().activePreset).toBe('sketchbook');
  });

  it('setUniforms merges partial state', () => {
    const original = store.getState().pathRadius;
    store.getState().setUniforms({ tubeRadius: 0.09 });
    expect(store.getState().tubeRadius).toBe(0.09);
    expect(store.getState().pathRadius).toBe(original); // untouched
  });

  it('PRESETS covers all 9 preset keys', () => {
    const keys = [
      'home',
      'tokens',
      'foundations',
      'components',
      'content',
      'hirobius',
      'sketchbook',
      'glitch',
      'lab',
    ] as const;
    keys.forEach((key) => {
      expect(PRESETS).toHaveProperty(key);
    });
  });

  it('reducedMotion defaults to false when matchMedia is unavailable', () => {
    // JSDOM does not implement matchMedia; factory should not throw and should
    // return false rather than crashing.
    const s = createMobiusStore().getState();
    expect(typeof s.reducedMotion).toBe('boolean');
    expect(s.reducedMotion).toBe(false);
  });

  // ── New branch-coverage tests ──────────────────────────────────────────────

  describe('setNavScrollProgress clamping', () => {
    it('clamps progress above 1 to 1', () => {
      store.getState().setNavScrollProgress(2.5);
      expect(store.getState().navScrollProgress).toBe(1);
    });

    it('clamps progress below 0 to 0', () => {
      store.getState().setNavScrollProgress(-0.5);
      expect(store.getState().navScrollProgress).toBe(0);
    });

    it('passes through in-range values unchanged', () => {
      store.getState().setNavScrollProgress(0.42);
      expect(store.getState().navScrollProgress).toBeCloseTo(0.42);
    });

    it('clamps exactly 0 and 1 as-is', () => {
      store.getState().setNavScrollProgress(0);
      expect(store.getState().navScrollProgress).toBe(0);
      store.getState().setNavScrollProgress(1);
      expect(store.getState().navScrollProgress).toBe(1);
    });
  });

  describe('setPerformanceTier', () => {
    it('updates performanceTier to medium', () => {
      store.getState().setPerformanceTier('medium');
      expect(store.getState().performanceTier).toBe('medium');
      expect(store.getState().layout.performanceTier).toBe('medium');
    });

    it('updates performanceTier to low', () => {
      store.getState().setPerformanceTier('low');
      expect(store.getState().performanceTier).toBe('low');
    });

    it('updates performanceTier back to high', () => {
      store.getState().setPerformanceTier('low');
      store.getState().setPerformanceTier('high');
      expect(store.getState().performanceTier).toBe('high');
    });
  });

  describe('setNavScrollVisible', () => {
    it('sets navScrollVisible to false', () => {
      store.getState().setNavScrollVisible(false);
      expect(store.getState().navScrollVisible).toBe(false);
      expect(store.getState().layout.navScrollVisible).toBe(false);
    });

    it('sets navScrollVisible back to true', () => {
      store.getState().setNavScrollVisible(false);
      store.getState().setNavScrollVisible(true);
      expect(store.getState().navScrollVisible).toBe(true);
    });
  });

  describe('setNavAcrylicHovered', () => {
    it('sets navAcrylicHovered to true', () => {
      store.getState().setNavAcrylicHovered(true);
      expect(store.getState().navAcrylicHovered).toBe(true);
      expect(store.getState().layout.navAcrylicHovered).toBe(true);
    });

    it('sets navAcrylicHovered back to false', () => {
      store.getState().setNavAcrylicHovered(true);
      store.getState().setNavAcrylicHovered(false);
      expect(store.getState().navAcrylicHovered).toBe(false);
    });
  });

  describe('clearRouteSplash', () => {
    it('clears routeSplashActive and resets startedAt to 0', () => {
      // Trigger a splash first (reducedMotion=false is the default)
      store.getState().triggerRouteSplash({});
      expect(store.getState().routeSplashActive).toBe(true);

      store.getState().clearRouteSplash();
      expect(store.getState().routeSplashActive).toBe(false);
      expect(store.getState().routeSplashStartedAt).toBe(0);
      expect(store.getState().layout.routeSplashActive).toBe(false);
    });
  });

  describe('triggerRouteSplash', () => {
    it('activates splash with default config when no args passed', () => {
      store.getState().triggerRouteSplash();
      const s = store.getState();
      expect(s.routeSplashActive).toBe(true);
      expect(s.routeSplashDurationMs).toBe(620); // DEFAULT_ROUTE_SPLASH.routeSplashDurationMs
    });

    it('activates splash with custom config values', () => {
      store.getState().triggerRouteSplash({
        routeSplashDurationMs: 1000,
        routeSplashStrength: 0.5,
        routeSplashOriginX: 0.25,
        routeSplashOriginY: 0.75,
      });
      const s = store.getState();
      expect(s.routeSplashActive).toBe(true);
      expect(s.routeSplashDurationMs).toBe(1000);
      expect(s.routeSplashStrength).toBe(0.5);
      expect(s.routeSplashOriginX).toBe(0.25);
      expect(s.routeSplashOriginY).toBe(0.75);
    });

    it('does NOT activate splash when reducedMotion is true', () => {
      // Simulate reducedMotion=true by directly patching the state
      // (createMobiusStore uses window.matchMedia which jsdom doesn't provide,
      // so we override via setUniforms-style hack on the store internals)
      // We use zustand setState to force reducedMotion=true
      store.setState({ reducedMotion: true });
      store.getState().triggerRouteSplash();
      // reducedMotion=true → triggerRouteSplash returns s unchanged
      expect(store.getState().routeSplashActive).toBe(false);
    });

    it('mirrors splash state into layout slice', () => {
      store.getState().triggerRouteSplash({ routeSplashOriginX: 0.1 });
      expect(store.getState().layout.routeSplashOriginX).toBe(0.1);
    });
  });

  describe('setPreset — routeSplash branches', () => {
    it('triggers route splash on normal preset when reducedMotion=false', () => {
      store.getState().setPreset('tokens');
      const s = store.getState();
      expect(s.routeSplashActive).toBe(true);
      expect(s.routeSplashDurationMs).toBe(260);
      expect(s.routeSplashStrength).toBeCloseTo(0.22);
    });

    it('does NOT trigger route splash when reducedMotion=true', () => {
      store.setState({ reducedMotion: true });
      store.getState().setPreset('tokens');
      // reducedMotion branch: splash is NOT activated
      expect(store.getState().routeSplashActive).toBe(false);
    });

    it('setPreset("lab") only updates activePreset — no splash', () => {
      store.getState().setPreset('lab');
      expect(store.getState().routeSplashActive).toBe(false);
    });

    it('setPreset("sketchbook") only updates activePreset — no splash', () => {
      store.getState().setPreset('sketchbook');
      expect(store.getState().routeSplashActive).toBe(false);
    });
  });

  describe('syncRoute — route → preset mapping', () => {
    it('syncs / to home preset', () => {
      store.getState().syncRoute('/');
      expect(store.getState().activePreset).toBe('home');
    });

    it('syncs /hds to home preset', () => {
      store.getState().syncRoute('/hds');
      expect(store.getState().activePreset).toBe('home');
    });

    it('syncs /info to content preset', () => {
      store.getState().syncRoute('/info');
      expect(store.getState().activePreset).toBe('content');
    });

    it('syncs /hds/tokens to tokens preset', () => {
      store.getState().syncRoute('/hds/tokens');
      expect(store.getState().activePreset).toBe('tokens');
    });

    it('syncs /hds/color to foundations preset', () => {
      store.getState().syncRoute('/hds/color');
      expect(store.getState().activePreset).toBe('foundations');
    });

    it('syncs /hds/typography to foundations preset', () => {
      store.getState().syncRoute('/hds/typography');
      expect(store.getState().activePreset).toBe('foundations');
    });

    it('syncs /hds/components/button to components preset', () => {
      store.getState().syncRoute('/hds/components/button');
      expect(store.getState().activePreset).toBe('components');
    });

    it('syncs /hds/patterns to components preset', () => {
      store.getState().syncRoute('/hds/patterns');
      expect(store.getState().activePreset).toBe('components');
    });

    it('syncs /visuals to content preset', () => {
      store.getState().syncRoute('/visuals');
      expect(store.getState().activePreset).toBe('content');
    });

    it('syncs /microsoft-design-systems to content preset', () => {
      store.getState().syncRoute('/microsoft-design-systems');
      expect(store.getState().activePreset).toBe('content');
    });

    it('syncs /portfolio/anything to content preset', () => {
      store.getState().syncRoute('/portfolio/my-project');
      expect(store.getState().activePreset).toBe('content');
    });

    it('syncs /case-studies/hirobius to hirobius preset', () => {
      store.getState().syncRoute('/case-studies/hirobius');
      expect(store.getState().activePreset).toBe('hirobius');
    });

    it('syncs /portfolio/hirobius to hirobius preset', () => {
      store.getState().syncRoute('/portfolio/hirobius');
      expect(store.getState().activePreset).toBe('hirobius');
    });

    it('syncs /hds/case-studies/hirobius to hirobius preset', () => {
      store.getState().syncRoute('/hds/case-studies/hirobius');
      expect(store.getState().activePreset).toBe('hirobius');
    });

    it('syncs /hds/process to hirobius preset', () => {
      store.getState().syncRoute('/hds/process');
      expect(store.getState().activePreset).toBe('hirobius');
    });

    it('syncs /vibe-sketchbook to sketchbook preset', () => {
      store.getState().syncRoute('/vibe-sketchbook');
      expect(store.getState().activePreset).toBe('sketchbook');
    });

    it('syncs /vibe-sketchbook/anything to sketchbook preset', () => {
      store.getState().syncRoute('/vibe-sketchbook/my-sketch');
      expect(store.getState().activePreset).toBe('sketchbook');
    });

    it('syncs /vibe-sketchbook/logo-lab to lab preset', () => {
      store.getState().syncRoute('/vibe-sketchbook/logo-lab');
      expect(store.getState().activePreset).toBe('lab');
    });

    it('syncs unknown route to home preset with hidden layout', () => {
      store.getState().syncRoute('/some/unknown/path');
      expect(store.getState().activePreset).toBe('home');
      // Hidden layout means layoutMode = 'hidden'
      expect(store.getState().layoutMode).toBe('hidden');
    });

    it('resets navScrollVisible and navScrollProgress on syncRoute', () => {
      store.getState().setNavScrollVisible(false);
      store.getState().setNavScrollProgress(0.9);
      store.getState().syncRoute('/hds/tokens');
      expect(store.getState().navScrollVisible).toBe(true);
      expect(store.getState().navScrollProgress).toBe(0);
    });

    it('resets navAcrylicHovered on syncRoute', () => {
      store.getState().setNavAcrylicHovered(true);
      store.getState().syncRoute('/hds/tokens');
      expect(store.getState().navAcrylicHovered).toBe(false);
    });
  });

  describe('reset — slice namespace rebuild', () => {
    it('rebuilds all slice namespaces on reset', () => {
      store.getState().setUniforms({ tubeRadius: 0.99, fluidEnabled: false });
      store.getState().reset();
      const s = store.getState();
      expect(s.geometry.tubeRadius).toBe(MOBIUS_DEFAULTS.tubeRadius);
      expect(s.interaction.fluidEnabled).toBe(MOBIUS_DEFAULTS.fluidEnabled);
    });

    it('reset sets activePreset back to home', () => {
      store.getState().setPreset('tokens');
      store.getState().reset();
      expect(store.getState().activePreset).toBe('home');
    });

    it('reset sets navScrollProgress back to 0', () => {
      store.getState().setNavScrollProgress(0.7);
      store.getState().reset();
      expect(store.getState().navScrollProgress).toBe(0);
    });
  });

  describe('slice namespace consistency', () => {
    it('setUniforms keeps geometry slice in sync with flat fields', () => {
      store.getState().setUniforms({ tubeRadius: 0.42, pathRadius: 0.55 });
      const s = store.getState();
      expect(s.geometry.tubeRadius).toBe(0.42);
      expect(s.geometry.pathRadius).toBe(0.55);
      // flat fields also updated
      expect(s.tubeRadius).toBe(0.42);
    });

    it('setUniforms keeps material slice in sync', () => {
      store.getState().setUniforms({ wireframe: true, roughness: 0.1 });
      const s = store.getState();
      expect(s.material.wireframe).toBe(true);
      expect(s.material.roughness).toBe(0.1);
    });

    it('setUniforms keeps motion slice in sync', () => {
      store.getState().setUniforms({ bloomIntensity: 0.99, rotationSpeed: 2.5 });
      const s = store.getState();
      expect(s.motion.bloomIntensity).toBe(0.99);
      expect(s.motion.rotationSpeed).toBe(2.5);
    });

    it('setUniforms keeps interaction slice in sync', () => {
      store.getState().setUniforms({ fluidEnabled: false, distortionMode: 'organic' });
      const s = store.getState();
      expect(s.interaction.fluidEnabled).toBe(false);
      expect(s.interaction.distortionMode).toBe('organic');
    });
  });

  describe('all standard presets can be applied', () => {
    const presetKeys = [
      'home',
      'tokens',
      'foundations',
      'components',
      'content',
      'hirobius',
      'glitch',
    ] as const;
    for (const key of presetKeys) {
      it(`setPreset("${key}") sets activePreset correctly`, () => {
        const s2 = createMobiusStore();
        s2.getState().setPreset(key);
        expect(s2.getState().activePreset).toBe(key);
      });
    }
  });
});
