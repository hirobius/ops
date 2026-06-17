/**
 * Storybook 8 global preview — wraps every story with HDS providers and styles.
 */
import type { Preview } from "@storybook/react";
import React from "react";
import { ThemeProvider } from "../src/app/context/ThemeContext";
import "../src/styles/index.css";

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // Run axe-core on every story automatically.
      config: {},
    },
  },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <div style={{ padding: "24px", minHeight: "100vh" }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
};

export default preview;
