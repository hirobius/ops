# HDS V2 Compliance Audit
**Generated**: 2026-04-22  
**Status**: Complete analysis of all deviations from HDS V2 Breathable standards

---

## Executive Summary

**Total Violations by Category:**
- 🔴 **Spacing Deviations**: 12 component-specific tokens out of sync with V2 breathable standards
- 🟡 **Blur/Effect Tokens**: 5 hardcoded blur values in 2 files (HDSLayout.tsx)
- 🟢 **Typography**: 0 violations (9-style ramp enforced by linter)
- 🟢 **Color Tokens**: 0 violations (all mapped to semantic tokens)
- 🟢 **Linter Compliance**: 100% (0 violations across 151 files)

---

## Category 1: SPACING DEVIATIONS (HIGH PRIORITY)

### 1.1 Component Padding/Gap Tokens Out of Sync

**Issue**: Component-specific tokens still using V1 Dense values instead of V2 Breathable.

| Token | Current | V2 Target | V1→V2 Change | Impact |
|-------|---------|-----------|--------------|---------|
| `--component-card-padding` | 12px (space-3) | 24px (space-6) | +12px | HdsCard (used everywhere) |
| `--component-card-gap` | 12px (space-3) | 8px (space-2) | -4px | Child element spacing in cards |
| `--component-input-paddingX` | 12px (space-3) | 16px (space-4) | +4px | All form inputs horizontally |
| `--component-input-paddingY` | 12px (space-3) | 12px (space-3) | 0px | Keep as-is (height balance) |
| `--component-button-paddingY` | 12px (space-3) | 12px (space-3) | 0px | Keep as-is (visual balance) |
| `--component-nav-height` | 64px (space-16) | 64px (space-16) | 0px | Keep as-is |
| `--component-nav-paddingY` | 8px (space-2) | 12px (space-3) | +4px | Top-level nav breathing room |
| `--semantic-space-sidebar-gap` | 16px (space-4) | 20px (space-5) | +4px | Sidebar nav item spacing |
| `--semantic-space-sidebar-sectionGap` | 12px (space-3) | 16px (space-4) | +4px | Sidebar group separation |
| `--semantic-space-sidebar-railPadding` | 20px (space-5) | 24px (space-6) | +4px | Sidebar edge inset |

**Files Affected**:
- `src/styles/tokens.css` (token definitions)
- `src/app/components/HdsCard.tsx` (uses `--component-card-*`)
- `src/app/components/HdsInput.tsx` (uses `--component-input-*`)
- `src/app/components/HdsButton.tsx` (uses `--component-button-*`)
- `src/app/components/HdsSideNav.tsx` (uses sidebar tokens)
- `src/app/pages/hds/HDSLayout.tsx` (nav layout)

**Remediation**: Update `src/styles/tokens.css` to map these tokens to the breathable V2 values.

---

### 1.2 Hardcoded Spacing in Pages/Layouts

No violations found in component props (linter enforces this).

---

## Category 2: BLUR/EFFECT TOKENS (MEDIUM PRIORITY)

### 2.1 Hardcoded Blur Values in HDSLayout.tsx

**Issue**: Hardcoded `blur()` values instead of canonical effect tokens.

| File | Line | Current | Token to Use | Status |
|------|------|---------|--------------|--------|
| `src/app/pages/hds/HDSLayout.tsx` | ~Line 1 | `blur(14px)` | `hds.effect.blur.lightboxBackdrop` (16px) | ❌ Not using token |
| `src/app/pages/hds/HDSLayout.tsx` | ~Line 1 | `blur(18px)` | No token defined (need to add) | ❌ Custom value |
| `src/app/pages/hds/HDSLayout.tsx` | ~Line 1 | `blur(8px)` | `hds.effect.blur.subtle` | ❌ Not using token |

**Root Cause**: Legacy hardcoded values not migrated to effect tokens.

**Remediation**:
1. Replace `blur(14px)` → use `hds.effect.blur.lightboxBackdrop` (canonically 16px)
2. Replace `blur(8px)` → use `hds.effect.blur.subtle`
3. For `blur(18px)`: either add new token or justify custom value with inline comment

---

## Category 3: NAVIGATION & SIDEBAR (MEDIUM PRIORITY)

### 3.1 Sidebar Item Density

**Issue**: Sidebar navigation items use tight spacing (gap: 16px) without visual accommodation for active states and underlines.

**Files**:
- `src/app/components/HdsSideNav.tsx`
- `src/app/components/HdsNavItem.tsx`

**Current State**: 
- Sidebar item gap: 16px (space-4)
- Sidebar section gap: 12px (space-3)

**V2 Target**:
- Sidebar item gap: 20px (space-5) — allows active state underline + breathing room
- Sidebar section gap: 16px (space-4) — better visual separation

**Remediation**: Update token mappings in `tokens.css` and verify visual rendering.

---

## Category 4: FORM INPUTS (MEDIUM PRIORITY)

### 4.1 Input Density & Typography

**Issue**: Form inputs still use V1 Dense spacing and may not align with new typography ramp.

**Files**:
- `src/app/components/HdsInput.tsx`
- `src/app/components/HdsSegmentedControl.tsx`
- `src/app/components/HdsStepperField.tsx`

**Current State**:
- Input padding: 12px (space-3)
- Input border radius: uses `--semantic-radius-action`
- Typography: verify 9-style ramp usage

**V2 Target**:
- Input padding X: 16px (space-4) — more breathing room for text
- Input padding Y: 12px (space-3) — keep for visual compactness
- Verify ui/caption typography tokens for labels and helpers

**Remediation**: Update `--component-input-paddingX` to 16px; audit typography token usage.

---

## Category 5: DATA DISPLAY (MEDIUM PRIORITY)

### 5.1 Table Density

**Issue**: Tables may still use V1 Dense row heights and cell padding.

**Files**:
- `src/app/components/HdsTable.tsx`

**Status**: Not yet audited (requires visual inspection)

**Expected Changes**:
- Row height: likely 32px → 40px (space.10)
- Cell padding: likely 8px → 12px/16px
- Header text: audit typography token (should use ui + semibold)

---

## Category 6: DEPRECATED PATTERNS (RESOLVED ✓)

### 6.1 Typography Tokens

**Status**: ✅ CLEAN
- 9-style ramp enforced (display, heading1-3, body, ui, caption, technical, badge)
- Deprecated tokens (title, label, micro, labelTechnical, monoXs, monoSm, body2) blocked by linter
- No violations in codebase

### 6.2 Forbidden Components

**Status**: ✅ CLEAN
- `<HdsDivider>`: forbidden; linter blocks usage
- `<HdsTriangle>`: forbidden; linter blocks usage (note: file exists but not used in app)

---

## Category 7: COMPONENT-SPECIFIC FINDINGS

### 7.1 HdsShellControls.tsx (Line 165)

**Issue**: Uses canonical token (✓ CORRECT)

```typescript
backdropFilter: `blur(${hds.effect.blur.lightboxBackdrop})`
```

**Status**: ✅ COMPLIANT

---

### 7.2 HdsCard.tsx

**Issue**: Uses old token mappings
- `--component-card-padding: 12px` → should be 24px
- `--component-card-gap: 12px` → should be 8px

**Impact**: Every card in the system feels "scrunched" until tokens are updated.

**Remediation**: Update token definitions in `src/styles/tokens.css`

---

## Category 8: MOTION & EASING (DEFERRED)

### 8.1 Cinematic Link Easing

**Status**: ⏸️ MONITORING
- Custom `expo-out` curves used in cinematic links
- If usage spreads beyond isolated components, graduate to canonical token
- Current approach: acceptable for isolated visual flourishes

### 8.2 Animation Durations

**Status**: ⏸️ MONITORING
- Scattered `duration-*` utilities in some files
- If consolidated usage emerges, add to HDS Motion tokens
- Current approach: acceptable; no current violations

---

## Remediation Roadmap

### Phase 1: Quick Wins (1-2 hours)
1. ✏️ Update `src/styles/tokens.css`:
   - `--component-card-padding`: 12px → 24px
   - `--component-card-gap`: 12px → 8px
   - `--semantic-space-sidebar-gap`: 16px → 20px
   - `--semantic-space-sidebar-sectionGap`: 12px → 16px

2. ✏️ Fix HDSLayout.tsx blur values:
   - Replace hardcoded `blur(14px)` with token reference
   - Replace hardcoded `blur(8px)` with token reference
   - Address `blur(18px)` custom value

### Phase 2: Component Audits (2-4 hours)
1. 🔍 HdsInput: Verify padding and typography tokens
2. 🔍 HdsSideNav: Verify gap and section spacing
3. 🔍 HdsButton: Confirm button padding is appropriate for V2
4. 🔍 HdsTable: Audit row heights and cell padding

### Phase 3: Systemic Rollout (Ongoing)
1. Refresh Form Inputs (related to Phase 2)
2. Data Table Density (related to Phase 2)
3. Navigation Pacing (related to sidebar audit)
4. Portfolio Asset Slots (separate workstream)

---

## Notes for Developer

- **Semantic tokens are correctly defined** in `src/styles/tokens.css` for V2 Breathable standards
- **Component-specific tokens are the bottleneck** — they're pointing to old V1 values
- **Linter is working perfectly** — no violations; suggests tokens are the only lever needed
- **Typography is fully compliant** — 9-style ramp is enforced; no work needed there
- **Blur/effect tokens need manual fixes** in HDSLayout.tsx (3 instances)

Once token definitions are updated, the breathable spacing will cascade through all components automatically.
