# Rebuild Manifest

Lead Architect dependency order for rewriting the app to comply with `CLAUDE.md` and `hds-recipes.md`.

Stop condition: do not write component implementation code until this manifest is approved.

## 1. Primitives

- [ ] `src/app/components/HdsIcon.tsx`
- [ ] `src/app/components/HdsInlineCode.tsx`
- [ ] `src/app/components/HdsToken.tsx`
- [ ] `src/app/components/HdsAnimatedLabel.tsx`
- [ ] `src/app/components/CascadeText.tsx`
- [ ] `src/app/components/HdsMobiusLogo.tsx`
- [ ] `src/app/components/HdsMobiusScene.tsx`
- [ ] `src/app/components/HdsMobiusShellLayer.tsx`
- [ ] `src/app/components/HdsTriangle.tsx`
- [ ] `src/app/components/hooks.ts`
- [ ] `src/app/components/types.ts`
- [ ] `src/app/components/tokenTableUtils.ts`
- [ ] `src/app/components/propTableUtils.tsx`

## 2. Foundational Controls And Surfaces

- [ ] `src/app/components/HdsStack.tsx`
- [ ] `src/app/components/HdsCard.tsx`
- [ ] `src/app/components/HdsButton.tsx`
- [ ] `src/app/components/HdsIconButton.tsx`
- [ ] `src/app/components/HdsButtonGroup.tsx`
- [ ] `src/app/components/HdsInput.tsx`
- [ ] `src/app/components/HdsControls.tsx`
- [ ] `src/app/components/HdsStepperField.tsx`
- [ ] `src/app/components/HdsSegmentedControl.tsx`
- [ ] `src/app/components/HdsDisclosure.tsx`
- [ ] `src/app/components/HdsBadge.tsx`
- [ ] `src/app/components/HdsTag.tsx`
- [ ] `src/app/components/HdsAlert.tsx`
- [ ] `src/app/components/HdsInlineLink.tsx`
- [ ] `src/app/components/HdsCinematicLink.tsx`
- [ ] `src/app/components/HdsDivider.tsx` - remove from layout usage; keep only if retained as deprecated compatibility.

## 3. Complex Components

- [ ] `src/app/components/HdsActivityFeed.tsx`
- [ ] `src/app/components/HdsAssetImg.tsx`
- [ ] `src/app/components/HdsCodeBlock.tsx`
- [ ] `src/app/components/HdsComponentInstanceMatrix.tsx`
- [ ] `src/app/components/HdsComponentPreview.tsx`
- [ ] `src/app/components/HdsControlsPanel.tsx`
- [ ] `src/app/components/HdsDocLinkCard.tsx`
- [ ] `src/app/components/HdsErrorPattern.tsx`
- [ ] `src/app/components/HdsFoundationSwatch.tsx`
- [ ] `src/app/components/HdsHistoryCard.tsx`
- [ ] `src/app/components/HdsImageLightbox.tsx`
- [ ] `src/app/components/HdsInfoPage.tsx`
- [ ] `src/app/components/HdsMorphCard.tsx`
- [ ] `src/app/components/HdsNavGroup.tsx`
- [ ] `src/app/components/HdsNavItem.tsx`
- [ ] `src/app/components/HdsNotFoundPattern.tsx`
- [ ] `src/app/components/HdsPreviewFrame.tsx`
- [ ] `src/app/components/HdsShellControls.tsx`
- [ ] `src/app/components/HdsSideNav.tsx`
- [ ] `src/app/components/HdsSpecimenBlock.tsx`
- [ ] `src/app/components/HdsTable.tsx`
- [ ] `src/app/components/HdsTextLockup.tsx`
- [ ] `src/app/components/HdsTooltip.tsx`
- [ ] `src/app/components/HdsVariantPreviewDeck.tsx`
- [ ] `src/app/components/TokenDisplayToggle.tsx`
- [ ] `src/app/components/componentPreviewRegistry.tsx`

## 4. Documentation Components

- [ ] `src/app/components/CategoryComponentDocs.tsx`
- [ ] `src/app/components/ComponentDocPage.tsx`
- [ ] `src/app/components/DocPageFooterNote.tsx`
- [ ] `src/app/components/DocPageSpec.tsx`
- [ ] `src/app/components/HDSDocSections.tsx`
- [ ] `src/app/components/lab/HdsLegacyTokenDetail.tsx`
- [ ] `src/app/components/lab/HdsLegacyTokenList.tsx`
- [ ] `src/app/components/lab/HdsTokenCollectionList.tsx`
- [ ] `src/app/components/lab/HdsTokenDetail.tsx`
- [ ] `src/app/components/lab/HdsTokenList.tsx`
- [ ] `src/app/components/lab/tokenUtils.ts`

## 5. Layouts

- [ ] `src/app/pages/hds/HDSLayout.tsx`
- [ ] `src/app/pages/sketches/SketchbookShell.tsx`
- [ ] `src/app/pages/sketches/private/BoidsFlockingLayout.tsx`
- [ ] `src/app/pages/sketches/private/CombatArenaLayout.tsx`
- [ ] `src/app/pages/sketches/private/ConstellationDrawerLayout.tsx`
- [ ] `src/app/pages/sketches/private/CyberpunkGridLayout.tsx`
- [ ] `src/app/pages/sketches/private/ElasticNodesLayout.tsx`
- [ ] `src/app/pages/sketches/private/ElasticTextLayout.tsx`
- [ ] `src/app/pages/sketches/private/GalleryWallLayout.tsx`
- [ ] `src/app/pages/sketches/private/MagneticGridLayout.tsx`
- [ ] `src/app/pages/sketches/private/MagneticParticlesLayout.tsx`
- [ ] `src/app/pages/sketches/private/MagneticTextLayout.tsx`
- [ ] `src/app/pages/sketches/private/MeshDeformationLayout.tsx`
- [ ] `src/app/pages/sketches/private/MetaballsLayout.tsx`
- [ ] `src/app/pages/sketches/private/ParticleSandboxLayout.tsx`
- [ ] `src/app/pages/sketches/private/PhysicsPlaygroundLayout.tsx`
- [ ] `src/app/pages/sketches/private/RigidBodyLayout.tsx`
- [ ] `src/app/pages/sketches/private/RippleDistortionLayout.tsx`
- [ ] `src/app/pages/sketches/private/SandPhysicsLayout.tsx`
- [ ] `src/app/pages/sketches/private/ShapeExplorerLayout.tsx`
- [ ] `src/app/pages/sketches/private/SoftBodyLayout.tsx`
- [ ] `src/app/pages/sketches/private/SwarmAvoidanceLayout.tsx`
- [ ] `src/app/pages/sketches/private/VerletRopeLayout.tsx`
- [ ] `src/app/pages/sketches/private/WaveBackgroundLayout.tsx`
- [ ] `src/app/pages/sketches/imported/ClothSimulationLayout.tsx`
- [ ] `src/app/pages/sketches/imported/canvasStage.ts`
- [ ] `src/app/pages/sketches/imported/sceneTheme.ts`
- [ ] `src/app/pages/sketches/imported/shapeExplorerPresets.ts`

## 6. App And Error Pages

- [ ] `src/app/pages/ErrorPage.tsx`
- [ ] `src/app/pages/InfoPageWrapper.tsx`
- [ ] `src/app/pages/LegacyWorkRedirectPage.tsx`
- [ ] `src/app/pages/NotFoundPage.tsx`
- [ ] `src/app/pages/SketchPage.tsx`

## 7. HDS Foundation Pages

- [ ] `src/app/pages/hds/ArchitectureSnapshotPage.tsx`
- [ ] `src/app/pages/hds/BreakpointsPage.tsx`
- [ ] `src/app/pages/hds/ColorPage.tsx`
- [ ] `src/app/pages/hds/ElevationPage.tsx`
- [ ] `src/app/pages/hds/GettingStartedPage.tsx`
- [ ] `src/app/pages/hds/GuidancePage.tsx`
- [ ] `src/app/pages/hds/HdsDocPrimitives.tsx`
- [ ] `src/app/pages/hds/HdsTocContext.tsx`
- [ ] `src/app/pages/hds/IconsPage.tsx`
- [ ] `src/app/pages/hds/LegacyTokenExplorerPanel.tsx`
- [ ] `src/app/pages/hds/LicensePage.tsx`
- [ ] `src/app/pages/hds/MotionPage.tsx`
- [ ] `src/app/pages/hds/OverviewPage.tsx`
- [ ] `src/app/pages/hds/PhaseProgressPanel.tsx`
- [ ] `src/app/pages/hds/ShapePage.tsx`
- [ ] `src/app/pages/hds/SpacingPage.tsx`
- [ ] `src/app/pages/hds/SpacingTestPage.tsx`
- [ ] `src/app/pages/hds/TechStackPage.tsx`
- [ ] `src/app/pages/hds/TokenCascadeDiagram.tsx`
- [ ] `src/app/pages/hds/TokensPage.tsx`
- [ ] `src/app/pages/hds/TypographyPage.tsx`
- [ ] `src/app/pages/hds/TypographyTestPage.tsx`

## 8. HDS Component Pages

- [ ] `src/app/pages/hds/components/ActionsPage.tsx`
- [ ] `src/app/pages/hds/components/DisplayPage.tsx`
- [ ] `src/app/pages/hds/components/DocUtilitiesPage.tsx`
- [ ] `src/app/pages/hds/components/FeedbackPage.tsx`
- [ ] `src/app/pages/hds/components/IconGallery.tsx`
- [ ] `src/app/pages/hds/components/InputsPage.tsx`
- [ ] `src/app/pages/hds/components/LayoutPage.tsx`
- [ ] `src/app/pages/hds/components/NavigationPage.tsx`

## 9. Portfolio Pages

- [ ] `src/app/pages/hds/HirobiusCaseStudyPage.tsx`
- [ ] `src/app/pages/hds/MicrosoftDesignSystemsPage.tsx`
- [ ] `src/app/pages/hds/MicrosoftDSCaseStudyPage.tsx`
- [ ] `src/app/pages/hds/PortfolioAssetSlot.tsx`
- [ ] `src/app/pages/hds/PortfolioDraftPage.tsx`
- [ ] `src/app/pages/hds/PortfolioHomePage.tsx`
- [ ] `src/app/pages/hds/PrimaryCaseStudyPage.tsx`
- [ ] `src/app/pages/hds/VisualsPage.tsx`

## 10. Sketch Pages

- [ ] `src/app/pages/sketches/ImportedSketchRoute.tsx`
- [ ] `src/app/pages/sketches/KineticTypePage.tsx`
- [ ] `src/app/pages/sketches/LogoLabSketch.tsx`
- [ ] `src/app/pages/sketches/MorphTilesPage.tsx`
- [ ] `src/app/pages/sketches/ParticleTunnelPage.tsx`
- [ ] `src/app/pages/sketches/SketchErrorBoundary.tsx`
- [ ] `src/app/pages/sketches/SketchbookIndexPage.tsx`
- [ ] `src/app/pages/sketches/ThreeScenePage.tsx`
- [ ] `src/app/pages/sketches/components/CopyCodeButton.tsx`
- [ ] `src/app/pages/sketches/context/TokenContext.tsx`
- [ ] `src/app/pages/sketches/sketches.ts`
