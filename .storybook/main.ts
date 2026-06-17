/**
 * Storybook 8 configuration for the Hirobius Design System (HDS).
 *
 * Tool selection ledger (12n-api-storybook-setup):
 *   - Storybook 8 selected over Histoire and Ladle per Adrian directive 2026-05-02.
 *   - Reason: largest ecosystem, first-class a11y addon, visual-regression
 *     integration via Chromatic, MDX support for docs pages, and long-term
 *     roadmap alignment with the HDS public API surface.
 *   - Histoire rejected: Vue-first origin, thin React adapter, narrower addon
 *     ecosystem.
 *   - Ladle rejected: fastest setup but lacks a11y addon, MDX docs, and
 *     Chromatic integration — all required for the 29-primitive external API.
 */
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/stories/**/*.stories.@(ts|tsx)", "../src/stories/**/*.mdx"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-a11y",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  docs: {
    autodocs: "tag",
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) =>
        prop.parent ? !/node_modules/.test(prop.parent.fileName) : true,
    },
  },
};

export default config;
